import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Define the 'users' table using Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define the 'snn_personalities' table for persisted SNN personality configurations
export const snnPersonalities = pgTable('snn_personalities', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  profileId: text('profile_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  payloadJson: text('payload_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define the 'watchdog_audit_logs' table for persisted Watchdog gate evaluations
export const watchdogAuditLogs = pgTable('watchdog_audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  proposalId: text('proposal_id').notNull(),
  stageTag: text('stage_tag').notNull(),
  verdict: text('verdict').notNull(),
  payloadJson: text('payload_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  personalities: many(snnPersonalities),
  watchdogLogs: many(watchdogAuditLogs),
}));

export const snnPersonalitiesRelations = relations(snnPersonalities, ({ one }) => ({
  author: one(users, {
    fields: [snnPersonalities.userId],
    references: [users.id],
  }),
}));

export const watchdogAuditLogsRelations = relations(watchdogAuditLogs, ({ one }) => ({
  author: one(users, {
    fields: [watchdogAuditLogs.userId],
    references: [users.id],
  }),
}));
