import { type dbConnection } from '../index';
import { rolePermissions, roles, permissions } from '../schema';
import logger from '@/lib/logger';

type RolePermissionData = {
	permission: string;
	roles: string[];
};

export default async function seed(db: dbConnection) {
	let data: RolePermissionData[];

	try {
		// Try to load from data file
		// @ts-expect-error - JSON file may not exist, handled by try-catch
		const dataModule = await import('./data/rolePermissions.json');
		data = dataModule.default || dataModule;
	} catch {
		logger.warn(
			'rolePermissions.json not found, skipping role-permission seeding. Create src/database/seeds/data/rolePermissions.json to add mappings.',
		);
		return;
	}

	if (!data || data.length === 0) {
		logger.info('No role-permission mappings to seed');
		return;
	}

	const allRoles = await db.select().from(roles);
	const allPermissions = await db.select().from(permissions);

	const values: { roleId: number; permissionId: number }[] = [];

	data.forEach((rp) => {
		const perm = allPermissions.find((p) => p.code === rp.permission);
		if (!perm) {
			logger.warn(`Permission not found: ${rp.permission}, skipping`);
			return;
		}
		rp.roles.forEach((roleName) => {
			const role = allRoles.find((r) => r.name === roleName);
			if (role) {
				values.push({ roleId: role.id, permissionId: perm.id });
			} else {
				logger.warn(`Role not found: ${roleName}, skipping`);
			}
		});
	});

	if (values.length > 0) {
		await db.insert(rolePermissions).values(values);
	}
}
