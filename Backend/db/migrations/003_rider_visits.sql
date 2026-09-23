-- Rider assignment on pickups and the rider visit log.
CREATE INDEX IF NOT EXISTS documents_rider_idx ON documents (collection_path, (data -> 'riderId'));

CREATE OR REPLACE VIEW v_pickup_visits AS
  SELECT id, data, created_at, updated_at FROM documents WHERE collection_path = 'pickupVisits';
CREATE OR REPLACE VIEW v_visit_outcomes AS
  SELECT id, data, created_at, updated_at FROM documents WHERE collection_path = 'visitOutcomes';
