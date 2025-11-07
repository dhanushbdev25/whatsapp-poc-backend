// src/db/schema/customerMaster.ts
import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
	pgTable,
	integer,
	varchar,
	text,
	boolean,
	timestamp,
	pgEnum,
} from 'drizzle-orm/pg-core';
import { uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { customerGroupMembers } from '../customerGroup/customerGroupMembers';
import { loyaltyAccounts } from '../loyalities/loyaltyAccounts';
import { loyaltyTransactions } from '../loyalities/loyaltyTransactions';
import { orders } from '../order/orders';
import { notificationPreferences } from './notificationPreferences';

// Optional: gender enum
export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);

export const customerMaster = pgTable('customer_master', {
	id: uuid().defaultRandom().primaryKey(),
	// ✅ Added unique constraint to ensure referential integrity
	customerID: integer('customer_id').notNull().unique(),
	name: varchar('name', { length: 255 }),
	email: varchar('email', { length: 255 }),
	phone: varchar('phone', { length: 20 }),
	address: text('address'),
	state: varchar('state', { length: 100 }),
	pincode: varchar('pincode', { length: 10 }),
	gender: genderEnum('gender'),

	// 🔹 Auditing (linked to users table) - Fixed naming convention
	createdBy: uuid('created_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	updatedBy: uuid('updated_by').references(() => users.id, {
		onDelete: 'set null',
	}),

	// ✅ Fixed typo: lastestActive → latestActive
	latestActive: timestamp('latest_active'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	isActive: boolean('is_active').default(true).notNull(),
});

// ✅ Type inference
export type SelectCustomer = InferSelectModel<typeof customerMaster>;
export type InsertCustomer = InferInsertModel<typeof customerMaster>;

// ✅ Relations - Updated field references
export const customerMasterRelations = relations(
	customerMaster,
	({ one, many }) => ({
		// 1️⃣ One-to-One relations
		notificationPreferences: one(notificationPreferences, {
			fields: [customerMaster.customerID],
			references: [notificationPreferences.customerID],
		}),
		loyaltyAccounts: one(loyaltyAccounts, {
			fields: [customerMaster.customerID],
			references: [loyaltyAccounts.customerID],
		}),

		// 2️⃣ One-to-Many relations
		customerGroupMembers: many(customerGroupMembers),
		loyaltyTransactions: many(loyaltyTransactions),
		orders: many(orders),

		// 3️⃣ User relations (audit trail) - Updated field names
		createdByUser: one(users, {
			fields: [customerMaster.createdBy],
			references: [users.id],
		}),
		updatedByUser: one(users, {
			fields: [customerMaster.updatedBy],
			references: [users.id],
		}),
	}),
);
