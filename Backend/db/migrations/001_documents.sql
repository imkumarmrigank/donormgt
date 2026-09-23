-- Document store: one row per record, grouped by collection path.
CREATE TABLE IF NOT EXISTS documents (
  collection_path  text        NOT NULL,
  id               text        NOT NULL,
  collection_group text        NOT NULL,
  parent_path      text,
  data             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_path, id)
);

CREATE INDEX IF NOT EXISTS documents_group_idx ON documents (collection_group);
CREATE INDEX IF NOT EXISTS documents_parent_idx ON documents (parent_path);
CREATE INDEX IF NOT EXISTS documents_data_gin ON documents USING gin (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS documents_date_idx ON documents (collection_path, (data -> 'date'));
CREATE INDEX IF NOT EXISTS documents_created_idx ON documents (collection_path, (data -> 'createdAt'));
CREATE INDEX IF NOT EXISTS documents_partner_idx ON documents (collection_path, (data -> 'partnerId'));
CREATE INDEX IF NOT EXISTS documents_donor_idx ON documents (collection_path, (data -> 'donorId'));
CREATE INDEX IF NOT EXISTS documents_pickup_idx ON documents (collection_path, (data -> 'pickupId'));
CREATE INDEX IF NOT EXISTS documents_mobile_idx ON documents (collection_path, (data -> 'normalizedMobile'));

-- Login credentials (the user profile itself lives in documents/users).
CREATE TABLE IF NOT EXISTS auth_accounts (
  uid            text        PRIMARY KEY,
  email          text        NOT NULL,
  password_hash  text        NOT NULL,
  disabled       boolean     NOT NULL DEFAULT false,
  token_version  integer     NOT NULL DEFAULT 0,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_accounts_email_idx ON auth_accounts (lower(email));

-- Read-only views so each collection can be browsed by name in the Neon console.
DO $$
DECLARE
  name text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'users', 'donors', 'pickupPartners', 'pickups', 'payments', 'dailyAggregates',
    'sksInflows', 'sksOutflows', 'rstItems', 'sksItems', 'cities', 'sectors',
    'societies', 'counters', 'systemConfig'
  ] LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW %I AS SELECT id, data, created_at, updated_at FROM documents WHERE collection_path = %L',
      'v_' || lower(regexp_replace(name, '([a-z])([A-Z])', '\1_\2', 'g')), name
    );
  END LOOP;
END $$;
