ALTER TABLE `friction_notes` ADD `audio_blob_key` text;
--> statement-breakpoint
ALTER TABLE `friction_notes` ADD `audio_mime_type` text;
--> statement-breakpoint
ALTER TABLE `friction_notes` ADD `audio_duration_seconds` integer;
--> statement-breakpoint
CREATE TABLE `reminder_preferences` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `profile_id` integer NOT NULL,
  `morning_enabled` integer DEFAULT false NOT NULL,
  `morning_time` text DEFAULT '08:00' NOT NULL,
  `evening_enabled` integer DEFAULT false NOT NULL,
  `evening_time` text DEFAULT '20:00' NOT NULL,
  `gentle_nudges_enabled` integer DEFAULT false NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_profile_unique` ON `reminder_preferences` (`profile_id`);