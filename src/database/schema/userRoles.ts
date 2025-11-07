import { relations } from 'drizzle-orm';
import {
	pgTable,
	uuid,
	integer,
	boolean,
	primaryKey,
} from 'drizzle-orm/pg-core';
import { roles } from './master/roles';
import { users } from './users';

export const userRoles = pgTable(
	'user_roles',
	{
		userId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		roleId: integer()
			.notNull()
			.references(() => roles.id, { onDelete: 'cascade' }),
		isDefault: boolean().default(false).notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const userRolesRelations = relations(userRoles, ({ one }) => ({
	user: one(users, {
		fields: [userRoles.userId],
		references: [users.id],
	}),
	role: one(roles, {
		fields: [userRoles.roleId],
		references: [roles.id],
	}),
}));
