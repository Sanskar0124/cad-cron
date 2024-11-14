// Packages
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./utils/winston');
const dbHealthCheck = require('../../Cadence-Brain/src/utils/dbHealthCheck');
const redisHealthcheck = require('../../Cadence-Brain/src/utils/redisHealthCheck')
const { register, totalRequests } = require("../../Cadence-Brain/src/utils/promClient.js")

const app = express();

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(
  express.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 })
);
app.use(cors());
app.use(helmet());
app.use(morgan('common', { stream: logger.stream }));
app.use(express.json());


// Routes

app.get('/', (_, res) => {
  res.status(200).send('Cron Jobs service up and running ');
});

app.use((req, res, next) => {
  totalRequests.inc({ method: req.method, hostname: req.hostname });
  next();
});

// Handle the metrics scraping on /metrics path
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});

app.get('/healthcheck', async (_, res) => {
  try {
    const [dbStatus, dbError] = await dbHealthCheck();
    const [redisStatus, redisError] = await redisHealthcheck();

    if (redisStatus && dbStatus)
      res.status(200).json({
        msg: 'All systems are up and running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime() / 60,
      });
    else
      res.status(500).json({
        redis: redisError,
        db: dbError,
      });
  } catch (error) {
    res.status(500).json({ error: error?.message });
  }
});

module.exports = app;


