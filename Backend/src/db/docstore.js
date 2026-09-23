/**
 * Document store on PostgreSQL with the subset of the Firestore Admin API this
 * backend uses (collections, sub-collections, queries, transactions, batches,
 * FieldValue transforms). Every document is one row of the `documents` table:
 *
 *   collection_path  "pickups" or "pickups/P-001/payments"
 *   id               document id
 *   collection_group last segment of collection_path, for collectionGroup()
 *   data             the document body as jsonb
 *
 * Keeping the Firestore shape let the service layer move over unchanged.
 */
const { randomBytes } = require("crypto");
const { pool } = require("../config/database");

const DOCUMENT_ID = "__name__";

// ── FieldValue sentinels ─────────────────────────────────────────────────────

class FieldTransform {
  constructor(kind, operand) {
    this.kind = kind;
    this.operand = operand;
  }
}

const FieldValue = {
  serverTimestamp: () => new Date().toISOString(),
  increment: (amount) => new FieldTransform("increment", Number(amount) || 0),
  arrayUnion: (...values) => new FieldTransform("arrayUnion", values),
  arrayRemove: (...values) => new FieldTransform("arrayRemove", values),
  delete: () => new FieldTransform("delete")
};

const FieldPath = {
  documentId: () => DOCUMENT_ID
};

const Timestamp = {
  fromMillis: (ms) => new Date(ms).toISOString(),
  now: () => new Date().toISOString(),
  fromDate: (date) => date.toISOString()
};

// ── Value helpers ────────────────────────────────────────────────────────────

function isPlainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && !(value instanceof Date)
    && !(value instanceof FieldTransform);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Resolve a written value against the current one (transforms, Dates, undefined). */
function resolveValue(value, current) {
  if (value instanceof FieldTransform) {
    switch (value.kind) {
      case "increment": return (typeof current === "number" ? current : 0) + value.operand;
      case "arrayUnion": {
        const base = Array.isArray(current) ? [...current] : [];
        value.operand.forEach((item) => {
          const plain = resolveValue(item);
          if (!base.some((existing) => sameValue(existing, plain))) base.push(plain);
        });
        return base;
      }
      case "arrayRemove": {
        const base = Array.isArray(current) ? current : [];
        const removals = value.operand.map((item) => resolveValue(item));
        return base.filter((existing) => !removals.some((item) => sameValue(existing, item)));
      }
      default: return undefined;
    }
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => resolveValue(item)).filter((item) => item !== undefined);
  if (isPlainObject(value)) {
    return Object.entries(value).reduce((acc, [key, item]) => {
      const resolved = resolveValue(item, undefined);
      if (resolved !== undefined) acc[key] = resolved;
      return acc;
    }, {});
  }
  return value;
}

function isDelete(value) {
  return value instanceof FieldTransform && value.kind === "delete";
}

/** set(..., { merge: true }): nested maps merge, everything else replaces. */
function deepMerge(target, patch) {
  const result = { ...target };
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) return;
    if (isDelete(value)) {
      delete result[key];
      return;
    }
    if (isPlainObject(value)) {
      result[key] = deepMerge(isPlainObject(result[key]) ? result[key] : {}, value);
      return;
    }
    result[key] = resolveValue(value, result[key]);
  });
  return result;
}

function autoId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(20);
  let id = "";
  for (let i = 0; i < 20; i++) id += chars[bytes[i] % chars.length];
  return id;
}

function notFound(path) {
  const error = new Error(`5 NOT_FOUND: No document to update: ${path}`);
  error.code = 5;
  return error;
}

function alreadyExists(path) {
  const error = new Error(`6 ALREADY_EXISTS: Document already exists: ${path}`);
  error.code = 6;
  return error;
}

// ── Snapshots ────────────────────────────────────────────────────────────────

