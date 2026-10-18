CREATE TABLE `household_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
