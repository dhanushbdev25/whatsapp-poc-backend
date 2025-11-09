import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { pgTable, boolean, timestamp } from 'drizzle-orm/pg-core';
import { uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { customerMaster } from './customers';

export const notificationPreferences = pgTable('notification_preferences', {
	id: uuid().defaultRandom().primaryKey(),

	customerID: uuid('customer_id')
		.notNull()
		.unique()
		.references(() => customerMaster.id, { onDelete: 'cascade' }),

	orderUpdates: boolean('order_updates').default(false).notNull(),
	loyaltyRewards: boolean('loyalty_rewards').default(false).notNull(),
	promotionalMessages: boolean('promotional_messages')
		.default(false)
		.notNull(),

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

export const notificationPreferencesRelations = relations(
	notificationPreferences,
	({ one }) => ({
		customer: one(customerMaster, {
			fields: [notificationPreferences.customerID],
			references: [customerMaster.id],
		}),
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
