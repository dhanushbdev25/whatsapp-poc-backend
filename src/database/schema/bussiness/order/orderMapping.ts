// src/db/schema/orderMapping.ts
import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
	pgTable,
	uuid,
	varchar,
	integer,
	timestamp,
	jsonb,
	pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { orders } from './orders';

export const orderMappingStatusEnum = pgEnum('order_mapping_status', [
	'new',
	'inprogress',
	'completed',
]);

export const orderMapping = pgTable('order_mapping', {
	id: uuid('id').defaultRandom().primaryKey(),

	orderNo: varchar('order_no', { length: 100 })
		.notNull()
		.references(() => orders.orderNo, { onDelete: 'cascade' }),

	productId: uuid('product_id'),
	productName: varchar('product_name', { length: 255 }),
	productType: varchar('product_type', { length: 100 }),
	sku: varchar('sku', { length: 100 }),
	weight: varchar('weight', { length: 50 }),
	dimensions: varchar('dimensions', { length: 100 }),
	warrantyPeriod: varchar('warranty_period', { length: 100 }),
	returnPeriodDays: varchar('return_period_days', { length: 50 }),
	qty: integer('qty'),
	amount: integer('amount'),
	status: orderMappingStatusEnum('status').default('new').notNull(),
	type: varchar('type', { length: 50 }),
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

export type SelectOrderMapping = InferSelectModel<typeof orderMapping>;
export type InsertOrderMapping = InferInsertModel<typeof orderMapping>;

// ✅ Relations - Updated field references
export const orderMappingRelations = relations(orderMapping, ({ one }) => ({
	order: one(orders, {
		fields: [orderMapping.orderNo],
		references: [orders.orderNo],
	}),

	// Audit relations - Updated field names
	createdByUser: one(users, {
		fields: [orderMapping.createdBy],
		references: [users.id],
	}),
	updatedByUser: one(users, {
		fields: [orderMapping.updatedBy],
		references: [users.id],
	}),
}));
