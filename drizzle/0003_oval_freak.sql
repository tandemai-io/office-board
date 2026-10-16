CREATE TABLE `engineering_deployments` (
	`workflow` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`started_at` integer NOT NULL,
	`run_id` integer NOT NULL,
	`attempt` integer NOT NULL,
	`rank` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`received_at` integer NOT NULL
);
