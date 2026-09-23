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
const { toNumber } = require("../utils/businessRules");
const { fetchCursorPage, listPayload } = require("../utils/query");
const {
  applyLocationFilters,
  invalidateLocationCache,
  locationSnapshot,
  upsertLocationsFromPayload
} = require("./location.service");
const { uploadFile, deleteFile } = require("./storage.service");
const { logger } = require("../config/logger");

function partnersCollection() {
  return db.collection(COLLECTIONS.PICKUP_PARTNERS);
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function isRemoval(value) {
  return value === null || value === "" || value === "null";
}

function firstFile(files = {}, fieldNames = []) {
  for (const fieldName of fieldNames) {
    const value = files[fieldName];
    if (Array.isArray(value) && value[0]) return value[0];
  }
  return null;
}

function filePayload(uploaded) {
  return {
    storagePath: uploaded.storagePath,
    url: uploaded.url,
    fileName: uploaded.fileName,
    contentType: uploaded.contentType,
    size: uploaded.size,
    uploadedAt: uploaded.uploadedAt
  };
}

async function uploadPartnerFiles(files, partnerId, actor) {
  const photo = firstFile(files, ["photo"]);
  const aadhaar = firstFile(files, ["aadhaarDoc", "aadhaarDocument"]);
  const uploaded = {};

  try {
    if (photo) {
      if (!photo.buffer) {
        throw new Error("Photo buffer is missing from Multer req.files");
      }
      logger.info("Uploading pickup partner photo", { partnerId });
      const file = await uploadFile({
        file: photo,
        purpose: "pickup-partners/photo",
        entityId: partnerId,
        user: actor
      });
      uploaded.photo = file;
    }

    if (aadhaar) {
      if (!aadhaar.buffer) {
        throw new Error("Aadhaar buffer is missing from Multer req.files");
      }
      logger.info("Uploading pickup partner aadhaar document", { partnerId });
      const file = await uploadFile({
        file: aadhaar,
        purpose: "pickup-partners/aadhaar",
        entityId: partnerId,
        user: actor
      });
      uploaded.aadhaar = file;
    }

    return uploaded;
  } catch (error) {
    logger.error("Pickup partner document upload failed", { partnerId, error: error.message });
    await deleteFilesQuietly(collectUploadedPaths(uploaded));
    throw asPartnerUploadError(error);
  }
}

function collectUploadedPaths(uploaded = {}) {
  return Object.values(uploaded)
    .map((file) => file?.storagePath)
    .filter(Boolean);
}

function collectPartnerDocumentPaths(partner = {}) {
  return [
    partner.photoPath,
    partner.photoFile?.storagePath,
    partner.aadhaarPath,
    partner.aadhaarFile?.storagePath
  ].filter(Boolean);
}

async function deleteFilesQuietly(paths = []) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  await Promise.allSettled(uniquePaths.map((path) => deleteFile(path)));
}

function documentPatch(data = {}, uploaded = {}) {
  const patch = {};

  if (uploaded.photo) {
    patch.photo = uploaded.photo.url;
    patch.photoUrl = uploaded.photo.url;
    patch.photoPath = uploaded.photo.storagePath;
    patch.photoFile = filePayload(uploaded.photo);
  } else if (isRemoval(data.photo) || isRemoval(data.photoUrl)) {
    patch.photo = null;
    patch.photoUrl = null;
    patch.photoPath = null;
    patch.photoFile = null;
  }

  if (uploaded.aadhaar) {
    patch.aadhaarDoc = uploaded.aadhaar.url;
    patch.aadhaarDocument = uploaded.aadhaar.url;
    patch.aadhaarUrl = uploaded.aadhaar.url;
    patch.aadhaarPath = uploaded.aadhaar.storagePath;
    patch.aadhaarFile = filePayload(uploaded.aadhaar);
  } else if (
    isRemoval(data.aadhaarDoc) ||
    isRemoval(data.aadhaarDocument) ||
    isRemoval(data.aadhaarUrl)
  ) {
    patch.aadhaarDoc = null;
    patch.aadhaarDocument = null;
    patch.aadhaarUrl = null;
    patch.aadhaarPath = null;
    patch.aadhaarFile = null;
  }

  return patch;
}

function normalizeRateChart(rateChart) {
  if (!rateChart || typeof rateChart !== "object") return rateChart;
  return Object.entries(rateChart).reduce((acc, [item, value]) => {
    acc[item] = toNumber(value);
    return acc;
  }, {});
}

function statusPatch(data = {}, isCreate = false) {
  if (!isCreate && !hasOwn(data, "active") && !hasOwn(data, "isActive")) return {};
  const active = data.active !== false && data.isActive !== false;
  return { active, isActive: active };
}

function asPartnerSaveError(error) {
  if (error instanceof AppError) return error;
  return new AppError(
    "Pickup partner could not be saved. Please check the partner details and try again.",
    500,
    "PICKUP_PARTNER_SAVE_FAILED",
    { reason: error.message }
  );
}

function asPartnerUploadError(error) {
  if (error instanceof AppError) return error;
  return new AppError(
    `Document upload failed: ${error.message || "Check Firebase Storage configuration"}.`,
    502,
    "PICKUP_PARTNER_UPLOAD_FAILED",
    { reason: error.message, stack: error.stack }
  );
}

