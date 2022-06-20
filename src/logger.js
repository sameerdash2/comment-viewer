const winston = require('winston');
require('winston-daily-rotate-file');
const { printTimestamp } = require('./utils');

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console(),
        new winston.transports.DailyRotateFile({
            filename: 'logs/cv-%DATE%.log',
            datePattern: 'YYYY-MM'
        })
    ],
    format: winston.format.combine(
        winston.format.splat(),
        winston.format.simple(),
        winston.format.timestamp({
            format: () => printTimestamp(new Date())
        }),
        winston.format.printf((info) => `[${info.timestamp}] (${info.level}) ${info.message}`)
    )
});

module.exports = logger;
