// Utils
const logger = require('../../utils/winston');
const {
  LEADERBOARD_DATE_FILTERS,
  NODE_TYPES,
  CADENCE_STATUS,
  LEAD_STATUS,
  CADENCE_LEAD_STATUS,
  CUSTOM_TASK_NODE_ID,
  AUTOMATED_NODE_TYPES_ARRAY,
} = require('../../../../Cadence-Brain/src/utils/enums');
const {
  REDIS_EMPTY_STATS_COMPANY,
} = require('../../../../Cadence-Brain/src/utils/constants');

const { DB_TABLES } = require('../../../../Cadence-Brain/src/utils/modelEnums');

// Packages
const { Op } = require('sequelize');
const { sequelize } = require('../../../../Cadence-Brain/src/db/models');

// Repositories
const Repository = require('../../../../Cadence-Brain/src/repository');

// Helpers and services
const LeaderboardHelper = require('../../../../Cadence-Brain/src/helper/leaderboard');
const RedisHelper = require('../../../../Cadence-Brain/src/helper/redis');
const StatisticsHelper = require('../../../../Cadence-Brain/src/helper/statistics');

const recalculate = async () => {
  try {
    const [uniqueTimezones, errForTimezones] = await Repository.fetchAll({
      tableName: DB_TABLES.USER,
      query: {},
      extras: {
        group: ['timezone', 'company_id'],
      },
    });
    if (errForTimezones)
      logger.error(`Error while fetching unique timezones: `, errForTimezones);

    let usersToProcess = [];

    for (let user of uniqueTimezones) {
      // Set the timezone

      let timeZone = user.timezone;
      if (user.timezone == null || user.timezone == '')
        timeZone = 'Asia/Kolkata';

      // Get the current date and time in the specified timezone
      const now = new Date().toLocaleString('en-US', { timeZone });

      // Create a new date object using the current date and time in the specified timezone
      const date = new Date(now);

      // Check if the calculated stats are of same day if not then push to calculate array
      const [storedStats, errForStoredStats] = await Repository.fetchOne({
        tableName: DB_TABLES.STATISTICS_STORE,
        query: {
          company_id: user.company_id,
          timezone: user.timezone,
        },
        extras: {},
      });
      if (errForStoredStats) {
        logger.error(
          `Error while fetching stored statistics for company_id : ${user.company_id} and tz: ${user.timezone} `
        );
        continue;
      }

      if (!storedStats) {
        usersToProcess.push(user);
        continue;
      }

      const createdAt = new Date(storedStats.created_at).toLocaleString(
        'en-US',
        { timeZone }
      );

      const createdDate = new Date(createdAt);

      // Recalculate conditions
      // Stats were created on different day
      // Stats are older than 12h
      // Day has ended for user's timezone
      if (
        createdDate.getDate() !== date.getDate() ||
        Math.abs(date - createdDate) / 36e5 > 12 ||
        date.getHours() === 0 ||
        new Date(storedStats.created_at).getDate() !== date.getDate()
      )
        usersToProcess.push(user);
    }

    for (let user of usersToProcess) {
      // Destroy data for user
      if (!user.timezone) user.timezone = 'Asia/Kolkata';
      if (!user.company_id) continue;

      logger.info(
        `Recalculating for company_id: ${user.company_id} timezone: ${user.timezone}`
      );

      // Find if empty stats for company
      const [cachedCompany, errForCache] = await RedisHelper.getValue(
        REDIS_EMPTY_STATS_COMPANY + '-' + user.company_id
      );
      if (errForCache) logger.error(`Error while getting cache: `, errForCache);

      if (cachedCompany == 'true') {
        logger.info('Present in cache: Empty company -> Skipping ');
        continue;
      }

      let toCache = true;

      const [deleteOldStats, errForDelete] = await Repository.destroy({
        tableName: DB_TABLES.STATISTICS_STORE,
        query: {
          company_id: user.company_id,
          timezone: user.timezone,
        },
      });
      if (errForDelete) {
        logger.error(
          `Error while deleting old data for ${user.company_id}, ${user.timeZone}: `,
          errForDelete
        );
        continue;
      }

      const [deleteOldStatusStats, errForStatusDelete] =
        await Repository.destroy({
          tableName: DB_TABLES.STATISTICS_STATUS_STORE,
          query: {
            company_id: user.company_id,
            timezone: user.timezone,
          },
        });
      if (errForStatusDelete) {
        logger.error(
          `Error while deleting old status data for ${user.company_id}, ${user.timeZone}: `,
          errForStatusDelete
        );
        continue;
      }

      for (const timeFrame in LEADERBOARD_DATE_FILTERS) {
        if (
          [
            LEADERBOARD_DATE_FILTERS.TODAY,
            LEADERBOARD_DATE_FILTERS.YESTERDAY,
            LEADERBOARD_DATE_FILTERS.LAST_3_MONTHS,
            LEADERBOARD_DATE_FILTERS.LAST_6_MONTHS,
          ].includes(LEADERBOARD_DATE_FILTERS[timeFrame])
        )
          continue;

        let dateRange = LeaderboardHelper.dateFilters[
          LEADERBOARD_DATE_FILTERS[timeFrame]
        ](user.timezone);

        let [start_date, end_date] = dateRange;

        if (
          [
            LEADERBOARD_DATE_FILTERS.THIS_MONTH,
            LEADERBOARD_DATE_FILTERS.THIS_WEEK,
          ].includes(LEADERBOARD_DATE_FILTERS[timeFrame])
        ) {
          dateRange = LeaderboardHelper.dateFilters[
            LEADERBOARD_DATE_FILTERS.YESTERDAY
          ](user.timezone);

          end_date = dateRange[1];
        }

        const taskPromise = StatisticsHelper.getTaskArrayForTable({
          company_id: user.company_id,
          start_time: start_date,
          end_time: end_date,
        });

        const statusPromise = StatisticsHelper.getStatusArrayForTable({
          company_id: user.company_id,
          start_time: start_date,
          end_time: end_date,
        });

        const [[tasks, errForTasks], [statusCount, errForStatusCount]] =
          await Promise.all([taskPromise, statusPromise]);

        if (errForTasks || errForStatusCount) {
          logger.error(
            `Error while fetching data from database: `,
            errForTasks || errForStatusCount
          );
          continue;
        }

        let taskArray = [],
          statusArray = [];

        for (let task of tasks) {
          taskArray.push({
            timeframe: LEADERBOARD_DATE_FILTERS[timeFrame],
            timezone: user.timezone,
            completed_count: task.completed_task_count,
            skipped_count: task.skipped_task_count,
            pending_count: task.pending_task_count,
            cadence_id: task.cadence_id,
            company_id: user.company_id,
            user_id: task.user_id,
            active_lead_count: task.active_lead_count,
            node_type: task.node_type,

            automated_completed_count: AUTOMATED_NODE_TYPES_ARRAY.includes(
              task.node_type
            )
              ? task.automated_task_count
              : 0,

            cadence_data: {
              cadence_id: task.cadence_id,
              name: task.cadence_name,
              node_length: task.total_nodes,
            },
            user_data: {
              total_leads_in_cadence: task.total_leads,
              user_id: task.user_id,
              user_first_name: task.first_name,
              user_last_name: task.last_name,
              user_profile_picture: `https://storage.googleapis.com/apt-cubist-307713.appspot.com/crm/profile-images/${task.user_id}`,
              is_profile_picture_present: task.is_profile_picture_present,
              sub_department: task.sd_name,
            },
          });
        }

        for (let status of statusCount) {
          statusArray.push({
            timeframe: LEADERBOARD_DATE_FILTERS[timeFrame],
            timezone: user.timezone,
            converted_count: parseInt(status.converted_count, 10),
            disqualified_count: parseInt(status.disqualified_count, 10),

            cadence_id: status.cadence_id,
            company_id: user.company_id,
            user_id: status.user_id,

            cadence_data: {
              cadence_id: status.cadence_id,
              name: status.cadence_name,
              node_length: status.total_nodes,
            },
            user_data: {
              total_leads_in_cadence: status.total_leads,
              user_id: status.user_id,
              user_first_name: status.first_name,
              user_last_name: status.last_name,
              user_profile_picture: `https://storage.googleapis.com/apt-cubist-307713.appspot.com/crm/profile-images/${status.user_id}`,
              is_profile_picture_present: status.is_profile_picture_present,
              sub_department: status.sd_name,
            },
          });
        }

        // Dont Cache company for non empty stats
        if (taskArray.length != 0) toCache = false;

        const [statsStore, errForStore] = await Repository.bulkCreate({
          tableName: DB_TABLES.STATISTICS_STORE,
          createObject: taskArray,
        });
        if (errForStore)
          logger.error(`Error while table store creation: `, errForStore);

        const [statsStatusStore, errForStatusStore] =
          await Repository.bulkCreate({
            tableName: DB_TABLES.STATISTICS_STATUS_STORE,
            createObject: statusArray,
          });
        if (errForStatusStore)
          logger.error(`Error while status creation: `, errForStore);
      }

      if (toCache) {
        logger.info(`Caching company_id`);
        const now = new Date().toLocaleString('en-US', {
          timeZone: user.timezone,
        });

        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        const timeDifference = endOfDay.getTime() - new Date(now).getTime();

        const [redisStatus, redisError] = await RedisHelper.setWithExpiry(
          REDIS_EMPTY_STATS_COMPANY + '-' + user.company_id,
          'true',
          timeDifference / 1000
        );
        if (redisError) logger.error(`Failed to update in redis.`);
      }
    }

    logger.info('Calculated stats.');
  } catch (err) {
    logger.error('Error while calculating statistics: ', err);
    console.log(err);
  }
};

module.exports = recalculate;
