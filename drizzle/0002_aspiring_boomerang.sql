CREATE TABLE `sports_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`requested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sports_requests_requested_at` ON `sports_requests` (`requested_at`);