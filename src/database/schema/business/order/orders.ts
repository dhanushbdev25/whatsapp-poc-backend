// src/db/schema/orders.ts
import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
	pgTable,
	uuid,
	varchar,
	text,
	timestamp,
	jsonb,
	bigint,
	pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { customerMaster } from '../customer/customers';
import { orderMapping } from './orderMapping';

// optional enum for status
export const orderStatusEnum = pgEnum('order_status', [
	'new',
	'inprogress',
	'completed',
]);

export const orders = pgTable('orders', {
	id: uuid('id').defaultRandom().primaryKey(),

	customerID: bigint('customer_id', { mode: 'number' })
		.notNull()
		.references(() => customerMaster.customerID, { onDelete: 'cascade' }),

	// ✅ Added unique constraint since orderMapping references this field
	orderNo: varchar('order_no', { length: 100 }).notNull().unique(),
	orderName: varchar('order_name', { length: 255 }),
	orderCreatedAt: timestamp('order_created_at'),
	status: orderStatusEnum('status').default('new').notNull(),
	trackingNo: varchar('tracking_no', { length: 255 }),
	paymentType: varchar('payment_type', { length: 50 }),
	shipToAddress: text('ship_to_address'),
	shipToAddressCoord: jsonb('ship_to_address_coord'),
	carrier: varchar('carrier', { length: 100 }),
	metadata: jsonb('metadata'),

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

export type SelectOrder = InferSelectModel<typeof orders>;
export type InsertOrder = InferInsertModel<typeof orders>;

// ✅ Relations - Updated field references
export const ordersRelations = relations(orders, ({ one, many }) => ({
	customer: one(customerMaster, {
		fields: [orders.customerID],
		references: [customerMaster.customerID],
	}),
	mappings: many(orderMapping),

	// Audit relations - Updated field names
	createdByUser: one(users, {
		fields: [orders.createdBy],
		references: [users.id],
	}),
	updatedByUser: one(users, {
		fields: [orders.updatedBy],
		references: [users.id],
	}),
}));
