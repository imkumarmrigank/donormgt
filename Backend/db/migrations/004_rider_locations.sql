-- Latest position per rider, for the admin live map.
CREATE INDEX IF NOT EXISTS documents_updated_idx ON documents (collection_path, (data -> 'updatedAt'));
CREATE OR REPLACE VIEW v_rider_locations AS
  SELECT id, data, created_at, updated_at FROM documents WHERE collection_path = 'riderLocations';
