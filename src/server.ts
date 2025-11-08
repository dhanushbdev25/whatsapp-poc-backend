// eslint-disable-next-line import/order -- dotenv must be loaded first
import { config } from 'dotenv';
import * as http from 'http';
import { AddressInfo } from 'net';

config({ quiet: true });

import App from './App';
import { closeConnection, testConnection } from '@/database';
import env from '@/env';
import logger from '@/lib/logger';

const app: App = new App();
let server: http.Server;

function serverError(error: NodeJS.ErrnoException): void {
	if (error.syscall !== 'listen') throw error;

	// handle specific error codes here.
	throw error;
}

function serverListening(): void {
	const addressInfo: AddressInfo = <AddressInfo>server.address();

	logger.info('Listening on', {
		port: env.PORT,
		host: addressInfo.address,
	});
}

app.init()
	.then(async () => {
		app.express.set('port', env.PORT);
		server = app.httpServer;
		server.on('error', serverError);
		server.on('listening', serverListening);
		server.listen(env.PORT);
		await testConnection();
	})
	.catch((err: Error) => {
		logger.error('app.init error', {
			name: err.name,
			errMessage: err.message,
			stack: err.stack,
		});
		process.exit(1);
	});

process.on('uncaughtException', async (error) => {
	logger.error('Uncaught Exception:', {
		errorName: error.name,
		errMessage: error.message,
		stack: error.stack,
	});

	await closeConnection();

	if (server) {
		logger.warn('Attempting to close server...');
		server.close(() => {
			logger.warn('Server closed.');
			process.exit(1);
		});
	} else {
		process.exit(1);
	}
});

process.on('unhandledRejection', async (reason: Error) => {
	logger.error('Unhandled Rejection: reason:', {
		error: reason.message,
		stack: reason.stack,
	});

	await closeConnection();

	if (server) {
		logger.warn('Attempting to close server...');
		server.close(() => {
			logger.warn('Server closed.');
			process.exit(1);
		});
	} else {
		process.exit(1);
	}
});
