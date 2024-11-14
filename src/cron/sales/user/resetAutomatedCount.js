// Utils
const logger = require('../../../utils/winston');
const {
  SETTING_TYPES,
} = require('../../../../../Cadence-Brain/src/utils/enums');

// Repositories
const EmailSettingsRepository = require('../../../../../Cadence-Brain/src/repository/email-settings.repository');
const UserTaskRepository = require('../../../../../Cadence-Brain/src/repository/user-tasks.repository');

// Helper and Services
const RedisHelper = require('../../../../../Cadence-Brain/src/helper/redis');
const UserHelper = require('../../../../../Cadence-Brain/src/helper/user');
const {
  REDIS_ADDED_USER_IDS_FOR_MAIL,
  REDIS_ADDED_USER_IDS_FOR_MESSAGE,
} = require('../../../../../Cadence-Brain/src/utils/constants');

const resetAutomationsCount = async () => {
  try {
    logger.info(`Running reset automations cron...`);
    // * Fetch all user tasks
    const [userTasks, errForUserTasks] = await UserTaskRepository.getUserTasks(
      {}
    );

    if (errForUserTasks) return;

    // * loop for userTasks
    for (let userTask of userTasks) {
      // * retreive user
      const user = userTask.User;

      if (!user) {
        logger.info(`No user found for userTask: ${userTask.user_task_id}.`);
        continue;
      }

      if (!user.timezone) {
        logger.info(
          `No timezone selected for user: ${user.first_name} ${user.last_name}.`
        );
        continue;
      }

      if (!user.company_id) {
        logger.info(`User is not associated to any company.`);
        continue;
      }

      // * If company's email settings not already fetched.
      const [setting, errForSetting] = await UserHelper.getSettingsForUser({
        user_id: user.user_id,
        setting_type: SETTING_TYPES.AUTOMATED_TASK_SETTINGS,
      });

      if (errForSetting) {
        logger.error(
          `Error while fetching email settings for user.`,
          errForSetting
        );
        continue;
      }
      if (!setting) {
        logger.info(
          `Email setting not found for company id ${user.company_id}.`
        );
        continue;
      }
      const emailSetting = setting.Automated_Task_Setting;

      let { start_hour, end_hour } = emailSetting;

      let start_time = start_hour.split(':');
      let end_time = end_hour.split(':');

      if (start_time.length !== 2) {
        logger.info(start_time);
        logger.info(`Error while calculating start_time for user.`);
        continue;
      }

      if (end_time.length !== 2) {
        logger.info(end_time);
        logger.info(`Error while calculating end_time for user.`);
        continue;
      }

      // * Calculate all times for user's time zone

      // * time for 12 midnight user timezone
      // const timeRangeLowerBound = new Date(
      //   new Date().toLocaleString('en-US', { timeZone: user.timezone })
      // ).setHours(start_time[0], start_time[1], 0, 0);

      let timeRangeHigherBound = UserHelper.setHoursForTimezone(
        parseInt(start_time[0]),
        new Date().getTime(),
        user.timezone
      );

      // * add minutes
      timeRangeHigherBound =
        timeRangeHigherBound + parseInt(start_time[1]) * 60 * 1000;

      const timeRangeLowerBound = timeRangeHigherBound - 30 * 60 * 1000; // * 30 mins less than higher bound

      // * curr time for user timezone
      // const currentTime = new Date(
      //   new Date().toLocaleString('en-US', { timeZone: user.timezone })
      // ).getTime();

      const currentTime = new Date().getTime();

      // * If current time is in timeRange bound
      if (
        currentTime >= timeRangeLowerBound &&
        currentTime <= timeRangeHigherBound
      ) {
        logger.info(`Resetting count for ${user.user_id}.`);
        // * Reset count
        await UserTaskRepository.updateUserTask(
          { user_id: user.user_id },
          {
            automated_messages_sent_per_day: 0,
            automated_mails_sent_per_day: 0,
          }
        );

        // * remove from redis user_ids
        await RedisHelper.removeUsers(
          [user.user_id],
          REDIS_ADDED_USER_IDS_FOR_MAIL
        );
        await RedisHelper.removeUsers(
          [user.user_id],
          REDIS_ADDED_USER_IDS_FOR_MESSAGE
        );
      }
    }
  } catch (err) {
    logger.error(`Error while reseting automations count: ${err.message}.`);
  }
};

//resetAutomationsCount();

module.exports = resetAutomationsCount;
