-- Amygdala Cloudflare row store. Rows are room-keyed: every access goes through
-- the owning tenant's Durable Object, which can only address its own room_id
-- slice. There is no shared-index search here — search-vectors lives entirely
-- inside the tenant room (see src/cloudflare/do.ts).
CREATE TABLE IF NOT EXISTS room_rows (
  room_id    TEXT NOT NULL,
  table_name TEXT NOT NULL,
  id         TEXT NOT NULL,
  value      TEXT NOT NULL,        -- JSON-serialised row
  created_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, table_name, id)
);
CREATE INDEX IF NOT EXISTS idx_room_rows_table
  ON room_rows (room_id, table_name);
