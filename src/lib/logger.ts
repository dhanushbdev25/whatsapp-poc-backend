import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { transports, format, createLogger, type Logger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import env from '@/env';

const logDir = './logs';

if (!existsSync(logDir)) mkdirSync(logDir);

// File transport levels based on environment
const fileLevel = env?.NODE_ENV === 'prod' ? 'warn' : 'info';

const fileTransport = new DailyRotateFile({
	filename: `${logDir}/%DATE%.log`,
	datePattern: 'YYYY-MM-DD',
	zippedArchive: false,
	maxFiles: '7d',
	maxSize: '20m',
	level: fileLevel, // file logging level
});

const { Console } = transports;
const { combine, timestamp, errors, metadata, simple, colorize, json } = format;

const logger: Logger = createLogger({
	level: 'debug', //! global level should be the most verbose so that the transports can control levels output
	format: combine(
		timestamp(),
		json(),
		errors({ stack: true }),
		metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
	),
	transports: [
		new Console({
			level: 'debug', // always verbose in terminal
			format: combine(colorize(), simple()),
		}),
		fileTransport,
	],
	defaultMeta: {
		hostname: os.hostname(),
		pid: process.pid,
	},
	exceptionHandlers: [new Console({ level: 'error' }), fileTransport],
	rejectionHandlers: [new Console({ level: 'error' }), fileTransport],
});

export default logger;
