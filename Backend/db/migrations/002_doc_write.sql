-- Single-round-trip document writes. The app sits far from the database, so each
-- write (lock, read-modify-write, upsert) runs server side in one call.

-- Set a value at a path, creating intermediate maps as needed.
CREATE OR REPLACE FUNCTION doc_set_path(doc jsonb, path text[], val jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  i int;
  node jsonb;
BEGIN
  IF coalesce(array_length(path, 1), 0) = 0 THEN
    RETURN val;
  END IF;
  FOR i IN 1 .. array_length(path, 1) - 1 LOOP
    node := doc #> path[1:i];
    IF node IS NULL OR jsonb_typeof(node) <> 'object' THEN
      doc := jsonb_set(doc, path[1:i], '{}'::jsonb, true);
    END IF;
  END LOOP;
  RETURN jsonb_set(doc, path, val, true);
END $$;

-- Resolve a written value against the current one. Transforms arrive as
-- {"__fv": "increment" | "arrayUnion" | "arrayRemove" | "ensureMap", "operand": ...}.
CREATE OR REPLACE FUNCTION doc_resolve(cur jsonb, val jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  op text;
  result jsonb;
  item jsonb;
BEGIN
  IF val IS NULL OR jsonb_typeof(val) <> 'object' OR NOT (val ? '__fv') THEN
    RETURN val;
  END IF;
  op := val ->> '__fv';
  IF op = 'increment' THEN
    RETURN to_jsonb(
      coalesce(CASE WHEN jsonb_typeof(cur) = 'number' THEN (cur #>> '{}')::numeric END, 0)
      + (val ->> 'operand')::numeric
    );
  ELSIF op = 'arrayUnion' THEN
    result := CASE WHEN jsonb_typeof(cur) = 'array' THEN cur ELSE '[]'::jsonb END;
    FOR item IN SELECT value FROM jsonb_array_elements(val -> 'operand') LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result) e WHERE e.value = item) THEN
        result := result || jsonb_build_array(item);
      END IF;
    END LOOP;
    RETURN result;
  ELSIF op = 'arrayRemove' THEN
    RETURN coalesce((
      SELECT jsonb_agg(e.value ORDER BY e.ord)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cur) = 'array' THEN cur ELSE '[]'::jsonb END)
             WITH ORDINALITY AS e(value, ord)
       WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(val -> 'operand') r WHERE r.value = e.value)
    ), '[]'::jsonb);
  ELSIF op = 'ensureMap' THEN
    RETURN CASE WHEN jsonb_typeof(cur) = 'object' THEN cur ELSE '{}'::jsonb END;
  END IF;
  RAISE EXCEPTION 'Unknown field transform: %', op;
END $$;

-- Lock a document for writing, including one that does not exist yet.
CREATE OR REPLACE FUNCTION doc_lock(p_coll text, p_id text)
RETURNS TABLE (data jsonb, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY SELECT d.data, d.created_at, d.updated_at FROM documents d
    WHERE d.collection_path = p_coll AND d.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    -- No row to lock: serialise creators on the document path instead.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_coll || '/' || p_id, 0));
    RETURN QUERY SELECT d.data, d.created_at, d.updated_at FROM documents d
      WHERE d.collection_path = p_coll AND d.id = p_id FOR UPDATE;
  END IF;
END $$;

-- p_mode:
--   set     p_body is the whole document (replaces it)
--   create  p_body is the whole document; fails if it exists
--   merge   p_body is [[path, value], ...]; applied onto the current document
--   update  like merge, but fails if the document does not exist
--   delete  removes the document
CREATE OR REPLACE FUNCTION doc_write(
  p_coll text, p_id text, p_group text, p_parent text, p_mode text, p_body jsonb
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cur jsonb;
  exists_now boolean;
  pair jsonb;
  path text[];
  next jsonb;
BEGIN
  IF p_mode = 'delete' THEN
    DELETE FROM documents WHERE collection_path = p_coll AND id = p_id;
    RETURN;
  END IF;

  IF p_mode = 'set' THEN
    next := p_body;
  ELSE
    SELECT l.data INTO cur FROM doc_lock(p_coll, p_id) l;
    exists_now := FOUND;

    IF p_mode = 'create' THEN
      IF exists_now THEN
        RAISE EXCEPTION '6 ALREADY_EXISTS: Document already exists: %/%', p_coll, p_id USING ERRCODE = 'P0006';
      END IF;
      next := p_body;
    ELSE
      IF p_mode = 'update' AND NOT exists_now THEN
        RAISE EXCEPTION '5 NOT_FOUND: No document to update: %/%', p_coll, p_id USING ERRCODE = 'P0005';
      END IF;
      next := coalesce(cur, '{}'::jsonb);
      FOR pair IN SELECT value FROM jsonb_array_elements(p_body) LOOP
        path := ARRAY(SELECT jsonb_array_elements_text(pair -> 0));
        IF jsonb_typeof(pair -> 1) = 'object' AND (pair -> 1 ->> '__fv') = 'delete' THEN
          next := next #- path;
        ELSE
          next := doc_set_path(next, path, doc_resolve(next #> path, pair -> 1));
        END IF;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO documents (collection_path, id, collection_group, parent_path, data)
  VALUES (p_coll, p_id, p_group, p_parent, next)
  ON CONFLICT (collection_path, id)
  DO UPDATE SET data = EXCLUDED.data, updated_at = now();
END $$;
