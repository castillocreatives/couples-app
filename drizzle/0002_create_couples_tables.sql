DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE capacity_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  care_cue TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  local_date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE friction_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  need TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE dig_ins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  observation TEXT NOT NULL,
  story TEXT NOT NULL,
  impact TEXT NOT NULL,
  need TEXT NOT NULL,
  request TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE weekly_reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
  appreciate TEXT NOT NULL,
  own TEXT NOT NULL,
  intention TEXT NOT NULL,
  submitted_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX weekly_profile_week_unique ON weekly_reflections(profile_id, week_key);
--> statement-breakpoint
CREATE INDEX capacity_profile_date_idx ON capacity_checkins(profile_id, local_date, created_at);
--> statement-breakpoint
CREATE INDEX friction_profile_created_idx ON friction_notes(profile_id, created_at);
