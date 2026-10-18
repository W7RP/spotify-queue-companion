CREATE TABLE `accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`sealed` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`refresh_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `queue_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`selection_id` text NOT NULL,
	`state` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sealed` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_write_per_selection` ON `queue_jobs` (`user_id`,`selection_id`);--> statement-breakpoint
CREATE TABLE `queue_locks` (
	`user_id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_attempts` (
	`state` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`sealed` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `selections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`sealed` text NOT NULL,
	`expires_at` integer NOT NULL
);
