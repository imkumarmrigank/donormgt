const { db } = require("../config/firebase");
const { COLLECTIONS } = require("../config/collections");
const { AppError } = require("../utils/AppError");
const { nextId } = require("../utils/idGenerator");
const {
  fromDoc,
  fromSnapshot,
  auditCreate,
  cleanUndefined
} = require("../utils/firestore");
const { derivePaymentStatus } = require("../utils/businessRules");
const { fetchCursorPage, listPayload } = require("../utils/query");
const { cache } = require("../utils/cache");

function sumQty(items = []) {
  return (items || []).reduce((s, it) => s + (Number(it?.qty) || 0), 0);
}

function normalizeItems(items = []) {
  return (items || [])
    .filter((it) => it && it.name && (Number(it.qty) || 0) > 0)
    .map((it) => ({ ...it, qty: Number(it.qty) || 0 }));
}

function inflowsCollection() {
  return db.collection(COLLECTIONS.SKS_INFLOWS);
}

function outflowsCollection() {
  return db.collection(COLLECTIONS.SKS_OUTFLOWS);
}

function applyListFilters(query, filters = {}) {
  if (filters.dateFrom) query = query.where("date", ">=", filters.dateFrom);
  if (filters.dateTo) query = query.where("date", "<=", filters.dateTo);
  return query;
}

async function listInflows(filters = {}) {
  const query = applyListFilters(inflowsCollection(), filters);
  const page = await fetchCursorPage(query, {
    limit: filters.pageSize || filters.limit,
    defaultLimit: 100,
    maxLimit: 1000,
    cursor: filters.cursor,
    fields: filters.fields,
    orderBy: [{ field: "date", direction: "desc" }]
  });
  return listPayload(page);
}

async function listOutflows(filters = {}) {
  const query = applyListFilters(outflowsCollection(), filters);
  const page = await fetchCursorPage(query, {
    limit: filters.pageSize || filters.limit,
    defaultLimit: 100,
    maxLimit: 1000,
    cursor: filters.cursor,
    fields: filters.fields,
    orderBy: [{ field: "date", direction: "desc" }]
  });
  return listPayload(page);
}

async function createInflow(data, actor) {
  return db.runTransaction(async (tx) => {
    const id = data.id || await nextId("sksInflows", tx);
    const ref = inflowsCollection().doc(id);
    const payload = cleanUndefined({
      ...data,
      id,
      date: data.date || new Date().toISOString().slice(0, 10),
      ...auditCreate(actor)
    });

    tx.set(ref, payload);
    cache.invalidate("sks:stock");
    return { ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  });
}

async function createOutflow(data, actor) {
  return db.runTransaction(async (tx) => {
    const id = data.id || await nextId("sksOutflows", tx);
    const ref = outflowsCollection().doc(id);
    const payment = data.payment
      ? {
        ...data.payment,
        status: data.payment.status || derivePaymentStatus(data.payment.totalValue, data.payment.amount)
      }
      : undefined;
    const payload = cleanUndefined({
      ...data,
      payment,
      id,
      date: data.date || new Date().toISOString().slice(0, 10),
      ...auditCreate(actor)
    });

    tx.set(ref, payload);
    cache.invalidate("sks:stock");
    return { ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  });
}

async function recordOutflowPayment(id, paymentPatch = {}, actor) {
  const ref = outflowsCollection().doc(id);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new AppError("SKS outflow not found", 404, "SKS_OUTFLOW_NOT_FOUND");
    const current = fromDoc(doc);
    const existing = current.payment && typeof current.payment === "object" ? current.payment : {};

    const merged = cleanUndefined({
      ...existing,
      ...paymentPatch,
      status: paymentPatch.status || derivePaymentStatus(
        paymentPatch.totalValue ?? existing.totalValue,
        paymentPatch.amount ?? existing.amount
      )
    });

    tx.set(ref, { payment: merged }, { merge: true });
    return { ...current, payment: merged, updatedAt: new Date().toISOString() };
  });
}

async function deleteInflow(id) {
  const ref = inflowsCollection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("SKS inflow not found", 404, "SKS_INFLOW_NOT_FOUND");
  await ref.delete();
  cache.invalidate("sks:stock");
  return { id, deleted: true };
}

async function deleteOutflow(id) {
  const ref = outflowsCollection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("SKS outflow not found", 404, "SKS_OUTFLOW_NOT_FOUND");
  await ref.delete();
  cache.invalidate("sks:stock");
  return { id, deleted: true };
}

async function updateInflow(id, patch = {}, actor) {
  const ref = inflowsCollection().doc(id);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new AppError("SKS inflow not found", 404, "SKS_INFLOW_NOT_FOUND");
    const current = fromDoc(doc);

    const items = patch.items ? normalizeItems(patch.items) : current.items;
    if (!items || sumQty(items) <= 0) throw new AppError("At least one item with qty is required", 422, "SKS_ITEMS_REQUIRED");

    const merged = cleanUndefined({
      ...current,
      ...patch,
      items,
      id: current.id,
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.uid || actor?.id || null,
      updatedByName: actor?.name || actor?.email || null
    });

    tx.set(ref, merged, { merge: false });
    cache.invalidate("sks:stock");
    return { ...merged, updatedAt: new Date().toISOString() };
  });
}

async function updateOutflow(id, patch = {}, actor) {
  const ref = outflowsCollection().doc(id);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new AppError("SKS outflow not found", 404, "SKS_OUTFLOW_NOT_FOUND");
    const current = fromDoc(doc);

    const items = patch.items ? normalizeItems(patch.items) : current.items;
    if (!items || sumQty(items) <= 0) throw new AppError("At least one item with qty is required", 422, "SKS_ITEMS_REQUIRED");

    const payment = patch.payment
      ? cleanUndefined({
        ...(current.payment && typeof current.payment === "object" ? current.payment : {}),
        ...patch.payment,
        status: patch.payment.status || derivePaymentStatus(
          patch.payment.totalValue ?? current.payment?.totalValue,
          patch.payment.amount ?? current.payment?.amount
        )
      })
      : current.payment;

    const merged = cleanUndefined({
      ...current,
      ...patch,
      items,
      payment,
      id: current.id,
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.uid || actor?.id || null,
      updatedByName: actor?.name || actor?.email || null
    });

    tx.set(ref, merged, { merge: false });
    cache.invalidate("sks:stock");
    return { ...merged, updatedAt: new Date().toISOString() };
  });
}

function addItems(stock, items = [], direction) {
  for (const item of items) {
    const name = item.name;
    const qty = Number(item.qty) || 0;
    stock[name] = (stock[name] || 0) + direction * qty;
  }
}

async function getStock() {
  return cache.getOrFetch("sks:stock", async () => {
    const [inflows, outflows] = await Promise.all([
      listInflows({ limit: 1000 }),
      listOutflows({ limit: 1000 })
    ]);

    const stock = {};
    inflows.forEach((entry) => addItems(stock, entry.items, 1));
    outflows.forEach((entry) => addItems(stock, entry.items, -1));

    return Object.entries(stock)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, 120);
}

module.exports = {
  listInflows,
  listOutflows,
  createInflow,
  createOutflow,
  updateInflow,
  updateOutflow,
  recordOutflowPayment,
  deleteInflow,
  deleteOutflow,
  getStock
};
