import { relations } from 'drizzle-orm';
import { pgTable, integer, varchar, text } from 'drizzle-orm/pg-core';
import { rolePermissions } from '../rolePermissions';

export const permissions = pgTable('permissions', {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	code: varchar({ length: 256 }).unique(),
	description: text(),
});

export const permissionsRelations = relations(permissions, ({ many }) => ({
	rolePermissions: many(rolePermissions),
}));