class DocumentSnapshot {
  constructor(ref, data, row) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = data !== null && data !== undefined;
    this._data = this.exists ? data : undefined;
    this.createTime = row?.created_at || undefined;
    this.updateTime = row?.updated_at || undefined;
  }

  data() {
    return this.exists ? clone(this._data) : undefined;
  }

  get(field) {
    if (!this.exists) return undefined;
    if (field === DOCUMENT_ID) return this.id;
    return String(field).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), this._data);
  }
}

class QuerySnapshot {
  constructor(query, docs) {
    this.query = query;
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }

  forEach(callback, thisArg) {
    this.docs.forEach(callback, thisArg);
  }
}

// ── Low-level row access (works with the pool or a transaction client) ──────

async function readRow(client, collectionPath, id, { lock = false } = {}) {
  // doc_lock() row-locks an existing document, or takes an advisory lock on the
  // path of a missing one (e.g. an id counter), in a single round trip.
  const sql = lock
    ? "SELECT data, created_at, updated_at FROM doc_lock($1, $2)"
    : "SELECT data, created_at, updated_at FROM documents WHERE collection_path = $1 AND id = $2";
  const { rows } = await client.query(sql, [collectionPath, id]);
  return rows[0] || null;
}

/** Encode a written value for doc_write(): transforms become {"__fv": ...} markers. */
function encodeValue(value) {
  if (value instanceof FieldTransform) {
    const operand = Array.isArray(value.operand) ? value.operand.map((item) => resolveValue(item)) : value.operand;
    return { __fv: value.kind, operand };
  }
  return resolveValue(value);
}

/** set(..., { merge: true }) → leaf [path, value] pairs; nested maps merge. */
function mergePairs(data, prefix = [], pairs = []) {
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    const path = [...prefix, key];
    if (isPlainObject(value)) {
      if (Object.keys(value).length === 0) pairs.push([path, { __fv: "ensureMap" }]);
      else mergePairs(value, path, pairs);
      return;
    }
    pairs.push([path, encodeValue(value)]);
  });
  return pairs;
}

/** update() → [path, value] pairs; dotted keys address nested fields. */
function updatePairs(data) {
  return Object.entries(data || {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key.split("."), encodeValue(value)]);
}

function writeBody(type, data, options) {
  if (type === "delete") return { mode: "delete", body: null };
  if (type === "create") return { mode: "create", body: deepMerge({}, data) };
  if (type === "update") return { mode: "update", body: updatePairs(data) };
  const merge = options && (options.merge === true || Array.isArray(options.mergeFields));
  return merge
    ? { mode: "merge", body: mergePairs(data) }
    : { mode: "set", body: deepMerge({}, data) };
}

/** One write = one statement; doc_write() locks and merges server side. */
async function applyWrite(client, op) {
  const { type, ref, data, options } = op;
  const { mode, body } = writeBody(type, data, options);
  try {
    await client.query("SELECT doc_write($1, $2, $3, $4, $5, $6::jsonb)", [
      ref.parent.path,
      ref.id,
      ref.parent.id,
      ref.parent.parent ? ref.parent.parent.path : null,
      mode,
      body === null ? null : JSON.stringify(body)
    ]);
  } catch (error) {
    if (error.code === "P0005") throw notFound(ref.path);
    if (error.code === "P0006") throw alreadyExists(ref.path);
    throw error;
  }
}

