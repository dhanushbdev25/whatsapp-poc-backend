// src/db/schema/products.ts
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
import { orderItems } from './orderItems';

export const productStatusEnum = pgEnum('product_status', [
	'new',
	'inprogress',
	'completed',
]);

export const products = pgTable('products', {
	id: uuid('id').defaultRandom().primaryKey(),
	contentId: varchar('content_id', { length: 100 }).notNull(),
	productName: varchar('product_name', { length: 255 }).notNull(),
	productType: varchar('product_type', { length: 100 }),
	sku: varchar('sku', { length: 100 }).unique().notNull(),
	weight: varchar('weight', { length: 50 }),
	dimensions: varchar('dimensions', { length: 100 }),
	warrantyPeriod: varchar('warranty_period', { length: 100 }),
	returnPeriodDays: varchar('return_period_days', { length: 50 }),
	qty: integer('qty'),
	amount: integer('amount'),
	currency: varchar('currency', { length: 10 }).default('NGN'),
	type: varchar('type', { length: 50 }),
	metadata: jsonb('metadata'),
	image_url: varchar('image_url', { length: 255 }),
	redirection_url: varchar('redirection_url', { length: 255 }),
	points: integer('numbers'),
	createdBy: uuid('created_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	updatedBy: uuid('updated_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SelectProduct = InferSelectModel<typeof products>;
export type InsertProduct = InferInsertModel<typeof products>;

export const productsRelations = relations(products, ({ many, one }) => ({
	orderItems: many(orderItems), //  Linked via mapping
	createdByUser: one(users, {
		fields: [products.createdBy],
		references: [users.id],
	}),
	updatedByUser: one(users, {
		fields: [products.updatedBy],
		references: [users.id],
	}),
}));
