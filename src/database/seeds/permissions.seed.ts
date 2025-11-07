import { type dbConnection } from '../index';
import { permissions } from '../schema';
import logger from '@/lib/logger';

// Default skeleton permissions if data file doesn't exist
const DEFAULT_PERMISSIONS = [
	{
		code: 'viewdashboard',
		name: 'View Dashboard',
		description: 'View dashboard',
	},
	{
		code: 'manageusers',
		name: 'Manage Users',
		description: 'Create, edit, and delete users',
	},
	{ code: 'viewreports', name: 'View Reports', description: 'View reports' },
	{
		code: 'adminsettings',
		name: 'Admin Settings',
		description: 'Access admin settings',
	},
];

export default async function seed(db: dbConnection) {
	let data: typeof DEFAULT_PERMISSIONS;

	try {
		// Try to load from data file
		// @ts-expect-error - JSON file may not exist, handled by try-catch
		const dataModule = await import('./data/permissions.json');
		data = dataModule.default || dataModule;
	} catch {
		logger.warn(
			'permissions.json not found, using default skeleton permissions. Create src/database/seeds/data/permissions.json to customize.',
		);
		data = DEFAULT_PERMISSIONS;
	}

	if (!data || data.length === 0) {
		logger.info('No permissions to seed');
		return;
	}

	await db.insert(permissions).values(data);
}
