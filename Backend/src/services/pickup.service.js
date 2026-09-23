const { db } = require("../config/firebase");
const { COLLECTIONS } = require("../config/collections");
const { AppError } = require("../utils/AppError");
const { nextId } = require("../utils/idGenerator");
const {
  fromDoc,
  fromSnapshot,
  auditCreate,
  auditUpdate,
  cleanUndefined,
  increment,
  arrayUnion
} = require("../utils/firestore");
const { fetchCursorPage, listPayload } = require("../utils/query");
const {
  toNumber,
  derivePaymentStatus,
  deriveDonorStatus,
  inferPickupType,
  buildDonorSnapshot,
  buildPartnerSnapshot,
  buildRaddiRecordFromPickup
} = require("../utils/businessRules");
const { donorsCollection } = require("./donor.service");
const { partnersCollection, findPartnerByName } = require("./pickupPartner.service");
const { logger } = require("../config/logger");
const {
  applyLocationFilters,
  invalidateLocationCache,
  locationSnapshot,
  upsertLocationsFromPayload
} = require("./location.service");
const {
  applyPickupAggregateDelta,
  applyPickupAggregateChange
} = require("./aggregate.service");

function pickupsCollection() {
  return db.collection(COLLECTIONS.PICKUPS);
}

function pickupPendingAmount(pickup) {
  if (pickup.paymentStatus === "Write Off") return 0;
  return Math.max(0, toNumber(pickup.totalValue) - toNumber(pickup.amountPaid));
}

function pickupTransactionSummary(pickup) {
  return {
    date:      pickup.date || "",
    pickupId:  pickup.id,
    donor:     pickup.donorName || "",
    society:   pickup.society || "",
    cityId:    pickup.cityId || "",
    sectorId:  pickup.sectorId || "",
    societyId: pickup.societyId || "",
    value:     toNumber(pickup.totalValue),
    paid:      toNumber(pickup.amountPaid),
    status:    pickup.paymentStatus || derivePaymentStatus(pickup.totalValue, pickup.amountPaid)
  };
}

async function resolveDonorAndPartner(tx, data) {
  let donorRef = null, donor = null;
  if (data.donorId) {
    donorRef = donorsCollection().doc(data.donorId);
    const donorDoc = await tx.get(donorRef);
    if (donorDoc.exists) donor = fromDoc(donorDoc);
  }

  let partnerRef = null, partner = null;
  if (data.partnerId) {
    partnerRef = partnersCollection().doc(data.partnerId);
    const partnerDoc = await tx.get(partnerRef);
    if (partnerDoc.exists) partner = fromDoc(partnerDoc);
  } else {
    const partnerName = data.PickupPartner || data.pickupPartnerName;
    const match = await findPartnerByName(partnerName, tx);
    if (match) { partnerRef = match.ref; partner = match.data; }
  }

  return { donorRef, donor, partnerRef, partner };
}

function buildPickupPayload(data, donor, partner, id) {
  const donorSnapshot   = donor   ? buildDonorSnapshot(donor)     : {};
  const partnerSnapshot = partner ? buildPartnerSnapshot(partner)  : {};
  const totalValue      = toNumber(data.totalValue);
  const amountPaid      = toNumber(data.amountPaid);
  const paymentStatus   = derivePaymentStatus(totalValue, amountPaid, data.paymentStatus);
  const rstItems        = data.rstItems || [];
  const sksItems        = data.sksItems || [];

  return cleanUndefined({
    ...data,
    ...locationSnapshot(data),
    ...donorSnapshot,
    ...partnerSnapshot,
    id,
    orderId:                 data.orderId || id,
    donorId:                 data.donorId  || donor?.id  || null,
    partnerId:               data.partnerId || partner?.id || null,
    donorSnapshot:           donor   ? buildDonorSnapshot(donor)   : null,
    pickupPartnerSnapshot:   partner ? buildPartnerSnapshot(partner) : null,
    status:                  data.status      || "Pending",
    type:                    data.type        || inferPickupType(rstItems, sksItems, "RST"),
    pickupMode:              data.pickupMode  || "Individual",
    rstItems,
    sksItems,
    totalKgs:    toNumber(data.totalKgs ?? data.totalKg),
    totalKg:     toNumber(data.totalKg  ?? data.totalKgs),
    totalValue,
    amountPaid,
    paymentStatus
  });
}

