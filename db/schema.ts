import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  authProvider: text("auth_provider").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  email: text("email"),
  displayName: text("display_name"),
  dialect: text("dialect").notNull().default("en-US"),
  explanationLanguage: text("explanation_language").notNull().default("English"),
  translationLanguage: text("translation_language").notNull().default("Polish"),
  storeSentences: integer("store_sentences", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_users_provider_identity").on(table.authProvider, table.providerUserId),
]);

export const correctionEvents = sqliteTable("correction_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  mistakeCount: integer("mistake_count").notNull(),
  categoriesJson: text("categories_json").notNull(),
  originalText: text("original_text"),
  correctedText: text("corrected_text"),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_correction_events_user_created").on(table.userId, table.createdAt),
]);

export const vocabularyWords = sqliteTable("vocabulary_words", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  word: text("word").notNull(),
  translation: text("translation").notNull(),
  definition: text("definition").notNull(),
  partOfSpeech: text("part_of_speech").notNull(),
  pronunciation: text("pronunciation").notNull(),
  cefrLevel: text("cefr_level").notNull(),
  example: text("example").notNull(),
  targetLanguage: text("target_language").notNull(),
  nextReviewAt: text("next_review_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  intervalDays: integer("interval_days").notNull().default(1),
  easeFactor: real("ease_factor").notNull().default(2.5),
  reviewCount: integer("review_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_vocabulary_words_user_review").on(table.userId, table.nextReviewAt),
]);

export const vocabularyReviews = sqliteTable("vocabulary_reviews", {
  id: text("id").primaryKey(),
  wordId: text("word_id").notNull().references(() => vocabularyWords.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  result: text("result").notNull(),
  reviewedAt: text("reviewed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_vocabulary_reviews_user_reviewed").on(table.userId, table.reviewedAt),
]);
