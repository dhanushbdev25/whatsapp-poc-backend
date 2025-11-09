import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { products } from '../order/products';
import { customerMaster } from './customers';

export const customerProducts = pgTable('customer_products_engagements', {
	id: uuid('id').defaultRandom().primaryKey(),

	customerID: uuid('customer_id')
		.notNull()
		.references(() => customerMaster.id, { onDelete: 'cascade' }),

	productID: uuid('product_id')
		.notNull()
		.references(() => products.id, { onDelete: 'cascade' }),

	createdBy: uuid('created_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	updatedBy: uuid('updated_by').references(() => users.id, {
		onDelete: 'set null',
	}),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SelectCustomerProduct = InferSelectModel<typeof customerProducts>;
export type InsertCustomerProduct = InferInsertModel<typeof customerProducts>;

export const customerProductsRelations = relations(
	customerProducts,
	({ one }) => ({
		customer: one(customerMaster, {
			fields: [customerProducts.customerID],
			references: [customerMaster.id],
		}),
		product: one(products, {
			fields: [customerProducts.productID],
			references: [products.id],
		}),
		createdByUser: one(users, {
			fields: [customerProducts.createdBy],
			references: [users.id],
		}),
		updatedByUser: one(users, {
			fields: [customerProducts.updatedBy],
			references: [users.id],
		}),
	}),
);
