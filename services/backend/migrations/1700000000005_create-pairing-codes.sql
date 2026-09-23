-- Up Migration
CREATE TABLE pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pairing_codes_code_hash_idx ON pairing_codes(code_hash);
CREATE INDEX pairing_codes_mac_device_id_idx ON pairing_codes(mac_device_id);

-- Down Migration
DROP TABLE pairing_codes;
