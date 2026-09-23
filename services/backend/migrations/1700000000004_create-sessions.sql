-- Up Migration
CREATE TYPE session_status AS ENUM ('active', 'ended');

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_pair_id UUID NOT NULL REFERENCES device_pairs(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status session_status NOT NULL DEFAULT 'active',
  disconnect_reason TEXT
);

CREATE INDEX sessions_device_pair_id_idx ON sessions(device_pair_id);

-- Down Migration
DROP TABLE sessions;
DROP TYPE session_status;
