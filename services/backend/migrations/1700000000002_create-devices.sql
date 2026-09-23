-- Up Migration
CREATE TYPE device_type AS ENUM ('mac', 'iphone');
CREATE TYPE device_platform AS ENUM ('ios', 'macos');

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_type device_type NOT NULL,
  name TEXT NOT NULL,
  platform device_platform NOT NULL,
  public_identifier TEXT NOT NULL UNIQUE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX devices_user_id_idx ON devices(user_id);

-- Down Migration
DROP TABLE devices;
DROP TYPE device_platform;
DROP TYPE device_type;
