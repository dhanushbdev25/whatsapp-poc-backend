// src/db/schema/notificationPreferences.ts
import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { pgTable, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { customerMaster } from './customers';

export const notificationPreferences = pgTable('notification_preferences', {
	id: uuid().defaultRandom().primaryKey(),

	customerID: integer('customer_id')
		.notNull()
		.unique() // ✅ Added unique constraint for 1-to-1 relationship
		.references(() => customerMaster.customerID, { onDelete: 'cascade' }),

	orderUpdates: boolean('order_updates').default(false).notNull(),
	loyaltyRewards: boolean('loyalty_rewards').default(false).notNull(),
	promotionalMessages: boolean('promotional_messages')
		.default(false)
		.notNull(),

	// 🔹 Auditing (linked to users) - Fixed naming convention
	createdBy: uuid('created_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	updatedBy: uuid('updated_by').references(() => users.id, {
		onDelete: 'set null',
	}),

	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SelectNotificationPreferences = InferSelectModel<
	typeof notificationPreferences
>;
export type InsertNotificationPreferences = InferInsertModel<
	typeof notificationPreferences
>;

// ✅ Relations - Updated field references
export const notificationPreferencesRelations = relations(
	notificationPreferences,
	({ one }) => ({
		// Each notification preference belongs to one customer
		customer: one(customerMaster, {
			fields: [notificationPreferences.customerID],
			references: [customerMaster.customerID],
		}),

		// Audit relations to users - Updated field names
		createdByUser: one(users, {
			fields: [notificationPreferences.createdBy],
			references: [users.id],
		}),
		updatedByUser: one(users, {
			fields: [notificationPreferences.updatedBy],
			references: [users.id],
		}),
	}),
);
