// Utils
const logger = require('../../utils/winston');
const {
  NODE_ENV,
} = require('../../../../Cadence-Brain/src/utils/config');
const { DB_TABLES } = require('../../../../Cadence-Brain/src/utils/modelEnums');
const {
  HIRING_INTEGRATIONS,
} = require('../../../../Cadence-Brain/src/utils/enums');
const {
  getDataFromWebhook,
} = require('../../../../Cadence-Brain/src/grpc/v2/hiring-integration');
const bullhornService = require('../../../../Cadence-Brain/src//services/Bullhorn');
const AccessTokenHelper = require('../../../../Cadence-Brain/src/helper/access-token');
const CompanyFieldMapHelper = require('../../../../Cadence-Brain/src/helper/company-field-map');
const {
  bullhornController,
} = require('../../../../Cadence-Brain/src/helper/sync');

// Packages
const { Op } = require('sequelize');

// Repositories
const Repository = require('../../../../Cadence-Brain/src/repository');

const syncData = async () => {
  try {
    const [crmAdmins, errCrmAdmin] = await Repository.fetchAll({
      tableName: DB_TABLES.COMPANY,
      query: {
        integration_type: HIRING_INTEGRATIONS.BULLHORN,
      },
      include: {
        [DB_TABLES.COMPANY_SETTINGS]: {
          attributes: ['user_id'],
        },
      },
      extras: {
        attributes: ['company_id'],
      },
    });
    if (errCrmAdmin) return;
    for (let crmAdmin of crmAdmins) {
      logger.info(
        `Syncing Bullhorn data for ${crmAdmin.Company_Setting.user_id}`
      );
      const user_id = crmAdmin.Company_Setting.user_id;
      const company_id = crmAdmin.company_id;
      const [{ access_token, instance_url }, errForAccessToken] =
        await AccessTokenHelper.getAccessToken({
          integration_type: HIRING_INTEGRATIONS.BULLHORN,
          user_id,
        });
      if (errForAccessToken) {
        logger.error(
          `An error occured while trying to sync bullhorn data: `,
          errForAccessToken
        );
        continue;
      }
      let webhookObject = 'cadence'
      if (NODE_ENV === 'development' || NODE_ENV === 'stage')
        webhookObject = webhookObject + NODE_ENV;
      const [data, errWebhookData] = await getDataFromWebhook({
        integration_type: HIRING_INTEGRATIONS.BULLHORN,
        integration_data: {
          access_token,
          instance_url,
          object: webhookObject,
        },
      });
      if (errWebhookData) {
        logger.error(
          `An error occured while trying to sync bullhorn data: `,
          errWebhookData
        );
        continue;
      }
      let leadIds = '',
        contactIds = '',
        candidateIds = '',
        corporationIds = '';
      let createdLeadIds = [],
        createdContactIds = [],
        createdCandidateIds = [],
        createdCorporationIds = [];
      let deletedLeadIds = [],
        deletedContactIds = [],
        deletedCandidateIds = [],
        deletedCorporationIds = [];
      let events = data?.events ? data?.events : [];
      for (let event of events) {
        if (event.entityEventType === 'UPDATED') {
          if (event?.updatedProperties[0] === 'isDeleted') {
            if (event.entityName === 'Lead')
              deletedLeadIds.push(event.entityId);
            else if (event.entityName === 'Candidate')
              deletedCandidateIds.push(event.entityId);
            else if (event.entityName === 'ClientContact')
              deletedContactIds.push(event.entityId);
            else if (event.entityName === 'ClientCorporation')
              deletedCorporationIds.push(event.entityId);
          } else {
            if (event.entityName === 'Lead')
              leadIds = `${event.entityId} ${leadIds}`;
            else if (event.entityName === 'Candidate')
              candidateIds = `${event.entityId} ${candidateIds}`;
            else if (event.entityName === 'ClientContact')
              contactIds = `${event.entityId} ${contactIds}`;
            else if (event.entityName === 'ClientCorporation')
              corporationIds = `${event.entityId} ${corporationIds}`;
          }
        } else if (event.entityEventType === 'INSERTED') {
          if (event.entityName === 'Lead') createdLeadIds.push(event.entityId);
          else if (event.entityName === 'Candidate')
            createdCandidateIds.push(event.entityId);
          else if (event.entityName === 'ClientContact')
            createdContactIds.push(event.entityId);
          else if (event.entityName === 'ClientCorporation')
            createdCorporationIds.push(event.entityId);
        } else if (event.entityEventType === 'DELETED') {
          if (event.entityName === 'Lead') deletedLeadIds.push(event.entityId);
          else if (event.entityName === 'Candidate')
            deletedCandidateIds.push(event.entityId);
          else if (event.entityName === 'ClientContact')
            deletedContactIds.push(event.entityId);
          else if (event.entityName === 'ClientCorporation')
            deletedCorporationIds.push(event.entityId);
        }
      }
      bullhornController.updateBullhornContact({
        contactIds,
        createdContactIds,
        deletedContactIds,
        user_id,
        access_token,
        instance_url,
        company_id,
      });
      bullhornController.updateBullhornLead({
        leadIds,
        createdLeadIds,
        deletedLeadIds,
        user_id,
        access_token,
        instance_url,
        company_id,
      });
      bullhornController.updateBullhornCandidate({
        candidateIds,
        createdCandidateIds,
        deletedCandidateIds,
        user_id,
        access_token,
        instance_url,
        company_id,
      });
      bullhornController.updateBullhornAccount({
        corporationIds,
        createdCorporationIds,
        deletedCorporationIds,
        user_id,
        access_token,
        instance_url,
        company_id,
      });
    }
  } catch (err) {
    logger.error('Error while syncing data: ', err);
  }
};

module.exports = syncData;
