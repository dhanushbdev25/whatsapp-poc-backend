// src/db/schema/tiers.ts
import { relations, InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../../users';
import { varchar } from 'drizzle-orm/pg-core';

export const tiers = pgTable('tiers', {
	id: uuid('id').defaultRandom().primaryKey(),
	tier_name: text('tier_name').notNull(),
	tier_description: text('tier_description'),
	//  Added notNull() for required field
	points_required: integer('points_required').notNull(),
	colour_representation: varchar('colour_representation'),
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

export type SelectTier = InferSelectModel<typeof tiers>;
export type InsertTier = InferInsertModel<typeof tiers>;

//  Relations - Updated field references
export const tiersRelations = relations(tiers, ({ one }) => ({
	// Audit relations - Updated field names
	createdByUser: one(users, {
		fields: [tiers.createdBy],
		references: [users.id],
	}),
	updatedByUser: one(users, {
		fields: [tiers.updatedBy],
		references: [users.id],
	}),
}));
