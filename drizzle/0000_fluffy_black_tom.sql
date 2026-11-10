CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`meeting_id` text NOT NULL,
	`item_id` text NOT NULL,
	`destination` text NOT NULL,
	`status` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_once` ON `deliveries` (`owner`,`meeting_id`,`item_id`,`destination`);--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`fingerprint` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_content` ON `meetings` (`owner`,`fingerprint`);