CREATE TABLE staging_state (
  owner TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL
);
