// Utils
const logger = require('../../utils/winston');
const { DB_TABLES } = require('../../../../Cadence-Brain/src/utils/modelEnums');

// Packages
const { Op } = require('sequelize');

// Repositories
const Repository = require('../../../../Cadence-Brain/src/repository');

const clearContacts = async () => {
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [deleted, err] = await Repository.destroy({
      tableName: DB_TABLES.HUBSPOT_IMPORTS,
      query: {
        created_at: {
          [Op.lt]: yesterday,
        },
      },
    });
  } catch (err) {
    logger.error('Error while clearing contacts: ', err);
  }
};

module.exports = clearContacts;
