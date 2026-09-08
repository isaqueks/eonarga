ALTER TABLE `posts` ADD `flop_of_post_id` text REFERENCES posts(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `posts` ADD `flopped_at` text;