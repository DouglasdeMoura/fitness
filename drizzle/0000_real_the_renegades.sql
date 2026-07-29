CREATE TABLE `account` (
	`access_token` text,
	`access_token_expires_at` integer,
	`account_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`id_token` text,
	`password` text,
	`provider_id` text NOT NULL,
	`refresh_token` text,
	`refresh_token_expires_at` integer,
	`scope` text,
	`updated_at` integer NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `body_logs` (
	`body_fat_pct` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`date` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`muscle_mass_kg` real,
	`notes` text,
	`user_id` integer NOT NULL,
	`waist_cm` real,
	`weight_kg` real,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_logs_user_date_unique` ON `body_logs` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`category` text DEFAULT 'compound' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`equipment` text,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instructions` text,
	`muscle_group` text NOT NULL,
	`name` text NOT NULL,
	CONSTRAINT "exercises_category_check" CHECK("exercises"."category" in ('compound', 'isolation', 'bodyweight', 'cardio', 'mobility'))
);
--> statement-breakpoint
CREATE INDEX `idx_exercises_muscle` ON `exercises` (`muscle_group`);--> statement-breakpoint
CREATE TABLE `food_log` (
	`calories` real NOT NULL,
	`carbs_g` real NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`custom_name` text,
	`date` text NOT NULL,
	`fat_g` real NOT NULL,
	`food_id` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_type` text DEFAULT 'snack' NOT NULL,
	`notes` text,
	`protein_g` real NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "food_log_meal_type_check" CHECK("food_log"."meal_type" in ('breakfast', 'lunch', 'dinner', 'snack'))
);
--> statement-breakpoint
CREATE INDEX `idx_food_log_date` ON `food_log` (`date`);--> statement-breakpoint
CREATE INDEX `idx_food_log_user_date` ON `food_log` (`user_id`,"date" desc);--> statement-breakpoint
CREATE TABLE `foods` (
	`barcode` text,
	`brand` text,
	`calories_per_serving` real NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`fiber_g` real DEFAULT 0 NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`serving_size` real DEFAULT 100 NOT NULL,
	`serving_unit` text DEFAULT 'g' NOT NULL,
	`sodium_mg` real DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`sugar_g` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_foods_name` ON `foods` (`name`);--> statement-breakpoint
CREATE INDEX `idx_foods_barcode` ON `foods` (`barcode`);--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`date` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_type` text NOT NULL,
	`template_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `meal_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "meal_plans_meal_type_check" CHECK("meal_plans"."meal_type" in ('breakfast', 'lunch', 'dinner', 'snack'))
);
--> statement-breakpoint
CREATE INDEX `idx_meal_plans_date` ON `meal_plans` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plans_user_date_meal_unique` ON `meal_plans` (`user_id`,`date`,`meal_type`);--> statement-breakpoint
CREATE TABLE `meal_template_items` (
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`food_id` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`sort_order` integer NOT NULL,
	`template_id` integer NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `meal_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meal_templates` (
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`default_meal_type` text DEFAULT 'lunch' NOT NULL,
	`description` text,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "meal_templates_default_meal_type_check" CHECK("meal_templates"."default_meal_type" in ('breakfast', 'lunch', 'dinner', 'snack'))
);
--> statement-breakpoint
CREATE INDEX `idx_meal_templates_user` ON `meal_templates` (`user_id`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`delivered_at` text NOT NULL,
	`slot` text NOT NULL,
	`type` text NOT NULL,
	`user_id` integer NOT NULL,
	PRIMARY KEY(`user_id`, `type`, `slot`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`meal_reminders` integer DEFAULT 0 NOT NULL,
	`meal_times` text,
	`quiet_end` text,
	`quiet_start` text,
	`rest_timer` integer DEFAULT 0 NOT NULL,
	`user_id` integer PRIMARY KEY NOT NULL,
	`weekly_review` integer DEFAULT 0 NOT NULL,
	`weekly_review_day` integer,
	`weekly_review_time` text,
	`workout_days` text,
	`workout_reminders` integer DEFAULT 0 NOT NULL,
	`workout_time` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `program_days` (
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`day_name` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_id` integer NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `program_exercises` (
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`exercise_id` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_day_id` integer NOT NULL,
	`rest_seconds` integer,
	`sort_order` integer NOT NULL,
	`target_reps` text,
	`target_rpe` integer,
	`target_sets` integer,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_day_id`) REFERENCES `program_days`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`description` text,
	`frequency_per_week` integer DEFAULT 3 NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_active` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`periodization_type` text DEFAULT 'linear' NOT NULL,
	`progression_increment_pct` real DEFAULT 2.5 NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "programs_periodization_type_check" CHECK("programs"."periodization_type" in ('linear', 'dup'))
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`auth` text NOT NULL,
	`created_at` text NOT NULL,
	`endpoint` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`p256dh` text NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_user` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`ip_address` text,
	`token` text NOT NULL,
	`updated_at` integer NOT NULL,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`applied_at` text DEFAULT (datetime('now')) NOT NULL,
	`client_id` text PRIMARY KEY NOT NULL,
	`error` text,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`queued_at` text NOT NULL,
	`result_id` integer,
	`status` text DEFAULT 'applied' NOT NULL,
	`temp_ref` text,
	`user_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sync_queue_status_check" CHECK("sync_queue"."status" in ('applied', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_sync_queue_temp_ref` ON `sync_queue` (`temp_ref`);--> statement-breakpoint
CREATE INDEX `idx_sync_queue_user` ON `sync_queue` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`activity_level` text DEFAULT 'moderate',
	`birth_date` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`goal_type` text DEFAULT 'build_muscle',
	`height_cm` integer,
	`id` text PRIMARY KEY NOT NULL,
	`image` text,
	`name` text NOT NULL,
	`sex` text DEFAULT 'male',
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `users` (
	`activity_level` text DEFAULT 'moderate' NOT NULL,
	`auth_user_id` text,
	`birth_date` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`email` text,
	`goal_type` text DEFAULT 'build_muscle' NOT NULL,
	`height_cm` real,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT 'Athlete' NOT NULL,
	`sex` text DEFAULT 'male' NOT NULL,
	`theme_preference` text DEFAULT 'system' NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "users_sex_check" CHECK("users"."sex" in ('male', 'female', 'other')),
	CONSTRAINT "users_activity_level_check" CHECK("users"."activity_level" in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
	CONSTRAINT "users_goal_type_check" CHECK("users"."goal_type" in ('lose_fat', 'build_muscle', 'maintain', 'recomp')),
	CONSTRAINT "users_theme_preference_check" CHECK("users"."theme_preference" in ('light', 'dark', 'system'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_user_id_unique` ON `users` (`auth_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`date` text NOT NULL,
	`duration_minutes` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`notes` text,
	`program_day_id` integer,
	`program_id` integer,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`program_day_id`) REFERENCES `program_days`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workout_sessions_date` ON `workout_sessions` (`date`);--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`exercise_id` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notes` text,
	`reps` integer,
	`rest_seconds` integer,
	`rpe` integer DEFAULT 7 NOT NULL,
	`session_id` integer NOT NULL,
	`set_number` integer NOT NULL,
	`weight_kg` real,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workout_sets_exercise` ON `workout_sets` (`exercise_id`,"id" desc);