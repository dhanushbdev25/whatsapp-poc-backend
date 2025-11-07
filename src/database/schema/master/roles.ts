import { relations } from 'drizzle-orm';
import { pgTable, integer, text, boolean } from 'drizzle-orm/pg-core';
import { userRoleEnum } from '../_Enums';
import { rolePermissions } from '../rolePermissions';
import { userRoles } from '../userRoles';

export const roles = pgTable('roles', {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	name: userRoleEnum().notNull().unique(),
	description: text(),
	isActive: boolean().default(true),
});

export const rolesRelations = relations(roles, ({ many }) => ({
	userRoles: many(userRoles),
	rolePermissions: many(rolePermissions),
}));
