CREATE TABLE `lesson_progress` (
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`progress_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`mutation_token` text NOT NULL,
	PRIMARY KEY(`user_id`, `lesson_id`),
	FOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "lesson_progress_version" CHECK("lesson_progress"."version" >= 1),
	CONSTRAINT "lesson_progress_json" CHECK(json_valid("lesson_progress"."progress_json"))
);
--> statement-breakpoint
CREATE TABLE `lesson_records` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_json` text NOT NULL,
	`published_json` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`mutation_token` text NOT NULL,
	CONSTRAINT "lesson_record_status" CHECK("lesson_records"."status" IN ('draft','published','withdrawn')),
	CONSTRAINT "lesson_record_versions" CHECK("lesson_records"."version" >= 1 AND "lesson_records"."revision" >= 0),
	CONSTRAINT "lesson_record_json" CHECK(json_valid("lesson_records"."draft_json") AND ("lesson_records"."published_json" IS NULL OR json_valid("lesson_records"."published_json")))
);
--> statement-breakpoint
CREATE TABLE `lesson_revisions` (
	`lesson_id` text NOT NULL,
	`revision` integer NOT NULL,
	`manifest_json` text NOT NULL,
	`created_at` text NOT NULL,
	`actor_id` text NOT NULL,
	PRIMARY KEY(`lesson_id`, `revision`),
	FOREIGN KEY (`lesson_id`) REFERENCES `lesson_records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "lesson_revision_version" CHECK("lesson_revisions"."revision" >= 1),
	CONSTRAINT "lesson_revision_json" CHECK(json_valid("lesson_revisions"."manifest_json"))
);
