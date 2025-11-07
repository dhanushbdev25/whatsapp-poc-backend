// src/db/schema/customerGroupMembers.ts
import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { pgTable, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { customerMaster } from '../customer/customers';
import { customerGroups } from './customerGroups';

export const customerGroupMembers = pgTable(
	'customer_group_members',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		groupId: uuid('group_id')
			.notNull()
			.references(() => customerGroups.id, { onDelete: 'cascade' }),
		customerID: integer('customer_id')
			.notNull()
			.references(() => customerMaster.customerID, {
				onDelete: 'cascade',
			}),

		// 🔹 Audit fields - Fixed naming convention
		createdBy: uuid('created_by').references(() => users.id, {
			onDelete: 'set null',
		}),
		updatedBy: uuid('updated_by').references(() => users.id, {
			onDelete: 'set null',
		}),

		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => ({
		// ✅ Added composite unique constraint to prevent duplicate group memberships
		uniqueGroupCustomer: unique().on(table.groupId, table.customerID),
	}),
);

export type SelectCustomerGroupMember = InferSelectModel<
	typeof customerGroupMembers
>;
export type InsertCustomerGroupMember = InferInsertModel<
	typeof customerGroupMembers
>;

// ✅ Relations - Updated field references
export const customerGroupMembersRelations = relations(
	customerGroupMembers,
	({ one }) => ({
		// Each member belongs to one group
		group: one(customerGroups, {
			fields: [customerGroupMembers.groupId],
			references: [customerGroups.id],
		}),

		// Each member belongs to one customer
		customer: one(customerMaster, {
			fields: [customerGroupMembers.customerID],
			references: [customerMaster.customerID],
		}),

		// Audit trail users - Updated field names
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
