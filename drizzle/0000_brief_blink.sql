CREATE TABLE "correction_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"score" integer NOT NULL,
	"mistake_count" integer NOT NULL,
	"categories_json" jsonb NOT NULL,
	"original_text" text,
	"corrected_text" text,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"auth_provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"email" text,
	"display_name" text,
	"dialect" text DEFAULT 'en-US' NOT NULL,
	"explanation_language" text DEFAULT 'English' NOT NULL,
	"translation_language" text DEFAULT 'Polish' NOT NULL,
	"store_sentences" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"word_id" text NOT NULL,
	"user_id" text NOT NULL,
	"result" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_words" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"word" text NOT NULL,
	"translation" text NOT NULL,
	"definition" text NOT NULL,
	"part_of_speech" text NOT NULL,
	"pronunciation" text NOT NULL,
	"cefr_level" text NOT NULL,
	"example" text NOT NULL,
	"target_language" text NOT NULL,
	"next_review_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interval_days" integer DEFAULT 1 NOT NULL,
	"ease_factor" real DEFAULT 2.5 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correction_events" ADD CONSTRAINT "correction_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_reviews" ADD CONSTRAINT "vocabulary_reviews_word_id_vocabulary_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."vocabulary_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_reviews" ADD CONSTRAINT "vocabulary_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_words" ADD CONSTRAINT "vocabulary_words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_correction_events_user_created" ON "correction_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_provider_identity" ON "users" USING btree ("auth_provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "idx_vocabulary_reviews_user_reviewed" ON "vocabulary_reviews" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "idx_vocabulary_words_user_review" ON "vocabulary_words" USING btree ("user_id","next_review_at");