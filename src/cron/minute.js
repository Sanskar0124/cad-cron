// Packages
const reel = require('node-reel');

// Helpers
const validateDomains = require('./admin/company/validateDomain');
const CronUpdateCadenceStatus = require('./sales/department/cadence');
const CronUpdateLeadToCadenceStatus = require('./sales/department/lead-to-cadence');
const CronLaunchScheduledCadence = require('../../../Cadence-Brain/src/helper/cadence/cronLaunchScheduledCadence');
const clearContacts = require('./hubspot-import/clearContacts');
const syncData = require('./bullhorn-sync/syncData');
const sendRemindersForCustomTasksCron = require('./sales/department/task');

module.exports = () => {
  reel()
    .call(() => {
      CronUpdateCadenceStatus();
      CronUpdateLeadToCadenceStatus();
      validateDomains();
      CronLaunchScheduledCadence();
      clearContacts();
      syncData();
      sendRemindersForCustomTasksCron();
    })
    .everyMinute()
    .run();
};
