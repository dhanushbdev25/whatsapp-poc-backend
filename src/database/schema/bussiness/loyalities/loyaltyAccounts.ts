// src/db/schema/loyaltyAccounts.ts
import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { pgTable, uuid, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { customerMaster } from '../customer/customers';
import { loyaltyTransactions } from './loyaltyTransactions';

export const loyaltyAccounts = pgTable('loyalty_accounts', {
	id: uuid('id').defaultRandom().primaryKey(),
	customerID: integer('customer_id')
		.notNull()
		.unique() // ✅ Added unique constraint for 1-to-1 relationship
		.references(() => customerMaster.customerID, { onDelete: 'cascade' }),

	// ✅ Added notNull() for data consistency
	points_balance: integer('points_balance').default(0).notNull(),
	points_redeemed: integer('points_redeemed').default(0).notNull(),
	lifetime_points: integer('lifetime_points').default(0).notNull(),
	last_transaction_at: timestamp('last_transaction_at'),

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

export type SelectLoyaltyAccount = InferSelectModel<typeof loyaltyAccounts>;
export type InsertLoyaltyAccount = InferInsertModel<typeof loyaltyAccounts>;

// ✅ Relations - Updated field references
export const loyaltyAccountsRelations = relations(
	loyaltyAccounts,
	({ one, many }) => ({
		customer: one(customerMaster, {
			fields: [loyaltyAccounts.customerID],
			references: [customerMaster.customerID],
		}),
		transactions: many(loyaltyTransactions),

		// Audit relations - Updated field names
		createdByUser: one(users, {
			fields: [loyaltyAccounts.createdBy],
			references: [users.id],
		}),
		updatedByUser: one(users, {
			fields: [loyaltyAccounts.updatedBy],
			references: [users.id],
		}),
	}),
);
