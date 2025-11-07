import { type dbConnection } from '../index';
import { roles } from '../schema';
import logger from '@/lib/logger';

// Default skeleton roles if data file doesn't exist
const DEFAULT_ROLES = ['ADMIN', 'USER'] as const;

export default async function seed(db: dbConnection) {
	let data: { roles: string[] };

	try {
		// Try to load from data file
		// @ts-expect-error - JSON file may not exist, handled by try-catch
		const dataModule = await import('./data/roles.json');
		data = dataModule.default || dataModule;
	} catch {
		logger.warn(
			'roles.json not found, using default skeleton roles. Create src/database/seeds/data/roles.json to customize.',
		);
		data = {
			roles: [...DEFAULT_ROLES],
		};
	}

	await db
		.insert(roles)
		.values(
			data.roles.map((name) => ({
				name: name as (typeof roles.$inferInsert)['name'],
			})),
		)
		.returning({ id: roles.id, name: roles.name });
}
