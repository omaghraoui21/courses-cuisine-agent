import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const householdStates = sqliteTable('household_states', {
  userId: text('user_id').primaryKey(),
  data: text('data').notNull(),
  version: integer('version').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});
export const orderDrafts = sqliteTable('order_drafts', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), payload: text('payload').notNull(),
  status: text('status').notNull(), expiresAt: integer('expires_at').notNull(), createdAt: integer('created_at').notNull(),
});
export const visionUsage = sqliteTable('vision_usage', {
 key:text('key').primaryKey(), count:integer('count').notNull().default(0),
});
