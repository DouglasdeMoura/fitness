CREATE TABLE `body_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real,
	`body_fat_pct` real,
	`muscle_mass_kg` real,
	`waist_cm` real,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_logs_user_date_unique` ON `body_logs` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'compound' NOT NULL,
	`muscle_group` text NOT NULL,
	`equipment` text,
	`instructions` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "exercises_category_check" CHECK("exercises"."category" in ('compound', 'isolation', 'bodyweight', 'cardio', 'mobility'))
);
--> statement-breakpoint
CREATE INDEX `idx_exercises_muscle` ON `exercises` (`muscle_group`);--> statement-breakpoint
CREATE TABLE `food_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`food_id` integer,
	`custom_name` text,
	`date` text NOT NULL,
	`meal_type` text DEFAULT 'snack' NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`calories` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "food_log_meal_type_check" CHECK("food_log"."meal_type" in ('breakfast', 'lunch', 'dinner', 'snack'))
);
--> statement-breakpoint
CREATE INDEX `idx_food_log_date` ON `food_log` (`date`);--> statement-breakpoint
CREATE INDEX `idx_food_log_user_date` ON `food_log` (`user_id`,"date" desc);--> statement-breakpoint
CREATE TABLE `foods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`serving_size` real DEFAULT 100 NOT NULL,
	`serving_unit` text DEFAULT 'g' NOT NULL,
	`calories_per_serving` real NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`fiber_g` real DEFAULT 0 NOT NULL,
	`sugar_g` real DEFAULT 0 NOT NULL,
	`sodium_mg` real DEFAULT 0 NOT NULL,
	`barcode` text,
	`source` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_foods_name` ON `foods` (`name`);--> statement-breakpoint
CREATE INDEX `idx_foods_barcode` ON `foods` (`barcode`);--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`meal_type` text NOT NULL,
	`template_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `meal_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "meal_plans_meal_type_check" CHECK("meal_plans"."meal_type" in ('breakfast', 'lunch', 'dinner', 'snack'))
);
--> statement-breakpoint
CREATE INDEX `idx_meal_plans_date` ON `meal_plans` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plans_user_date_meal_unique` ON `meal_plans` (`user_id`,`date`,`meal_type`);--> statement-breakpoint
CREATE TABLE `meal_template_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`food_id` integer NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `meal_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meal_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`default_meal_type` text DEFAULT 'lunch' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "meal_templates_default_meal_type_check" CHECK("meal_templates"."default_meal_type" in ('breakfast', 'lunch', 'dinner', 'snack'))
);
--> statement-breakpoint
CREATE INDEX `idx_meal_templates_user` ON `meal_templates` (`user_id`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`slot` text NOT NULL,
	`delivered_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `type`, `slot`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`rest_timer` integer DEFAULT 0 NOT NULL,
	`meal_reminders` integer DEFAULT 0 NOT NULL,
	`meal_times` text,
	`workout_reminders` integer DEFAULT 0 NOT NULL,
	`workout_days` text,
	`workout_time` text,
	`weekly_review` integer DEFAULT 0 NOT NULL,
	`weekly_review_day` integer,
	`weekly_review_time` text,
	`quiet_start` text,
	`quiet_end` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `program_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_id` integer NOT NULL,
	`day_name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `program_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_day_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`target_sets` integer,
	`target_reps` text,
	`target_rpe` integer,
	`rest_seconds` integer,
	`sort_order` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`program_day_id`) REFERENCES `program_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`frequency_per_week` integer DEFAULT 3 NOT NULL,
	`periodization_type` text DEFAULT 'linear' NOT NULL,
	`progression_increment_pct` real DEFAULT 2.5 NOT NULL,
	`is_active` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "programs_periodization_type_check" CHECK("programs"."periodization_type" in ('linear', 'dup'))
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_user` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`client_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`temp_ref` text,
	`result_id` integer,
	`status` text DEFAULT 'applied' NOT NULL,
	`error` text,
	`queued_at` text NOT NULL,
	`applied_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "sync_queue_status_check" CHECK("sync_queue"."status" in ('applied', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_sync_queue_temp_ref` ON `sync_queue` (`temp_ref`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT 'Athlete' NOT NULL,
	`email` text,
	`birth_date` text,
	`sex` text DEFAULT 'male' NOT NULL,
	`height_cm` real,
	`activity_level` text DEFAULT 'moderate' NOT NULL,
	`goal_type` text DEFAULT 'build_muscle' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "users_sex_check" CHECK("users"."sex" in ('male', 'female', 'other')),
	CONSTRAINT "users_activity_level_check" CHECK("users"."activity_level" in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
	CONSTRAINT "users_goal_type_check" CHECK("users"."goal_type" in ('lose_fat', 'build_muscle', 'maintain', 'recomp'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`name` text,
	`duration_minutes` integer,
	`notes` text,
	`program_id` integer,
	`program_day_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_day_id`) REFERENCES `program_days`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workout_sessions_date` ON `workout_sessions` (`date`);--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`set_number` integer NOT NULL,
	`reps` integer,
	`weight_kg` real,
	`rpe` integer DEFAULT 7 NOT NULL,
	`rest_seconds` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workout_sets_exercise` ON `workout_sets` (`exercise_id`,"id" desc);