CREATE TABLE `household_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`created_by` text,
	`created_at` text,
	`data` text,
	`reason` text
);
--> statement-breakpoint
CREATE TABLE `household_invites` (
	`hash` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_by` text,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `household_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mutation_receipts` (
	`key` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`request_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL
);
