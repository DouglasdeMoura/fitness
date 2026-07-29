PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
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
	CONSTRAINT "users_sex_check" CHECK("__new_users"."sex" in ('male', 'female', 'other')),
	CONSTRAINT "users_activity_level_check" CHECK("__new_users"."activity_level" in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
	CONSTRAINT "users_goal_type_check" CHECK("__new_users"."goal_type" in ('lose_fat', 'build_muscle', 'maintain', 'recomp')),
	CONSTRAINT "users_theme_preference_check" CHECK("__new_users"."theme_preference" in ('light', 'dark', 'system'))
);
--> statement-breakpoint
INSERT INTO `__new_users`("activity_level", "auth_user_id", "birth_date", "created_at", "email", "goal_type", "height_cm", "id", "name", "sex", "theme_preference", "updated_at") SELECT "activity_level", "auth_user_id", "birth_date", "created_at", "email", "goal_type", "height_cm", "id", "name", "sex", 'system', "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_user_id_unique` ON `users` (`auth_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