function applyCompletedPickupSideEffects(tx, pickup, donorRef, partnerRef, partner, donor) {
  if (pickup.status !== "Completed") return;
  applyPickupAggregateDelta(tx, pickup, 1);

  if (donorRef) {
    // If this donor was supporter-only, promote to both now that they have a pickup
    const typeUpgrade =
      donor && donor.donorType === "supporter" ? { donorType: "both" } : {};

    tx.set(donorRef, cleanUndefined({
      lastPickup: pickup.date || new Date().toISOString().slice(0, 10),
      nextPickup: pickup.nextDate || null,
      totalRST:   increment(toNumber(pickup.totalValue)),
      totalSKS:   increment((pickup.sksItems || []).length ? 1 : 0),
      status:     deriveDonorStatus(pickup.date || new Date().toISOString().slice(0, 10)),
      ...typeUpgrade
    }), { merge: true });
  }

  if (partnerRef) {
    const pending = pickupPendingAmount(pickup);
    tx.set(partnerRef, {
      totalPickups:    increment(1),
      totalValue:      increment(toNumber(pickup.totalValue)),
      amountReceived:  increment(toNumber(pickup.amountPaid)),
      pendingAmount:   increment(pending),
      transactions:    arrayUnion(pickupTransactionSummary({
        ...pickup,
        PickupPartner: partner?.name || pickup.PickupPartner
      }))
    }, { merge: true });
  }
}

function applyCompletedPickupDelta(tx, oldPickup, newPickup, oldPartnerRef, newPartnerRef) {
  applyPickupAggregateChange(tx, oldPickup, newPickup);

  const oldCompleted = oldPickup.status === "Completed";
  const newCompleted = newPickup.status === "Completed";

  const oldValue   = oldCompleted ? toNumber(oldPickup.totalValue)  : 0;
  const oldPaid    = oldCompleted ? toNumber(oldPickup.amountPaid)   : 0;
  const oldPending = oldCompleted ? pickupPendingAmount(oldPickup)   : 0;
  const newValue   = newCompleted ? toNumber(newPickup.totalValue)  : 0;
  const newPaid    = newCompleted ? toNumber(newPickup.amountPaid)   : 0;
  const newPending = newCompleted ? pickupPendingAmount(newPickup)   : 0;

  if (oldPartnerRef && oldPartnerRef.path !== newPartnerRef?.path) {
    tx.set(oldPartnerRef, {
      totalPickups:   increment(oldCompleted ? -1 : 0),
      totalValue:     increment(-oldValue),
      amountReceived: increment(-oldPaid),
      pendingAmount:  increment(-oldPending)
    }, { merge: true });
  }

  if (newPartnerRef) {
    const samePartner = oldPartnerRef?.path === newPartnerRef.path;
    tx.set(newPartnerRef, {
      totalPickups:   increment(samePartner ? (newCompleted && !oldCompleted ? 1 : !newCompleted && oldCompleted ? -1 : 0) : (newCompleted ? 1 : 0)),
      totalValue:     increment(samePartner ? newValue - oldValue : newValue),
      amountReceived: increment(samePartner ? newPaid  - oldPaid  : newPaid),
      pendingAmount:  increment(samePartner ? newPending - oldPending : newPending)
    }, { merge: true });
  }
}

// ── List pickups — supports comprehensive backend filtering ───────────────────
async function listPickups(filters = {}) {
  let query = pickupsCollection();

  if (filters.status)    query = query.where("status",    "==", filters.status);
  if (filters.donorId)   query = query.where("donorId",   "==", filters.donorId);
  if (filters.partnerId) query = query.where("partnerId", "==", filters.partnerId);
  query = applyLocationFilters(query, filters);
  if (filters.dateFrom)  query = query.where("date", ">=", filters.dateFrom);
  if (filters.dateTo)    query = query.where("date", "<=", filters.dateTo);
  // paymentStatus filter (for pending-payment queries)
  if (Array.isArray(filters.paymentStatus) && filters.paymentStatus.length) {
    query = query.where("paymentStatus", "in", filters.paymentStatus.slice(0, 10));
  } else if (filters.paymentStatus) {
    query = query.where("paymentStatus", "==", filters.paymentStatus);
  }
  // pickupMode filter
  if (filters.pickupMode) query = query.where("pickupMode", "==", filters.pickupMode);

  const page = await fetchCursorPage(query, {
    limit: filters.pageSize || filters.limit,
    defaultLimit: 100,
    maxLimit: 1000,
    cursor: filters.cursor,
    fields: filters.fields,
    orderBy: [{ field: "date", direction: "desc" }]
  });
  let pickups = page.records;

  // Text search is handled in-process (Firestore has no full-text search)
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    pickups = pickups.filter((p) =>
      [p.id, p.orderId, p.donorName, p.mobile, p.society, p.PickupPartner, p.pickupPartnerName]
        .some((v) => String(v || "").toLowerCase().includes(needle))
    );
  }

  return listPayload({ records: pickups, pageInfo: page.pageInfo });
}

