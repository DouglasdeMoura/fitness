ALTER TABLE `users` ADD COLUMN `theme_preference` text DEFAULT 'system' NOT NULL CONSTRAINT "users_theme_preference_check" CHECK("theme_preference" in ('light', 'dark', 'system'));
