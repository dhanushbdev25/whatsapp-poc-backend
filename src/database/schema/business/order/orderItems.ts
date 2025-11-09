// src/db/schema/orderItems.ts
import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { integer } from 'drizzle-orm/pg-core';
import { pgEnum } from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { orders } from './orders';
import { products } from './products';

export const productStatusEnum = pgEnum('product_status', [
	'new',
	'inprogress',
	'completed',
]);

export const orderItems = pgTable('order_items', {
	id: uuid('id').defaultRandom().primaryKey(),

	orderID: uuid('order_id')
		.notNull()
		.references(() => orders.id, { onDelete: 'cascade' }),

	productID: uuid('product_id')
		.notNull()
		.references(() => products.id, { onDelete: 'cascade' }),
	qty: integer('qty'),
	status: productStatusEnum('status').default('new').notNull(),

	createdBy: uuid('created_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	updatedBy: uuid('updated_by').references(() => users.id, {
		onDelete: 'set null',
	}),

	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SelectOrderItem = InferSelectModel<typeof orderItems>;
export type InsertOrderItem = InferInsertModel<typeof orderItems>;

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
	order: one(orders, {
		fields: [orderItems.orderID],
		references: [orders.id],
	}),
	product: one(products, {
		fields: [orderItems.productID],
		references: [products.id],
	}),
	createdByUser: one(users, {
		fields: [orderItems.createdBy],
		references: [users.id],
	}),
	updatedByUser: one(users, {
		fields: [orderItems.updatedBy],
		references: [users.id],
	}),
}));
