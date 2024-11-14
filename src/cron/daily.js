// Packages
const reel = require('node-reel');

// Helpers
const { cronResetLeadScore } = require('./lead-score/');
const { cronResetAddonApiCalls } = require('./enrichments');
const { resetRecentCadences } = require('./recent-cadences');
const { removeInactiveSessions } = require('./ringover-tokens');

module.exports = () => {
  reel()
    .call(() => {
      cronResetLeadScore();
    })
    .twiceDaily(1, 12)
    .run();

  reel()
    .call(() => {
      cronResetAddonApiCalls();
      resetRecentCadences();
      removeInactiveSessions();
    })
    .daily()
    .run();
};
