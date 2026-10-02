CREATE TABLE `controller` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text,
	`owner_email` text,
	`config` text NOT NULL,
	`runtime` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`kind` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`alignment` text NOT NULL,
	`accent` integer NOT NULL,
	`source` text NOT NULL,
	`author` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`duration` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`error` text,
	`business_key` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_business_key_unique` ON `messages` (`business_key`);--> statement-breakpoint
CREATE INDEX `messages_status_scheduled` ON `messages` (`status`,`scheduled_at`);