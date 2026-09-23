const { db } = require("../config/firebase");
const { COLLECTIONS } = require("../config/collections");
const { AppError } = require("../utils/AppError");
const { fromSnapshot, auditCreate, auditUpdate, cleanUndefined } = require("../utils/firestore");
const defaults = require("../config/masterData");
const { cache } = require("../utils/cache");

// ── Slugify helper ────────────────────────────────────────────────────────────
function slugify(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// ── RST Items ─────────────────────────────────────────────────────────────────
async function listRstItems() {
  return cache.getOrFetch("masterData:rstItems", async () => {
    const snap = await db.collection(COLLECTIONS.RST_ITEMS).orderBy("order").get();
    const items = fromSnapshot(snap);
    // Fallback to config defaults if no Firestore items exist
    if (items.length === 0) {
      return defaults.RST_ITEMS.map((name, i) => ({ id: slugify(name), name, rate: 0, unit: "kg", order: i, active: true }));
    }
    return items;
  }, 300); // 5 minutes
}

async function getRstItem(id) {
  const doc = await db.collection(COLLECTIONS.RST_ITEMS).doc(id).get();
  if (!doc.exists) throw new AppError("RST item not found", 404, "RST_ITEM_NOT_FOUND");
  return { id: doc.id, ...doc.data() };
}

async function createRstItem(data, actor) {
  const id = data.id || slugify(data.name);
  const existing = await db.collection(COLLECTIONS.RST_ITEMS).doc(id).get();
  if (existing.exists) throw new AppError("RST item already exists", 409, "DUPLICATE_RST_ITEM");

  // Get next order number
  const snap = await db.collection(COLLECTIONS.RST_ITEMS).orderBy("order", "desc").limit(1).get();
  const nextOrder = snap.empty ? 0 : (snap.docs[0].data().order || 0) + 1;

  const payload = cleanUndefined({
    id,
    name: data.name.trim(),
    rate: Number(data.rate) || 0,
    unit: data.unit || "kg",
    order: data.order ?? nextOrder,
    active: data.active !== false,
    ...auditCreate(actor)
  });
  await db.collection(COLLECTIONS.RST_ITEMS).doc(id).set(payload);
  cache.invalidatePrefix("masterData:");
  return payload;
}

async function updateRstItem(id, data, actor) {
  const ref = db.collection(COLLECTIONS.RST_ITEMS).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("RST item not found", 404, "RST_ITEM_NOT_FOUND");

  const update = cleanUndefined({
    name: data.name?.trim(),
    rate: data.rate !== undefined ? Number(data.rate) : undefined,
    unit: data.unit,
    order: data.order,
    active: data.active,
    ...auditUpdate(actor)
  });
  await ref.set(update, { merge: true });
  cache.invalidatePrefix("masterData:");
  return { id, ...doc.data(), ...update };
}

async function deleteRstItem(id) {
  const ref = db.collection(COLLECTIONS.RST_ITEMS).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("RST item not found", 404, "RST_ITEM_NOT_FOUND");
  await ref.delete();
  cache.invalidatePrefix("masterData:");
  return { id, deleted: true };
}

// ── SKS Items ─────────────────────────────────────────────────────────────────
async function listSksItems() {
  return cache.getOrFetch("masterData:sksItems", async () => {
    const snap = await db.collection(COLLECTIONS.SKS_ITEMS).orderBy("order").get();
    const items = fromSnapshot(snap);
    if (items.length === 0) {
      return defaults.SKS_ITEMS.map((name, i) => ({ id: slugify(name), name, order: i, active: true }));
    }
    return items;
  }, 300); // 5 minutes
}

async function getSksItem(id) {
  const doc = await db.collection(COLLECTIONS.SKS_ITEMS).doc(id).get();
  if (!doc.exists) throw new AppError("SKS item not found", 404, "SKS_ITEM_NOT_FOUND");
  return { id: doc.id, ...doc.data() };
}

async function createSksItem(data, actor) {
  const id = data.id || slugify(data.name);
  const existing = await db.collection(COLLECTIONS.SKS_ITEMS).doc(id).get();
  if (existing.exists) throw new AppError("SKS item already exists", 409, "DUPLICATE_SKS_ITEM");

  const snap = await db.collection(COLLECTIONS.SKS_ITEMS).orderBy("order", "desc").limit(1).get();
  const nextOrder = snap.empty ? 0 : (snap.docs[0].data().order || 0) + 1;

  const payload = cleanUndefined({
    id,
    name: data.name.trim(),
    order: data.order ?? nextOrder,
    active: data.active !== false,
    ...auditCreate(actor)
  });
  await db.collection(COLLECTIONS.SKS_ITEMS).doc(id).set(payload);
  cache.invalidatePrefix("masterData:");
  return payload;
}

async function updateSksItem(id, data, actor) {
  const ref = db.collection(COLLECTIONS.SKS_ITEMS).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("SKS item not found", 404, "SKS_ITEM_NOT_FOUND");

  const update = cleanUndefined({
    name: data.name?.trim(),
    order: data.order,
    active: data.active,
    ...auditUpdate(actor)
  });
  await ref.set(update, { merge: true });
  cache.invalidatePrefix("masterData:");
  return { id, ...doc.data(), ...update };
}

async function deleteSksItem(id) {
  const ref = db.collection(COLLECTIONS.SKS_ITEMS).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("SKS item not found", 404, "SKS_ITEM_NOT_FOUND");
  await ref.delete();
  cache.invalidatePrefix("masterData:");
  return { id, deleted: true };
}

// ── Combined master data (for GET /master-data) ──────────────────────────────
async function getMasterData() {
  return cache.getOrFetch("masterData:combined", async () => {
    const [rstItems, sksItems] = await Promise.all([
      listRstItems(),
      listSksItems()
    ]);

    return {
      RST_ITEMS: rstItems.filter(i => i.active !== false).map(i => i.name),
      SKS_ITEMS: sksItems.filter(i => i.active !== false).map(i => i.name),
      rstItemsFull: rstItems,
      sksItemsFull: sksItems,
      PICKUP_MODES: defaults.PICKUP_MODES,
      DONOR_STATUSES: defaults.DONOR_STATUSES,
      PICKUP_STATUSES: defaults.PICKUP_STATUSES,
      PAYMENT_STATUSES: defaults.PAYMENT_STATUSES,
      POSTPONE_REASONS: defaults.POSTPONE_REASONS,
      LOST_REASONS: defaults.LOST_REASONS
    };
  }, 300); // 5 minutes
}

module.exports = {
  getMasterData,
  listRstItems, getRstItem, createRstItem, updateRstItem, deleteRstItem,
  listSksItems, getSksItem, createSksItem, updateSksItem, deleteSksItem
};
