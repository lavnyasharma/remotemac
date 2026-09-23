-- Up Migration
CREATE TYPE device_pair_status AS ENUM ('pending', 'approved', 'rejected', 'revoked');

CREATE TABLE device_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mac_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  remote_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status device_pair_status NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT device_pairs_distinct_devices CHECK (mac_device_id <> remote_device_id)
);

CREATE INDEX device_pairs_mac_device_id_idx ON device_pairs(mac_device_id);
CREATE INDEX device_pairs_remote_device_id_idx ON device_pairs(remote_device_id);
-- Only one active (pending or approved) pair per (mac, remote) combination.
CREATE UNIQUE INDEX device_pairs_active_unique_idx ON device_pairs(mac_device_id, remote_device_id)
  WHERE status IN ('pending', 'approved');

-- Down Migration
DROP TABLE device_pairs;
DROP TYPE device_pair_status;
