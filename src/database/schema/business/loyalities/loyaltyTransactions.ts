import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
	pgTable,
	uuid,
	integer,
	text,
	timestamp,
	jsonb,
	varchar,
} from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { customerMaster } from '../customer/customers';
import { loyaltyAccounts } from './loyaltyAccounts';

export const loyaltyTransactions = pgTable('loyalty_transactions', {
	id: uuid('id').defaultRandom().primaryKey(),
	customerID: uuid('customer_id')
		.notNull()
		.references(() => customerMaster.id, { onDelete: 'cascade' }),
	account_id: uuid('account_id')
		.notNull()
		.references(() => loyaltyAccounts.id, { onDelete: 'cascade' }),

	initialPoint: integer('initial_point').notNull(),
	manipulatedPoint: integer('manipulated_point').notNull(),
	totalPoint: integer('total_point').notNull(),
	description: text('description'),
	metadata: jsonb('metadata'),
	type: varchar('type', { length: 50 }),
	orderNo: varchar('order_no', { length: 100 }),

	createdBy: uuid('created_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	updatedBy: uuid('updated_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SelectLoyaltyTransaction = InferSelectModel<
	typeof loyaltyTransactions
>;
export type InsertLoyaltyTransaction = InferInsertModel<
	typeof loyaltyTransactions
>;

export const loyaltyTransactionsRelations = relations(
	loyaltyTransactions,
	({ one }) => ({
		customer: one(customerMaster, {
			fields: [loyaltyTransactions.customerID],
			references: [customerMaster.id],
		}),
		account: one(loyaltyAccounts, {
			fields: [loyaltyTransactions.account_id],
			references: [loyaltyAccounts.id],
		}),
		createdByUser: one(users, {
			fields: [loyaltyTransactions.createdBy],
			references: [users.id],
		}),
		updatedByUser: one(users, {
			fields: [loyaltyTransactions.updatedBy],
			references: [users.id],
		}),
	}),
);
