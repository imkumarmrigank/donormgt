const { admin } = require("../config/firebase");
const { fromDoc } = require("./firestore");

const DOCUMENT_ID = "__name__";

function clampLimit(value, defaultLimit = 100, maxLimit = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(maxLimit, Math.max(1, Math.trunc(parsed)));
}

function parseFields(fields) {
  if (!fields) return [];
  const values = Array.isArray(fields) ? fields : String(fields).split(",");
  return [...new Set(values.map((field) => String(field).trim()).filter(Boolean))];
}

function normalizeDirection(direction) {
  return String(direction || "asc").toLowerCase() === "desc" ? "desc" : "asc";
}

function normalizeOrder(orderBy = []) {
  const order = orderBy.map((item) => ({
    field: item.field || item.fieldPath,
    direction: normalizeDirection(item.direction)
  })).filter((item) => item.field);

  if (!order.some((item) => item.field === DOCUMENT_ID)) {
    order.push({ field: DOCUMENT_ID, direction: "asc" });
  }
  return order;
}

function firestoreOrderField(field) {
  return field === DOCUMENT_ID ? admin.firestore.FieldPath.documentId() : field;
}

function applyOrder(query, orderBy = []) {
  return normalizeOrder(orderBy).reduce(
    (current, order) => current.orderBy(firestoreOrderField(order.field), order.direction),
    query
  );
}

function applyFieldSelection(query, fields, orderBy = []) {
  const selected = parseFields(fields);
  if (!selected.length) return query;

  const orderFields = normalizeOrder(orderBy)
    .map((order) => order.field)
    .filter((field) => field !== DOCUMENT_ID);

  const safeFields = [...new Set([...selected, ...orderFields])];
  return safeFields.length ? query.select(...safeFields) : query;
}

function serializeCursorValue(value) {
  if (value && typeof value.toMillis === "function") {
    return { type: "timestamp", value: value.toMillis() };
  }
  return { type: "raw", value };
}

function deserializeCursorValue(item) {
  if (!item || item.type !== "timestamp") return item?.value;
  return admin.firestore.Timestamp.fromMillis(item.value);
}

function encodeCursor(doc, orderBy = []) {
  const data = doc.data() || {};
  const values = normalizeOrder(orderBy).map((order) => {
    const value = order.field === DOCUMENT_ID
      ? doc.id
      : order.field.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), data);
    return serializeCursorValue(value);
  });

  return Buffer.from(JSON.stringify(values)).toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const values = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    if (!Array.isArray(values)) return null;
    return values.map(deserializeCursorValue);
  } catch {
    return null;
  }
}

async function fetchCursorPage(query, {
  limit,
  defaultLimit = 100,
  maxLimit = 500,
  cursor,
  fields,
  orderBy = [{ field: "createdAt", direction: "desc" }]
} = {}) {
  const pageLimit = clampLimit(limit, defaultLimit, maxLimit);
  const order = normalizeOrder(orderBy);
  let pagedQuery = applyOrder(query, order);
  pagedQuery = applyFieldSelection(pagedQuery, fields, order);

  const cursorValues = decodeCursor(cursor);
  if (cursorValues && cursorValues.length === order.length) {
    pagedQuery = pagedQuery.startAfter(...cursorValues);
  }

  const snapshot = await pagedQuery.limit(pageLimit + 1).get();
  const docs = snapshot.docs.slice(0, pageLimit);
  const hasMore = snapshot.docs.length > pageLimit;

  return {
    records: docs.map(fromDoc),
    pageInfo: {
      limit: pageLimit,
      hasMore,
      nextCursor: hasMore && docs.length ? encodeCursor(docs[docs.length - 1], order) : null
    }
  };
}

function listPayload(page) {
  return Object.assign(page.records, {
    pageInfo: page.pageInfo
  });
}

module.exports = {
  DOCUMENT_ID,
  clampLimit,
  fetchCursorPage,
  listPayload,
  parseFields
};
