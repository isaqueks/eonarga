ALTER TABLE `post_comments` ADD `photo_id` text;--> statement-breakpoint
ALTER TABLE `post_comments` ADD `photo_width` integer;--> statement-breakpoint
ALTER TABLE `post_comments` ADD `photo_height` integer;--> statement-breakpoint
ALTER TABLE `post_comments` ADD `audio_id` text;--> statement-breakpoint
ALTER TABLE `post_comments` ADD `audio_ext` text;--> statement-breakpoint
ALTER TABLE `post_comments` ADD `audio_duration_ms` integer;--> statement-breakpoint
ALTER TABLE `post_comments` ADD `audio_peaks` text;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `photo_id` text;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `photo_width` integer;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `photo_height` integer;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `audio_id` text;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `audio_ext` text;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `audio_duration_ms` integer;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `audio_peaks` text;