// Packages
const reel = require('node-reel');

// Helpers
const {
  CronRenewGoogleNotificationChannel,
  CheckGoogleTokens,
} = require('./services/google');
const { CronRenewZohoNotificationChannel } = require('./services/zoho');
const resetAutomatedCount = require('./sales/user/resetAutomatedCount');
const validateDomains = require('./admin/company/validateDomain');
const recalculateStatistics = require('./statistics/recalculate');
const { cronMonthlyResetUserApiCalls } = require('./enrichments');

module.exports = () => {
  reel()
    .call(() => {
      CronRenewGoogleNotificationChannel();
      CheckGoogleTokens();
      resetAutomatedCount();
      validateDomains();
      CronRenewZohoNotificationChannel();
      recalculateStatistics();
      cronMonthlyResetUserApiCalls();
    })
    .everyThirtyMinutes()
    .run();
};
