ALTER TABLE `sync_queue` ADD `user_id` integer REFERENCES `users`(`id`);--> statement-breakpoint
CREATE INDEX `idx_sync_queue_user` ON `sync_queue` (`user_id`);
