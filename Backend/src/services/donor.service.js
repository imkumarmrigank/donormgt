const { db } = require("../config/firebase");
const { COLLECTIONS } = require("../config/collections");
const { AppError } = require("../utils/AppError");
const { nextId } = require("../utils/idGenerator");
const {
  fromDoc,
  fromSnapshot,
  auditCreate,
  auditUpdate,
  cleanUndefined
} = require("../utils/firestore");
const { deriveDonorStatus, toNumber } = require("../utils/businessRules");
const { fetchCursorPage, listPayload } = require("../utils/query");
const {
  applyLocationFilters,
  invalidateLocationCache,
  locationSnapshot,
  upsertLocationsFromPayload
} = require("./location.service");

function donorsCollection() {
  return db.collection(COLLECTIONS.DONORS);
}

// ── Mobile normalisation ──────────────────────────────────────────────────────
// Strips all non-digits and takes the last 10 characters so +91-98765-43210
// normalises to the same value as 9876543210.
function normalizeMobile(mobile) {
  return String(mobile || "").replace(/\D/g, "").slice(-10);
}

// ── Find by normalised mobile (dedup key) ─────────────────────────────────────
async function findDonorByMobile(mobile) {
  const normalized = normalizeMobile(mobile);
  if (normalized.length < 7) return null;

  // Primary lookup — indexed after first write with normalizedMobile
  const snap = await donorsCollection()
    .where("normalizedMobile", "==", normalized)
    .limit(1)
    .get();
  if (!snap.empty) return fromDoc(snap.docs[0]);

  // Fallback for legacy records that stored bare mobile without the new field
  const snap2 = await donorsCollection()
    .where("mobile", "==", normalized)
    .limit(1)
    .get();
  return snap2.empty ? null : fromDoc(snap2.docs[0]);
}

// ── Determine merged donorType ────────────────────────────────────────────────
function mergedDonorType(existingType, incomingType) {
  if (!existingType || existingType === incomingType) return incomingType || existingType || "donor";
  const set = new Set([existingType, incomingType]);
  if (set.has("donor") && set.has("supporter")) return "both";
  if (set.has("both")) return "both";
  return existingType;
}

function applyDonorFilters(query, filters = {}) {
  if (filters.status) query = query.where("status", "==", filters.status);
  // Fast mobile lookup — works for records written after this change
  if (filters.mobile) {
    query = query.where("normalizedMobile", "==", normalizeMobile(filters.mobile));
  }
  return applyLocationFilters(query, filters);
}

async function listDonors(filters = {}) {
  // ── Optimize single-result mobile lookups (used by Frontend dedup check) ─────
  const limit = Number(filters.limit || filters.pageSize || 1);
  const isMobileLookup = filters.mobile && limit <= 1 && !filters.q && !filters.status && !filters.cursor;
  
  if (isMobileLookup) {
    const normalized = normalizeMobile(filters.mobile);
    const snapshot = await donorsCollection()
      .where("normalizedMobile", "==", normalized)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return [];
    }
    
    const donor = fromDoc(snapshot.docs[0]);
    return [{
      ...donor,
      status: deriveDonorStatus(donor.lastPickup, donor.status)
    }];
  }

  // ── Full paginated list (existing behavior) ─────────────────────────────────
  let query = donorsCollection();
  query = applyDonorFilters(query, filters);
  const page = await fetchCursorPage(query, {
    limit: filters.pageSize || filters.limit,
    defaultLimit: 100,
    maxLimit: 1000,
    cursor: filters.cursor,
    fields: filters.fields,
    orderBy: [{ field: "createdAt", direction: "desc" }]
  });
  let donors = page.records;

  donors = donors.map((donor) => ({
    ...donor,
    status: deriveDonorStatus(donor.lastPickup, donor.status)
  }));

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    donors = donors.filter((donor) => [
      donor.name,
      donor.mobile,
      donor.society,
      donor.city
    ].some((value) => String(value || "").toLowerCase().includes(needle)));
  }

  return listPayload({ records: donors, pageInfo: page.pageInfo });
}

