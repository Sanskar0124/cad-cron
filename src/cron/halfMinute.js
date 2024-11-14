// Utils
const logger = require('../utils/winston');

// Packages
const reel = require('node-reel');

// Repositories
const UserRepository = require('../../../Cadence-Brain/src/repository/user-repository');

var { exec } = require('child_process');
function puts(err, stdout, stderr) {
  console.log('Stdout: ', stdout);
  console.log('Stderr: ', stderr);
  console.log('err: ', err);
}

const checkConnectionTimeout = async () => {
  try {
    const [user, errForUsers] = await UserRepository.findUserByQuery({
      user_id: '1',
    });
    if (errForUsers?.includes('timeout')) {
      logger.info('OP TIMEOUT in if error');
      return exec(
        'sh /Users/ziyankarmali/Documents/ringover/CRM-Backend/src/cron/hi.sh',
        puts
      );
    }
    logger.info('User_id: ' + user.first_name);
  } catch (err) {
    logger.info('OP TIMEOUT in catch');
    return exec('sh hi.sh', puts);
  }
};

module.exports = () => {
  reel()
    .call(() => {
      //checkConnectionTimeout();
    })
    .everyMinute()
    .run();
};