async function getPickup(id) {
  const doc    = await pickupsCollection().doc(id).get();
  const pickup = fromDoc(doc);
  if (!pickup) throw new AppError("Pickup not found", 404, "PICKUP_NOT_FOUND");
  return pickup;
}

function assertPickupPartnerAssigned(data, resolvedPartner) {
  const hasPartnerInData =
    data.partnerId || data.PickupPartner || data.pickupPartnerName;
  if (!hasPartnerInData && !resolvedPartner) {
    throw new AppError(
      "Pickup Partner assignment is required before recording pickup.",
      422,
      "PICKUP_PARTNER_REQUIRED"
    );
  }
}

async function createPickup(data, actor) {
  // Partner assignment is NOT required at scheduling time.
  // assertPickupPartnerAssigned is only called during the record/complete flow.
  const created = await db.runTransaction(async (tx) => {
    const { donorRef, donor, partnerRef, partner } = await resolveDonorAndPartner(tx, data);
    const id      = data.id || data.orderId || await nextId("pickups", tx);
    const ref     = pickupsCollection().doc(id);
    const payload = { ...buildPickupPayload(data, donor, partner, id), ...auditCreate(actor) };
tx.set(ref, payload);
await upsertLocationsFromPayload(payload, actor, tx);
applyCompletedPickupSideEffects(tx, payload, donorRef, partnerRef, partner, donor);

    return { ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  });
  invalidateLocationCache();
  return created;
}

async function updatePickup(id, data, actor) {
  const updated = await db.runTransaction(async (tx) => {
    const ref        = pickupsCollection().doc(id);
    const currentDoc = await tx.get(ref);
    if (!currentDoc.exists) throw new AppError("Pickup not found", 404, "PICKUP_NOT_FOUND");

    const oldPickup  = fromDoc(currentDoc);
    const merged     = { ...oldPickup, ...data, id };
    const { donorRef, donor, partnerRef, partner } = await resolveDonorAndPartner(tx, merged);

    // Require a pickup partner when completing or when none was ever assigned
    const isCompleting = data.status === "Completed" || merged.status === "Completed";
    const partnerStillMissing = !merged.partnerId && !merged.PickupPartner && !merged.pickupPartnerName;
    if (isCompleting && partnerStillMissing && !partner) {
      throw new AppError(
        "Pickup Partner assignment is required before recording pickup.",
        422,
        "PICKUP_PARTNER_REQUIRED"
      );
    }
    const oldPartnerRef = oldPickup.partnerId ? partnersCollection().doc(oldPickup.partnerId) : null;
    const newPickup  = {
      ...buildPickupPayload(merged, donor || oldPickup.donorSnapshot, partner || oldPickup.pickupPartnerSnapshot, id),
      ...auditUpdate(actor)
    };

    tx.set(ref, newPickup, { merge: true });
    await upsertLocationsFromPayload(newPickup, actor, tx);
    applyCompletedPickupDelta(tx, oldPickup, newPickup, oldPartnerRef, partnerRef);

   
if (donorRef && oldPickup.status !== "Completed" && newPickup.status === "Completed") {
   
  const typeUpgrade =
    donor && donor.donorType === "supporter" ? { donorType: "both" } : {};

  tx.set(donorRef, cleanUndefined({
    lastPickup: newPickup.date || new Date().toISOString().slice(0, 10),
    nextPickup: newPickup.nextDate || null,
    totalRST:   increment(toNumber(newPickup.totalValue)),
    totalSKS:   increment((newPickup.sksItems || []).length ? 1 : 0),
    status:     deriveDonorStatus(newPickup.date || new Date().toISOString().slice(0, 10)),
    ...typeUpgrade
  }), { merge: true });
}

    return { ...oldPickup, ...newPickup, updatedAt: new Date().toISOString() };
  });
  invalidateLocationCache();
  return updated;
}

async function recordPickup(id, data, actor) {
  return updatePickup(id, { ...data, status: "Completed" }, actor);
}

// ── Reschedule an existing pickup ─────────────────────────────────────────────
// Updates only scheduling fields: date, timeSlot, notes.
// Resets status → "Pending" and clears postponeReason.
// Completed pickups cannot be rescheduled — the recording is permanent.
async function reschedulePickup(id, data, actor) {
  const ref     = pickupsCollection().doc(id);
  const current = await ref.get();
  if (!current.exists) throw new AppError("Pickup not found", 404, "PICKUP_NOT_FOUND");

  const existing = fromDoc(current);
  if (existing.status === "Completed") {
    throw new AppError(
      "Cannot reschedule a completed pickup. Create a new pickup instead.",
      422,
      "PICKUP_ALREADY_COMPLETED"
    );
  }

  const now     = new Date().toISOString();
  const payload = {
    date:            data.date,
    timeSlot:        data.timeSlot  || existing.timeSlot || "",
    notes:           data.notes     !== undefined ? data.notes : existing.notes,
    status:          "Pending",        // always reset to Pending
    postponeReason:  null,             // clear any postpone flag
    rescheduledAt:   now,
    rescheduledBy:   actor?.email || actor?.uid || "system",
    updatedAt:       now,
    updatedBy:       actor?.email || actor?.uid || "",
  };

  await ref.set(payload, { merge: true });

  // Synchronise scheduler-summary and dashboard caches — these are TTL-based
  // on the backend; invalidation is handled automatically by the query refetch
  // on the frontend via queryClient.
  invalidateLocationCache();

  return { ...existing, ...payload };
}

async function deletePickup(id) {
  const ref = pickupsCollection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("Pickup not found", 404, "PICKUP_NOT_FOUND");
  await ref.delete();
  return { id, deleted: true };
}

// ── Raddi records — full backend filtering ────────────────────────────────────
/**
 * Filters supported as query params:
 *   dateFrom, dateTo, city, sector, partnerId, paymentStatus,
 *   q (text search), limit, page
 *
 * paymentStatus values as returned by buildRaddiRecordFromPickup:
 *   "Received" | "Yet to Receive" | "Write-off"
 */
async function listRaddiRecords(filters = {}) {
  try {
    const { paymentStatus, q, ...pickupFilters } = filters;

    const pickups = await listPickups({
      ...pickupFilters,
      status: "Completed",
      limit:  filters.limit || 500
    });

    let records = pickups.map((pickup) =>
      buildRaddiRecordFromPickup(
        pickup,
        pickup.donorSnapshot  || pickup,
        pickup.pickupPartnerSnapshot || pickup
      )
    );

    // Backend-side text search (name / mobile / orderId / society / partner)
    if (q) {
      const needle = q.toLowerCase();
      records = records.filter((r) =>
        [r.name, r.mobile, r.orderId, r.society, r.PickupPartnerName]
          .some((v) => String(v || "").toLowerCase().includes(needle))
      );
    }

    // Payment status filter on the raddi status label
    if (paymentStatus) {
      records = records.filter((r) => r.paymentStatus === paymentStatus);
    }

    // Pagination
    const page     = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(filters.pageSize) || 200));
    const total    = records.length;
    const pages    = Math.ceil(total / pageSize);
    const slice    = records.slice((page - 1) * pageSize, page * pageSize);

    return {
      records: slice,
      pagination: { page, pageSize, total, pages }
    };
  } catch (err) {
    if (err.code === 9 || err.code === "failed-precondition") {
      logger.warn("Raddi records query needs a Firestore composite index", { error: err.message });
      return { records: [], pagination: { page: 1, pageSize: 200, total: 0, pages: 0 } };
    }
    throw err;
  }
}

// ── Scheduling conflict detection ─────────────────────────────────────────────
// Returns the conflicting pickup document (if any) when a donor already has a
// pending/scheduled pickup on the requested date.  An optional excludeId lets
// the caller skip the pickup currently being rescheduled so it doesn't flag
// itself as a conflict.
async function checkSchedulingConflict(donorId, date, excludeId = null) {
  if (!donorId || !date) return null;

  let query = pickupsCollection()
    .where("donorId", "==", donorId)
    .where("date",    "==", date)
    .where("status",  "in", ["Pending", "Scheduled"]);

  const snapshot = await query.get();
  if (snapshot.empty) return null;

  for (const doc of snapshot.docs) {
    if (excludeId && doc.id === excludeId) continue;
    return fromDoc(doc);
  }
  return null;
}

module.exports = {
  pickupsCollection,
  pickupPendingAmount,
  pickupTransactionSummary,
  listPickups,
  getPickup,
  createPickup,
  updatePickup,
  recordPickup,
  reschedulePickup,
  deletePickup,
  listRaddiRecords,
  checkSchedulingConflict,
};