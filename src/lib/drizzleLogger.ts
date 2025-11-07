import { inspect } from 'node:util';
import chalk from 'chalk';
import { Logger as DrizzleLogger } from 'drizzle-orm/logger';
import logger from './logger';

class DrizzleWinstonLogger implements DrizzleLogger {
	private readonly drizzleLogger = logger.child({ type: 'database' });

	logQuery(query: string, params: unknown[]) {
		const queryType = query.trim().split(' ')[0].toUpperCase();
		const prettyParams = inspect(params, { depth: null, colors: true });
		const consoleMessage = `[${queryType} QUERY]\n${chalk.hex('#ff4fa7ff')('[SQL]')}: ${query}\n${chalk.hex('#00fbffff')('[PARAMS]')}: ${prettyParams}`;
		const isDestructive = queryType.includes('DELETE');
		if (isDestructive)
			this.drizzleLogger.warn(consoleMessage, {
				query,
				params,
				type: 'query',
			});
		else this.drizzleLogger.debug(consoleMessage, { type: 'query' });
	}

	logInfo(message: string) {
		this.drizzleLogger.info(message, { type: 'info' });
	}

	logError(message: string, error?: unknown) {
		this.drizzleLogger.error(message, { type: 'error', error });
	}
}

export default DrizzleWinstonLogger;
