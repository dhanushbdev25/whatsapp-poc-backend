import { eq } from 'drizzle-orm';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod/v4';
import { ModuleEnumType } from './const';
import { db } from '@/database';
import { permissions, rolePermissions, roles } from '@/database/schema';
import logger from '@/lib/logger';

export const RoleModuleAccessSchema = z.array(
	z.object({
		roleId: z.number().int().nonnegative(),
		roleName: z.string().min(1),
		permission: z.string().min(1),
	}),
);

export class RoleBaseAccess {
	private static roleModule: Map<number, Set<string>> = new Map();
	private static intervalId: NodeJS.Timeout;

	private static async getRoleModuleData() {
		try {
			logger.info(
				'[RoleBaseAccess] Refreshing role-module access data...',
			);

			const results = await db
				.select({
					roleId: roles.id,
					roleName: roles.name,
					permission: permissions.code,
				})
				.from(roles)
				.innerJoin(
					rolePermissions,
					eq(rolePermissions.roleId, roles.id),
				)
				.innerJoin(
					permissions,
					eq(permissions.id, rolePermissions.permissionId),
				);

			const parsed = RoleModuleAccessSchema.safeParse(results);

			if (!parsed.success) {
				logger.error(
					`Rolebased access failed: ${z.prettifyError(parsed.error)}`,
				);
				throw new Error('Rolebased access failed');
			}

			const moduleMap = new Map<number, Set<string>>();

			for (const row of parsed.data) {
				if (!moduleMap.has(row.roleId))
					moduleMap.set(row.roleId, new Set());

				moduleMap.get(row.roleId).add(row.permission);
			}

			this.roleModule = moduleMap;
		} catch (err) {
			logger.error('Role-based access failed', err);
		}
	}

	static init(intervalMs: number = 10 * 60 * 1000) {
		this.getRoleModuleData();
		this.intervalId = setInterval(
			() => this.getRoleModuleData(),
			intervalMs,
		);
		logger.info('[RoleBaseAccess] Interval started');
	}

	static stopIt() {
		if (this.intervalId) clearInterval(this.intervalId);
		logger.info('[RoleBaseAccess] Interval stopped');
	}

	static checkAccess(roleId: number, keyword: ModuleEnumType): boolean {
		const modules = this.roleModule.get(roleId);
		return modules?.has(keyword) ?? false;
	}

	static middleware(keyword: ModuleEnumType) {
		return (req: Request, res: Response, next: NextFunction) => {
			// Check if user has the permission in their aggregated permissions
			// (which includes permissions from all their roles)
			const hasPermission =
				req.user_details.permissions?.includes(keyword);

			if (!hasPermission) {
				return res
					.status(403)
					.json({ message: 'Forbidden: Access Denied' });
			}
			next();
		};
	}
}

export default RoleBaseAccess;
