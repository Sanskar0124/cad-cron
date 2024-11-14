require('dotenv').config({ path: `./.env.${process.env.NODE_ENV}` });
let logger = require('./utils/winston');
const { EXIT_SIGNALS } = require('../../Cadence-Brain/src/utils/enums');
const { init } = require('../../Cadence-Brain/src/utils/tracing');
const { tracingSDK } = init('crm-backend', process.env.NODE_ENV);
const app = require('./app');
const http = require('http');
const { sequelize } = require('../../Cadence-Brain/src/db/models');

// Port setup
const { PORT, NODE_ENV } = require('./utils/config');
const port = PORT || 8080;

// Set up http server
const server = http.createServer(app);
sequelize
  .authenticate()
  .then(() => {
    logger.info('Successfully connected to db');
    server.listen(port, () =>
      logger.info(
        `Cadence Cron Service Running on port ${port} ENV-${NODE_ENV}`
      )
    );
  })
  .catch((err) => {
    logger.error('Failed to connect to db', err);
  });

// Cron job imports
// const calendarCronJobs = require('./services/Google/Calendar/CronJobs');
// const mailCronJobs = require('./services/Google/Mail/CronJobs');
// const getLeadsCronJobs = require('./services/Salesforce/CronJobs');
const CronJobs = require('./cron');
// // Cron jobs
// // calendarCronJobs();
// // mailCronJobs();
// // getLeadsCronJobs();
CronJobs.halfHourly();
CronJobs.minute();
CronJobs.daily();

// The signals we want to handle
// NOTE: although it is tempting, the SIGKILL signal (9) cannot be intercepted and handled
// let signals = {
//   SIGHUP: 1,
//   SIGINT: 2,
//   SIGTERM: 15,
// };

// Shutdown logic for our application here
const shutdown = (signal, value) => {
  console.log('shutdown!');
  tracingSDK
    .shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error));
  server.close(() => {
    console.log(
      `Server is currently cleaning up the remaining process gracefully`
    );
  });
};

// Create a listener for each of the signals that we want to handle
Object.keys(EXIT_SIGNALS).forEach((signal) => {
  process.on(signal, () => {
    console.log(`process received a ${signal} signal`);
    shutdown(signal, EXIT_SIGNALS[signal]);
  });
});
