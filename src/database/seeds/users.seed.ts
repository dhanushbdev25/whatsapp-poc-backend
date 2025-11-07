import { inArray } from 'drizzle-orm';
import { type dbConnection } from '@/database';
import { users, userRoles, roles, type RoleType } from '@/database/schema';
import hash from '@/lib/hash';
import logger from '@/lib/logger';

type SeedUser = {
	roleName: RoleType;
	user: {
		name: string;
		email: string;
		isActive: boolean;
		password: string;
	};
};

export default async function seed(db: dbConnection) {
	let data: SeedUser[];

	try {
		// Try to load from data file
		// @ts-expect-error - JSON file may not exist, handled by try-catch
		const dataModule = await import('./data/users.json');
		data = Array.isArray(dataModule.default)
			? dataModule.default
			: Array.isArray(dataModule)
				? dataModule
				: [];
	} catch {
		logger.warn(
			'users.json not found, skipping user seeding. Create src/database/seeds/data/users.json to add users.',
		);
		return;
	}

	if (!data || data.length === 0) {
		logger.info('No users to seed');
		return;
	}

	await db.transaction(async (tx) => {
		const uniqueRoles = Array.from(
			new Set(data.map((u: SeedUser) => u.roleName)),
		);

		const roleRows = await tx
			.select({ id: roles.id, name: roles.name })
			.from(roles)
			.where(inArray(roles.name, uniqueRoles));

		const roleMap = new Map(roleRows.map((r) => [r.name, r.id]));

		// insert all users
		for (const u of data) {
			const roleId = roleMap.get(u.roleName);

			if (!roleId) {
				logger.warn(
					`Role not found: ${u.roleName}, skipping user ${u.user.email}`,
				);
				continue;
			}

			const passwordHash = await hash.hash(u.user.password);

			const [user] = await tx
				.insert(users)
				.values({
					name: u.user.name.toLowerCase(),
					email: u.user.email.toLowerCase(),
					isActive: u.user.isActive,
					passwordHash,
				})
				.onConflictDoNothing()
				.returning({ id: users.id });

			if (!user?.id) continue;

			// Create user-role mapping with isDefault=true
			await tx.insert(userRoles).values({
				userId: user.id,
				roleId,
				isDefault: true,
			});
		}
	});
}
