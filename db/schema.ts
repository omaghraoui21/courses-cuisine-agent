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
export const households = sqliteTable('households', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(),
  name: text('name').notNull(), createdAt: text('created_at').notNull(),
});
export const householdMembers = sqliteTable('household_members', {
  userId: text('user_id').primaryKey(), householdId: text('household_id').notNull(),
  role: text('role').notNull(),
});
export const householdInvites = sqliteTable('household_invites', {
  hash: text('hash').primaryKey(), householdId: text('household_id').notNull(),
  createdBy: text('created_by').notNull(), expiresAt: integer('expires_at').notNull(),
  usedBy: text('used_by'), usedAt: integer('used_at'),
});
export const householdBackups = sqliteTable('household_backups', {
  id:text('id').primaryKey(), scopeId:text('scope_id').notNull(), createdBy:text('created_by'),
  createdAt:text('created_at'), data:text('data'), reason:text('reason'),
});
export const mutationReceipts = sqliteTable('mutation_receipts', {
  key:text('key').primaryKey(), scopeId:text('scope_id').notNull(), requestId:text('request_id').notNull(),
  actorId:text('actor_id').notNull(), fingerprint:text('fingerprint').notNull(), createdAt:text('created_at').notNull(),
});
