ALTER TABLE `users` ADD `auth_user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_user_id_unique` ON `users` (`auth_user_id`);