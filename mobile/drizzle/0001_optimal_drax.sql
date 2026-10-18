CREATE TABLE `pc_bridge` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`seen_at` integer DEFAULT 0 NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`models` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pc_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`state` text NOT NULL,
	`sealed` text NOT NULL,
	`result` text,
	`claim` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pc_requests_user_id_unique` ON `pc_requests` (`user_id`);