import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { pgTable, timestamp } from 'drizzle-orm/pg-core';
import { uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { customerMaster } from '../customer/customers';
import { customerGroups } from './customerGroups';

export const customerGroupMembers = pgTable('customer_group_members', {
	id: uuid('id').defaultRandom().primaryKey(),
	groupId: uuid('group_id')
		.notNull()
		.unique()
		.references(() => customerGroups.id, { onDelete: 'cascade' }),
	customerID: uuid('customer_id')
		.notNull()
		.unique()
		.references(() => customerMaster.id, { onDelete: 'cascade' }),

	createdBy: uuid('created_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	updatedBy: uuid('updated_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SelectCustomerGroupMember = InferSelectModel<
	typeof customerGroupMembers
>;
export type InsertCustomerGroupMember = InferInsertModel<
	typeof customerGroupMembers
>;

export const customerGroupMembersRelations = relations(
	customerGroupMembers,
	({ one }) => ({
		group: one(customerGroups, {
			fields: [customerGroupMembers.groupId],
			references: [customerGroups.id],
		}),
		customer: one(customerMaster, {
			fields: [customerGroupMembers.customerID],
			references: [customerMaster.id],
		}),
		createdByUser: one(users, {
			fields: [customerGroupMembers.createdBy],
			references: [users.id],
		}),
		updatedByUser: one(users, {
			fields: [customerGroupMembers.updatedBy],
			references: [users.id],
		}),
	}),
);