async function getDonor(id) {
  const doc = await donorsCollection().doc(id).get();
  const donor = fromDoc(doc);
  if (!donor) throw new AppError("Donor not found", 404, "DONOR_NOT_FOUND");
  return donor;
}

// ── createDonor — deduplicates on normalised mobile ───────────────────────────
async function createDonor(data, actor) {
  const normalizedMobile = normalizeMobile(data.mobile);

  // ── Deduplication check ───────────────────────────────────────────────────
  if (normalizedMobile.length >= 7) {
    const existing = await findDonorByMobile(normalizedMobile);
    if (existing) {
      const incomingType = data.donorType || "donor";
      const newType = mergedDonorType(existing.donorType, incomingType);

      // Build a merge patch from the incoming data (location, name, etc.)
      // but never overwrite financial history fields.
      const safeMerge = cleanUndefined({
        name:            data.name     || existing.name,
        house:           data.house    || data.houseNo || existing.house || "",
        society:         data.society  || existing.society,
        sector:          data.sector   || existing.sector,
        city:            data.city     || existing.city,
        donorType:       newType,
        // supporter-specific fields
        contributionType:  data.contributionType  || existing.contributionType,
        supportContribution: data.supportContribution || existing.supportContribution,
        lastSupportDate:   data.lastSupportDate    || existing.lastSupportDate,
        notes:             data.notes              || existing.notes,
      });

      // Only write if something actually changed
      const changed =
        newType !== existing.donorType ||
        Object.entries(safeMerge).some(([k, v]) => v !== existing[k]);

      if (changed) {
        return updateDonor(existing.id, safeMerge, actor);
      }
      return existing;
    }
  }

  // ── Fresh record ──────────────────────────────────────────────────────────
  const created = await db.runTransaction(async (tx) => {
    const id = data.id || await nextId("donors", tx);
    const ref = donorsCollection().doc(id);
    const payload = cleanUndefined({
      ...data,
      ...locationSnapshot(data),
      id,
      mobile:           normalizedMobile || data.mobile,
      normalizedMobile: normalizedMobile || undefined,
      house:            data.house || data.houseNo || "",
      status:           data.status || deriveDonorStatus(data.lastPickup),
      totalRST:         toNumber(data.totalRST),
      totalSKS:         toNumber(data.totalSKS),
      donorType:        data.donorType || "donor",
      lastPickup:       data.lastPickup || null,
      nextPickup:       data.nextPickup || null,
      ...auditCreate(actor)
    });

    tx.set(ref, payload);
    await upsertLocationsFromPayload(payload, actor, tx);
    return { ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  });

  invalidateLocationCache();
  return created;
}

async function updateDonor(id, data, actor) {
  const ref = donorsCollection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("Donor not found", 404, "DONOR_NOT_FOUND");

  const current = doc.data();

  // Re-normalise mobile if it's being updated
  const incomingMobile = data.mobile ? normalizeMobile(data.mobile) : undefined;
  const normalizedMobile = incomingMobile || current.normalizedMobile ||
    normalizeMobile(current.mobile);

  const payload = cleanUndefined({
    ...data,
    ...locationSnapshot({ ...current, ...data }),
    house:           data.house || data.houseNo || current.house || "",
    status:          data.status || deriveDonorStatus(data.lastPickup || current.lastPickup, current.status),
    totalRST:        data.totalRST !== undefined ? toNumber(data.totalRST) : current.totalRST,
    totalSKS:        data.totalSKS !== undefined ? toNumber(data.totalSKS) : current.totalSKS,
    ...(incomingMobile ? { mobile: incomingMobile, normalizedMobile } : { normalizedMobile: normalizedMobile || undefined }),
    ...auditUpdate(actor)
  });

  await ref.set(payload, { merge: true });
  await upsertLocationsFromPayload({ ...current, ...payload }, actor);
  return getDonor(id);
}

async function deleteDonor(id) {
  const ref = donorsCollection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("Donor not found", 404, "DONOR_NOT_FOUND");
  await ref.delete();
  return { id, deleted: true };
}

module.exports = {
  donorsCollection,
  normalizeMobile,
  findDonorByMobile,
  listDonors,
  getDonor,
  createDonor,
  updateDonor,
  deleteDonor
};