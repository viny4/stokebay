// The SQLite schema, as numbered migrations. `PRAGMA user_version` records how many have run,
// so opening an older database applies only the missing steps. Never edit a shipped step:
// add a new one, so existing users' data is upgraded rather than rebuilt.
//
// Lists and small nested values (world order, Git info, checklist items, file refs, event
// payloads, setting values) are stored as JSON text: they are always read and written whole.
// There are no foreign-key constraints on purpose: older data files can hold dangling ids
// (e.g. a world tag whose world was deleted) and must still import; the store does the
// cascading deletes itself, exactly as the JSON store did.

export const MIGRATIONS: readonly string[] = [
  // 1: everything the JSON store held, plus the full-text index.
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE worlds (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    icon       TEXT,
    sort_order INTEGER NOT NULL
  );

  -- seq is a stable integer key for the full-text index (implicit rowids may be renumbered).
  CREATE TABLE projects (
    seq           INTEGER PRIMARY KEY,
    id            TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    path          TEXT,
    status        TEXT NOT NULL,
    kind          TEXT NOT NULL,
    blueprint_id  TEXT,
    parts_bin     INTEGER NOT NULL,
    color         TEXT,
    is_work       INTEGER NOT NULL,
    is_sample     INTEGER NOT NULL,
    world_ids     TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    last_event_at INTEGER NOT NULL,
    archived_at   INTEGER,
    git           TEXT
  );

  CREATE TABLE pauses (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    paused_at       INTEGER NOT NULL,
    resumed_at      INTEGER,
    where_i_stopped TEXT NOT NULL,
    next_step       TEXT NOT NULL
  );
  CREATE INDEX pauses_project ON pauses (project_id, resumed_at);

  CREATE TABLE entries (
    seq        INTEGER PRIMARY KEY,
    id         TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL,
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    url        TEXT,
    checklist  TEXT,
    file       TEXT,
    module_id  TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX entries_project ON entries (project_id, created_at);

  -- Append-only activity log.
  CREATE TABLE events (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL,
    project_id TEXT,
    payload    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX events_project ON events (project_id, created_at);

  CREATE TABLE modules (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title      TEXT NOT NULL,
    color      TEXT,
    sort_order INTEGER NOT NULL
  );
  CREATE INDEX modules_project ON modules (project_id);

  CREATE TABLE parts (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    module_id       TEXT,
    name            TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    unit_cost_minor INTEGER,
    currency        TEXT NOT NULL,
    supplier_url    TEXT,
    status          TEXT NOT NULL,
    notes           TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );
  CREATE INDEX parts_project ON parts (project_id, created_at);

  CREATE TABLE canvas_nodes (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    ref_type   TEXT NOT NULL,
    ref_id     TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    w          REAL,
    h          REAL
  );
  CREATE INDEX canvas_nodes_project ON canvas_nodes (project_id);

  CREATE TABLE canvas_edges (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    from_node_id TEXT NOT NULL,
    to_node_id   TEXT NOT NULL
  );
  CREATE INDEX canvas_edges_project ON canvas_edges (project_id);

  -- Full-text search over project titles and entry titles/bodies: index-only tables that
  -- point back at their row by seq, kept in sync by the triggers below.
  CREATE VIRTUAL TABLE projects_fts USING fts5 (
    title,
    content = 'projects', content_rowid = 'seq',
    tokenize = 'unicode61 remove_diacritics 2'
  );
  CREATE VIRTUAL TABLE entries_fts USING fts5 (
    title, body,
    content = 'entries', content_rowid = 'seq',
    tokenize = 'unicode61 remove_diacritics 2'
  );

  CREATE TRIGGER projects_fts_insert AFTER INSERT ON projects BEGIN
    INSERT INTO projects_fts (rowid, title) VALUES (new.seq, new.title);
  END;
  CREATE TRIGGER projects_fts_update AFTER UPDATE OF title ON projects BEGIN
    INSERT INTO projects_fts (projects_fts, rowid, title) VALUES ('delete', old.seq, old.title);
    INSERT INTO projects_fts (rowid, title) VALUES (new.seq, new.title);
  END;
  CREATE TRIGGER projects_fts_delete AFTER DELETE ON projects BEGIN
    INSERT INTO projects_fts (projects_fts, rowid, title) VALUES ('delete', old.seq, old.title);
  END;

  CREATE TRIGGER entries_fts_insert AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts (rowid, title, body) VALUES (new.seq, new.title, new.body);
  END;
  CREATE TRIGGER entries_fts_update AFTER UPDATE OF title, body ON entries BEGIN
    INSERT INTO entries_fts (entries_fts, rowid, title, body)
    VALUES ('delete', old.seq, old.title, old.body);
    INSERT INTO entries_fts (rowid, title, body) VALUES (new.seq, new.title, new.body);
  END;
  CREATE TRIGGER entries_fts_delete AFTER DELETE ON entries BEGIN
    INSERT INTO entries_fts (entries_fts, rowid, title, body)
    VALUES ('delete', old.seq, old.title, old.body);
  END;
  `,

  // 2: what Git showed when a project was paused, and an optional "remind me" time.
  `
  ALTER TABLE pauses ADD COLUMN git_context TEXT;
  ALTER TABLE pauses ADD COLUMN remind_at INTEGER;
  CREATE INDEX pauses_remind ON pauses (remind_at) WHERE remind_at IS NOT NULL;
  `,
];
