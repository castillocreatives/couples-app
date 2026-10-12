import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  roleOrder: integer("role_order").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const capacityCheckins = sqliteTable("capacity_checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  careCue: text("care_cue").notNull(),
  note: text("note").notNull().default(""),
  localDate: text("local_date").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const frictionNotes = sqliteTable("friction_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  body: text("body").notNull().default(""),
  need: text("need").notNull().default(""),
  audioBlobKey: text("audio_blob_key"),
  audioMimeType: text("audio_mime_type"),
  audioDurationSeconds: integer("audio_duration_seconds"),
  visibility: text("visibility", { enum: ["private", "shared"] }).notNull().default("private"),
  status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const reminderPreferences = sqliteTable("reminder_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  morningEnabled: integer("morning_enabled", { mode: "boolean" }).notNull().default(false),
  morningTime: text("morning_time").notNull().default("08:00"),
  eveningEnabled: integer("evening_enabled", { mode: "boolean" }).notNull().default(false),
  eveningTime: text("evening_time").notNull().default("20:00"),
  gentleNudgesEnabled: integer("gentle_nudges_enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [uniqueIndex("reminder_profile_unique").on(table.profileId)]);

export const digIns = sqliteTable("dig_ins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  observation: text("observation").notNull(),
  story: text("story").notNull(),
  impact: text("impact").notNull(),
  need: text("need").notNull(),
  request: text("request").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const weeklyReflections = sqliteTable("weekly_reflections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  weekKey: text("week_key").notNull(),
  rating: integer("rating").notNull(),
  appreciate: text("appreciate").notNull(),
  own: text("own").notNull(),
  intention: text("intention").notNull(),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [uniqueIndex("weekly_profile_week_unique").on(table.profileId, table.weekKey)]);
