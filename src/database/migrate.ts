import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, closeConnection } from './index';
import config from '$/drizzle.config';
import env from '@/env';
import logger from '@/lib/logger';

(async () => {
	if (!env.DB_MIGRATING) {
		throw new Error(
			'Set "DB_MIGRATING=true" when running migrations. Contact a developer if you are unsure.',
		);
	}
	logger.info('STARTING MIGRATION');
	await migrate(db, { migrationsFolder: config.out });

	await closeConnection();
	logger.info('MIGRATION COMPLETE');
})();