function createPayload(data, id, actor, uploaded) {
  return cleanUndefined({
    ...data,
    ...locationSnapshot(data),
    ...documentPatch(data, uploaded),
    id,
    rating: toNumber(data.rating, 4),
    totalPickups: toNumber(data.totalPickups),
    totalValue: toNumber(data.totalValue),
    amountReceived: toNumber(data.amountReceived),
    pendingAmount: toNumber(data.pendingAmount),
    rateChart: normalizeRateChart(data.rateChart),
    transactions: data.transactions || [],
    ...statusPatch(data, true),
    ...auditCreate(actor)
  });
}

function updatePayload(data, actor, uploaded) {
  const numericPatch = {};
  ["rating", "totalPickups", "totalValue", "amountReceived", "pendingAmount"].forEach((key) => {
    if (hasOwn(data, key)) numericPatch[key] = toNumber(data[key], key === "rating" ? 4 : 0);
  });

  return cleanUndefined({
    ...data,
    ...locationSnapshot(data),
    ...numericPatch,
    ...(hasOwn(data, "rateChart") ? { rateChart: normalizeRateChart(data.rateChart) } : {}),
    ...statusPatch(data),
    ...documentPatch(data, uploaded),
    ...auditUpdate(actor)
  });
}

async function reservePickupPartnerId(id) {
  if (id) return id;
  return db.runTransaction((tx) => nextId("pickupPartners", tx));
}

async function listPickupPartners(filters = {}) {
  let query = partnersCollection();
  query = applyLocationFilters(query, filters);
  const page = await fetchCursorPage(query, {
    limit: filters.pageSize || filters.limit,
    defaultLimit: 100,
    maxLimit: 500,
    cursor: filters.cursor,
    fields: filters.fields,
    orderBy: [{ field: "createdAt", direction: "desc" }]
  });
  let partners = page.records;

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    partners = partners.filter((partner) => [
      partner.name,
      partner.mobile,
      partner.area,
      ...(partner.sectors || []),
      ...(partner.societies || [])
    ].some((value) => String(value || "").toLowerCase().includes(needle)));
  }

  return listPayload({ records: partners, pageInfo: page.pageInfo });
}

async function getPickupPartner(id) {
  const doc = await partnersCollection().doc(id).get();
  const partner = fromDoc(doc);
  if (!partner) throw new AppError("Pickup partner not found", 404, "PICKUP_PARTNER_NOT_FOUND");
  return partner;
}

async function findPartnerByName(name, tx) {
  if (!name) return null;
  const query = partnersCollection().where("name", "==", name).limit(1);
  const snapshot = tx ? await tx.get(query) : await query.get();
  if (snapshot.empty) return null;
  return { ref: snapshot.docs[0].ref, data: fromDoc(snapshot.docs[0]) };
}

async function createPickupPartner(data, actor, files = {}) {
  const id = await reservePickupPartnerId(data.id);
  const uploaded = await uploadPartnerFiles(files, id, actor);

  try {
    const created = await db.runTransaction(async (tx) => {
      const ref = partnersCollection().doc(id);
      const existing = await tx.get(ref);
      if (existing.exists) {
        throw new AppError("Pickup partner ID already exists", 409, "PICKUP_PARTNER_EXISTS");
      }

      const payload = createPayload(data, id, actor, uploaded);

      tx.set(ref, payload);
      await upsertLocationsFromPayload(payload, actor, tx);
      return { ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    });

    invalidateLocationCache();
    return created;
  } catch (error) {
    await deleteFilesQuietly(collectUploadedPaths(uploaded));
    throw asPartnerSaveError(error);
  }
}

async function updatePickupPartner(id, data, actor, files = {}) {
  const ref = partnersCollection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("Pickup partner not found", 404, "PICKUP_PARTNER_NOT_FOUND");

  const existing = fromDoc(doc);
  const uploaded = await uploadPartnerFiles(files, id, actor);
  const patch = updatePayload(data, actor, uploaded);

  try {
    await ref.set(patch, { merge: true });
    await upsertLocationsFromPayload({ ...doc.data(), ...patch }, actor);
  } catch (error) {
    await deleteFilesQuietly(collectUploadedPaths(uploaded));
    throw asPartnerSaveError(error);
  }

  const replacedOrRemovedPaths = [];
  if (uploaded.photo || patch.photo === null) {
    replacedOrRemovedPaths.push(existing.photoPath, existing.photoFile?.storagePath);
  }
  if (uploaded.aadhaar || patch.aadhaarDoc === null) {
    replacedOrRemovedPaths.push(existing.aadhaarPath, existing.aadhaarFile?.storagePath);
  }

  await deleteFilesQuietly(replacedOrRemovedPaths);

  return getPickupPartner(id);
}

async function deletePickupPartner(id) {
  const ref = partnersCollection().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new AppError("Pickup partner not found", 404, "PICKUP_PARTNER_NOT_FOUND");
  const existing = fromDoc(doc);
  await ref.delete();
  await deleteFilesQuietly(collectPartnerDocumentPaths(existing));
  return { id, deleted: true };
}

module.exports = {
  partnersCollection,
  listPickupPartners,
  getPickupPartner,
  findPartnerByName,
  createPickupPartner,
  updatePickupPartner,
  deletePickupPartner
};
