import { relations } from 'drizzle-orm';
import { pgTable, integer, primaryKey } from 'drizzle-orm/pg-core';
import { permissions } from './master/permissions';
import { roles } from './master/roles';

export const rolePermissions = pgTable(
	'role_permissions',
	{
		roleId: integer().references(() => roles.id),
		permissionId: integer().references(() => permissions.id),
	},
	(t) => [primaryKey({ columns: [t.permissionId, t.roleId] })],
);

export const rolePermissionsRelations = relations(
	rolePermissions,
	({ one }) => ({
		role: one(roles, {
			fields: [rolePermissions.roleId],
			references: [roles.id],
		}),
		permission: one(permissions, {
			fields: [rolePermissions.permissionId],
			references: [permissions.id],
		}),
	}),
);
