// src/db/schema/customerGroups.ts
import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { pgTable, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { customerGroupMembers } from './customerGroupMembers';

export const customerGroups = pgTable('customer_groups', {
	id: uuid().defaultRandom().primaryKey(),
	title: varchar('title', { length: 150 }).notNull(),
	description: text('description'),

	// 🔹 Audit fields - Fixed naming convention
	createdBy: uuid('created_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	updatedBy: uuid('updated_by').references(() => users.id, {
		onDelete: 'set null',
	}),

	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SelectCustomerGroup = InferSelectModel<typeof customerGroups>;
export type InsertCustomerGroup = InferInsertModel<typeof customerGroups>;

//  Relations - Updated field references
export const customerGroupsRelations = relations(
	customerGroups,
	({ many, one }) => ({
		// One group can have many members
		groupMembers: many(customerGroupMembers),

		// Linked users (audit) - Updated field names
		createdByUser: one(users, {
			fields: [customerGroups.createdBy],
			references: [users.id],
		}),
		updatedByUser: one(users, {
			fields: [customerGroups.updatedBy],
			references: [users.id],
		}),
	}),
);
