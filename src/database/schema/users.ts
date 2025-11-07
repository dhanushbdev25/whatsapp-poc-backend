import { InferSelectModel, relations } from 'drizzle-orm';
import {
	pgTable,
	varchar,
	uuid,
	boolean,
	text,
	timestamp,
	integer,
} from 'drizzle-orm/pg-core';
import { userRoles } from './userRoles';

export const users = pgTable('users', {
	id: uuid().defaultRandom().primaryKey(),
	name: text().notNull(),
	email: text().notNull().unique(),
	isActive: boolean().default(true),
	passwordHash: text(),
	lastLogin: timestamp(),
	loginAttempts: integer().default(0),
	isLocked: boolean().default(false),
	jobTitle: varchar({ length: 255 }),
	mobileNo: varchar({ length: 20 }),
	azureId: uuid(),
	createdAt: timestamp().defaultNow().notNull(),
	updatedAt: timestamp().defaultNow().notNull(),
});

export type SelectUserType = InferSelectModel<typeof users>;

export const usersRelations = relations(users, ({ many }) => ({
	userRoles: many(userRoles),
}));