async function withClient(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ── Query building ───────────────────────────────────────────────────────────

function jsonPath(field) {
  return `{${String(field).split(".").map((part) => `"${part.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
}

function toJsonParam(value) {
  return JSON.stringify(resolveValue(value));
}

function buildWhere(filter, params) {
  const { field, op, value } = filter;
  const add = (param) => {
    params.push(param);
    return `$${params.length}`;
  };

  if (field === DOCUMENT_ID) {
    const idOf = (item) => (item && typeof item === "object" && item.id ? item.id : String(item));
    switch (op) {
      case "==": return `id = ${add(idOf(value))}`;
      case "!=": return `id <> ${add(idOf(value))}`;
      case "in": return `id = ANY(${add((value || []).map(idOf))}::text[])`;
      case "not-in": return `NOT (id = ANY(${add((value || []).map(idOf))}::text[]))`;
      case "<": case "<=": case ">": case ">=":
        return `id COLLATE "C" ${op} ${add(idOf(value))}`;
      default: throw new Error(`Unsupported documentId operator: ${op}`);
    }
  }

  const expr = `(data #> ${add(jsonPath(field))}::text[])`;
  switch (op) {
    case "==":
      return `${expr} = ${add(toJsonParam(value))}::jsonb`;
    case "!=":
      return `(${expr} IS NOT NULL AND ${expr} <> ${add(toJsonParam(value))}::jsonb AND ${expr} <> 'null'::jsonb)`;
    case "in":
      return `${expr} = ANY(${add((value || []).map(toJsonParam))}::jsonb[])`;
    case "not-in":
      return `(${expr} IS NOT NULL AND NOT (${expr} = ANY(${add((value || []).map(toJsonParam))}::jsonb[])))`;
    case "array-contains":
      return `(jsonb_typeof(${expr}) = 'array' AND ${expr} @> ${add(JSON.stringify([resolveValue(value)]))}::jsonb)`;
    case "array-contains-any":
      return `(jsonb_typeof(${expr}) = 'array' AND ${expr} ?| ARRAY(SELECT jsonb_array_elements_text(${add(JSON.stringify(resolveValue(value)))}::jsonb)))`;
    case "<": case "<=": case ">": case ">=": {
      // Firestore range filters only match values of the same type.
      const param = add(toJsonParam(value));
      return `(jsonb_typeof(${expr}) = jsonb_typeof(${param}::jsonb) AND ${expr} ${op} ${param}::jsonb)`;
    }
    default:
      throw new Error(`Unsupported query operator: ${op}`);
  }
}

class Query {
  constructor(collection, state = {}) {
    this._collection = collection;
    this._state = {
      filters: [],
      orders: [],
      limit: null,
      offset: 0,
      startAfter: null,
      group: null,
      ...state
    };
  }

  get firestore() {
    return this._collection.firestore;
  }

  _with(patch) {
    return new Query(this._collection, { ...this._state, ...patch });
  }

  where(field, op, value) {
    return this._with({ filters: [...this._state.filters, { field: String(field), op, value }] });
  }

  orderBy(field, direction = "asc") {
    const dir = String(direction).toLowerCase() === "desc" ? "desc" : "asc";
    return this._with({ orders: [...this._state.orders, { field: String(field), direction: dir }] });
  }

  limit(count) {
    return this._with({ limit: Math.max(0, Number(count) || 0) });
  }

  offset(count) {
    return this._with({ offset: Math.max(0, Number(count) || 0) });
  }

  startAfter(...values) {
    return this._with({ startAfter: values });
  }

  select() {
    // Whole documents are returned; field projection is an optimisation only.
    return this;
  }

  count() {
    const query = this;
    return {
      async get() {
        const { sql, params } = query._toSql({ countOnly: true });
        const { rows } = await pool.query(sql, params);
        const count = Number(rows[0]?.count || 0);
        return { data: () => ({ count }) };
      }
    };
  }

  _toSql({ countOnly = false } = {}) {
    const params = [];
    const clauses = [];
    if (this._state.group) {
      params.push(this._state.group);
      clauses.push(`collection_group = $${params.length}`);
    } else {
      params.push(this._collection.path);
      clauses.push(`collection_path = $${params.length}`);
    }
    this._state.filters.forEach((filter) => clauses.push(buildWhere(filter, params)));

    const orderSql = [];
    this._state.orders.forEach(({ field, direction }) => {
      if (field === DOCUMENT_ID) {
        orderSql.push(`id COLLATE "C" ${direction}`);
        return;
      }
      params.push(jsonPath(field));
      const expr = `(data #> $${params.length}::text[])`;
      // Firestore leaves out documents that lack an orderBy field.
      clauses.push(`${expr} IS NOT NULL`);
      orderSql.push(`${expr} ${direction}`);
    });

    if (this._state.startAfter && this._state.orders.length) {
      const orders = this._state.orders.slice(0, this._state.startAfter.length);
      const alternatives = orders.map((_, index) => {
        const parts = orders.slice(0, index + 1).map(({ field, direction }, i) => {
          const raw = this._state.startAfter[i];
          if (field === DOCUMENT_ID) {
            params.push(raw && typeof raw === "object" && raw.id ? raw.id : String(raw));
            const cmp = i === index ? (direction === "desc" ? "<" : ">") : "=";
            return `id COLLATE "C" ${cmp} $${params.length}`;
          }
          params.push(jsonPath(field));
          const expr = `(data #> $${params.length}::text[])`;
          params.push(toJsonParam(raw));
          const cmp = i === index ? (direction === "desc" ? "<" : ">") : "=";
          return `${expr} ${cmp} $${params.length}::jsonb`;
        });
        return `(${parts.join(" AND ")})`;
      });
      clauses.push(`(${alternatives.join(" OR ")})`);
    }

    if (countOnly) {
      return { sql: `SELECT count(*)::int AS count FROM documents WHERE ${clauses.join(" AND ")}`, params };
    }

    const order = orderSql.length ? orderSql : [];
    order.push("collection_path", `id COLLATE "C" asc`);
    let sql = `SELECT collection_path, id, data, created_at, updated_at FROM documents WHERE ${clauses.join(" AND ")} ORDER BY ${order.join(", ")}`;
    if (this._state.limit !== null) sql += ` LIMIT ${Number(this._state.limit)}`;
    if (this._state.offset) sql += ` OFFSET ${Number(this._state.offset)}`;
    return { sql, params };
  }

  async _run(client) {
    const { sql, params } = this._toSql();
    const { rows } = await (client || pool).query(sql, params);
    const docs = rows.map((row) => {
      const collection = row.collection_path === this._collection.path
        ? this._collection
        : this.firestore.collection(row.collection_path);
      return new DocumentSnapshot(collection.doc(row.id), row.data, row);
    });
    return new QuerySnapshot(this, docs);
  }

  get() {
    return this._run();
  }
}

class CollectionReference extends Query {
  constructor(firestore, path, parentDoc = null) {
    super(null);
    this._collection = this;
    this._firestore = firestore;
    this.path = path;
    this.id = path.split("/").pop();
    this.parent = parentDoc;
  }

  get firestore() {
    return this._firestore;
  }

  doc(id) {
    const docId = id === undefined ? autoId() : String(id);
    if (!docId || docId.includes("/")) throw new Error(`Invalid document id: ${docId}`);
    return new DocumentReference(this, docId);
  }

  async add(data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

class DocumentReference {
  constructor(collection, id) {
    this.parent = collection;
    this.id = id;
    this.path = `${collection.path}/${id}`;
  }

  get firestore() {
    return this.parent.firestore;
  }

  collection(name) {
    return new CollectionReference(this.firestore, `${this.path}/${name}`, this);
  }

  async get() {
    const row = await readRow(pool, this.parent.path, this.id);
    return new DocumentSnapshot(this, row ? row.data : null, row);
  }

  set(data, options) {
    return applyWrite(pool, { type: "set", ref: this, data, options });
  }

  update(data) {
    return applyWrite(pool, { type: "update", ref: this, data });
  }

  create(data) {
    return applyWrite(pool, { type: "create", ref: this, data });
  }

  delete() {
    return applyWrite(pool, { type: "delete", ref: this });
  }

  isEqual(other) {
    return other instanceof DocumentReference && other.path === this.path;
  }
}

// ── Batches and transactions ─────────────────────────────────────────────────

class WriteBatch {
  constructor() {
    this._ops = [];
  }

  set(ref, data, options) { this._ops.push({ type: "set", ref, data, options }); return this; }
  update(ref, data) { this._ops.push({ type: "update", ref, data }); return this; }
  create(ref, data) { this._ops.push({ type: "create", ref, data }); return this; }
  delete(ref) { this._ops.push({ type: "delete", ref }); return this; }

  async commit() {
    const ops = this._ops;
    this._ops = [];
    if (!ops.length) return [];
    if (ops.length === 1) {
      await applyWrite(pool, ops[0]);
      return [{ writeTime: new Date().toISOString() }];
    }
    await withClient(async (client) => {
      for (const op of ops) await applyWrite(client, op);
    });
    return ops.map(() => ({ writeTime: new Date().toISOString() }));
  }
}

/** bulkWriter(): same API as a batch, committed on flush()/close(). */
class BulkWriter extends WriteBatch {
  async flush() { await this.commit(); }
  async close() { await this.commit(); }
}

/**
 * Writes are applied as soon as they are issued, inside the SQL transaction, so a
 * later write to the same document sees the earlier one (matching Firestore's
 * ordered application at commit). The first failure rolls everything back.
 */
class Transaction {
  constructor(client) {
    this._client = client;
    this._queue = Promise.resolve();
    this._error = null;
  }

  _enqueue(task) {
    this._queue = this._queue.then(async () => {
      if (this._error) return;
      try {
        await task();
      } catch (error) {
        this._error = error;
      }
    });
    return this;
  }

  async get(target) {
    await this._queue;
    if (this._error) throw this._error;
    if (target instanceof DocumentReference) {
      const row = await readRow(this._client, target.parent.path, target.id, { lock: true });
      return new DocumentSnapshot(target, row ? row.data : null, row);
    }
    if (target instanceof Query) return target._run(this._client);
    throw new Error("Transaction.get expects a DocumentReference or Query");
  }

  async getAll(...refs) {
    const results = [];
    for (const ref of refs) results.push(await this.get(ref));
    return results;
  }

  set(ref, data, options) { return this._enqueue(() => applyWrite(this._client, { type: "set", ref, data, options })); }
  update(ref, data) { return this._enqueue(() => applyWrite(this._client, { type: "update", ref, data })); }
  create(ref, data) { return this._enqueue(() => applyWrite(this._client, { type: "create", ref, data })); }
  delete(ref) { return this._enqueue(() => applyWrite(this._client, { type: "delete", ref })); }

  async _finish() {
    await this._queue;
    if (this._error) throw this._error;
  }
}

const RETRYABLE = new Set(["40001", "40P01"]);

class Firestore {
  collection(path) {
    const segments = String(path).split("/").filter(Boolean);
    if (segments.length % 2 === 0) throw new Error(`Invalid collection path: ${path}`);
    if (segments.length === 1) return new CollectionReference(this, segments[0]);
    const parentDoc = this.doc(segments.slice(0, -1).join("/"));
    return parentDoc.collection(segments[segments.length - 1]);
  }

  doc(path) {
    const segments = String(path).split("/").filter(Boolean);
    if (segments.length % 2 !== 0) throw new Error(`Invalid document path: ${path}`);
    return this.collection(segments.slice(0, -1).join("/")).doc(segments[segments.length - 1]);
  }

  collectionGroup(name) {
    const base = new CollectionReference(this, name);
    return new Query(base, { group: name });
  }

  batch() {
    return new WriteBatch();
  }

  bulkWriter() {
    return new BulkWriter();
  }

  async runTransaction(updateFn, { maxAttempts = 5 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await withClient(async (client) => {
          const tx = new Transaction(client);
          let result;
          try {
            result = await updateFn(tx);
          } catch (error) {
            // Skip queued writes and let any in-flight one finish before ROLLBACK,
            // so nothing runs on the connection after it is released.
            tx._error = tx._error || error;
            await tx._queue;
            throw error;
          }
          await tx._finish();
          return result;
        });
      } catch (error) {
        lastError = error;
        if (!RETRYABLE.has(error.code)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
      }
    }
    throw lastError;
  }

  settings() {}
}

const db = new Firestore();

module.exports = {
  db,
  FieldValue,
  FieldPath,
  Timestamp,
  DOCUMENT_ID,
  DocumentReference,
  CollectionReference,
  Query
};
