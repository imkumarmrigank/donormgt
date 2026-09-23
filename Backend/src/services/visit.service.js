/**
 * Rider visits: a rider, standing at a pickup, records what happened there (an
 * outcome such as "Pickup done" or "Donor not available") together with the
 * phone's GPS fix and photos. The fix is compared with the pickup's saved pin so
 * admins can see whether the rider was really at the door.
 */
const { db } = require("../config/firebase");
const { env } = require("../config/env");
const { COLLECTIONS } = require("../config/collections");
const { ROLES } = require("../config/roles");
const { AppError } = require("../utils/AppError");
const { fromDoc, fromSnapshot, auditCreate, auditUpdate, cleanUndefined, increment } = require("../utils/firestore");
const { sanitizePathSegment } = require("../utils/sanitize");
const { cache } = require("../utils/cache");

// A visit more than this far from the pickup pin needs a written reason and is flagged.
const MAX_DISTANCE_METERS = 100;
// A GPS fix vaguer than this cannot prove presence either way, so it is flagged too.
const MAX_ACCURACY_METERS = 100;

const DEFAULT_OUTCOMES = [
  { id: "pickup-done", label: "Pickup done", requiresPhoto: true, pickupStatus: null },
  { id: "donor-not-available", label: "Donor not available", requiresPhoto: false, pickupStatus: "Did Not Open Door" },
  { id: "product-not-useful", label: "Product not useful", requiresPhoto: true, pickupStatus: null },
  { id: "donor-asked-to-reschedule", label: "Donor asked to reschedule", requiresPhoto: false, pickupStatus: "Postponed" },
  { id: "address-not-found", label: "Address not found", requiresPhoto: false, pickupStatus: null }
];

// Statuses an outcome may move the pickup to. "Completed" is left to the normal
// record-pickup flow, which captures weights and value.
const OUTCOME_PICKUP_STATUSES = ["Pending", "Postponed", "Did Not Open Door"];

const pickups = () => db.collection(COLLECTIONS.PICKUPS);
const visits = () => db.collection(COLLECTIONS.PICKUP_VISITS);
const outcomes = () => db.collection(COLLECTIONS.VISIT_OUTCOMES);
const riderLocations = () => db.collection(COLLECTIONS.RIDER_LOCATIONS);

// A rider counts as "live" on the admin map while their last ping is this recent.
const LIVE_WINDOW_MINUTES = 30;

function todayInIndia() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function shiftDate(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Great-circle distance in metres. */
function distanceMeters(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Validates a { lat, lng, accuracy? } pin from a client; returns null when absent. */
function normalizeGeo(input, { source, actor } = {}) {
  if (input === null || input === undefined || input === "") return null;
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new AppError("Pickup location must have a valid latitude and longitude", 422, "INVALID_LOCATION");
  }
  const accuracy = Number(input.accuracy);
  return cleanUndefined({
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : undefined,
    source: input.source || source || "manual",
    capturedAt: input.capturedAt || new Date().toISOString(),
    capturedBy: input.capturedBy || actor?.uid
  });
}

// ── Outcomes ─────────────────────────────────────────────────────────────────

async function listOutcomes({ includeInactive = false } = {}) {
  const rows = await cache.getOrFetch("visitOutcomes:all", async () => {
    let snapshot = await outcomes().get();
    if (snapshot.empty) {
      const batch = db.batch();
      DEFAULT_OUTCOMES.forEach((outcome, order) => {
        batch.set(outcomes().doc(outcome.id), { ...outcome, order, active: true, ...auditCreate({ uid: "system" }) });
      });
      await batch.commit();
      snapshot = await outcomes().get();
    }
    return fromSnapshot(snapshot).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, 300);
  return includeInactive ? rows : rows.filter((row) => row.active !== false);
}

function outcomePatch(data) {
  if (data.pickupStatus && !OUTCOME_PICKUP_STATUSES.includes(data.pickupStatus)) {
    throw new AppError(`pickupStatus must be one of: ${OUTCOME_PICKUP_STATUSES.join(", ")}`, 422, "INVALID_STATUS");
  }
  return cleanUndefined({
    label: data.label === undefined ? undefined : String(data.label).trim(),
    requiresPhoto: typeof data.requiresPhoto === "boolean" ? data.requiresPhoto : undefined,
    pickupStatus: data.pickupStatus === undefined ? undefined : (data.pickupStatus || null),
    active: typeof data.active === "boolean" ? data.active : undefined,
    order: Number.isFinite(Number(data.order)) ? Number(data.order) : undefined
  });
}

async function createOutcome(data, actor) {
  const label = String(data.label || "").trim();
  if (!label) throw new AppError("Outcome name is required", 422, "LABEL_REQUIRED");
  const existing = await listOutcomes({ includeInactive: true });
  const id = sanitizePathSegment(label);
  if (existing.some((row) => row.id === id)) {
    throw new AppError("An outcome with this name already exists", 409, "OUTCOME_EXISTS");
  }
  await outcomes().doc(id).set({
    requiresPhoto: false,
    pickupStatus: null,
    active: true,
    order: existing.length,
    ...outcomePatch(data),
    label,
    id,
    ...auditCreate(actor)
  });
  cache.invalidate("visitOutcomes:all");
  return fromDoc(await outcomes().doc(id).get());
}

async function updateOutcome(id, data, actor) {
  const ref = outcomes().doc(id);
  if (!(await ref.get()).exists) throw new AppError("Outcome not found", 404, "OUTCOME_NOT_FOUND");
  await ref.set({ ...outcomePatch(data), ...auditUpdate(actor) }, { merge: true });
  cache.invalidate("visitOutcomes:all");
  return fromDoc(await ref.get());
}

// ── Scheduling: rider assignment and pickup pin ─────────────────────────────

/**
 * Normalises the rider and location fields of a pickup create/update body in place:
 * checks the rider is an active rider and snapshots their name, validates the pin.
 */
async function prepareAssignment(body, actor, existingPickupId = null) {
  if (Object.prototype.hasOwnProperty.call(body, "riderId")) {
    if (existingPickupId) {
      const existing = fromDoc(await pickups().doc(existingPickupId).get());
      if (existing && (existing.riderId || null) !== (body.riderId || null)) body.riderTrip = null;
    }
    if (!body.riderId) {
      body.riderId = null;
      body.riderName = null;
    } else {
      const rider = fromDoc(await db.collection(COLLECTIONS.USERS).doc(body.riderId).get());
      if (!rider || rider.role !== ROLES.RIDER || rider.active === false) {
        throw new AppError("Choose an active rider for this pickup", 422, "INVALID_RIDER");
      }
      body.riderName = rider.name || rider.email;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "geo")) {
    body.geo = normalizeGeo(body.geo, { actor });
  }
  return body;
}

/** A pin set while scheduling is saved on the donor too, so the next pickup reuses it. */
async function rememberDonorGeo(donorId, geo) {
  if (!donorId || !geo) return;
  await db.collection(COLLECTIONS.DONORS).doc(donorId).set({ geo }, { merge: true });
}

// ── Rider screens ────────────────────────────────────────────────────────────

const RIDER_PICKUP_FIELDS = [
  "id", "orderId", "date", "timeSlot", "status", "pickupMode", "notes",
  "donorId", "donorName", "mobile", "house", "houseNo", "society", "sector", "city",
  "geo", "lastVisit", "visitCount", "riderTrip"
];

function riderView(pickup) {
  return RIDER_PICKUP_FIELDS.reduce((acc, key) => {
    if (pickup[key] !== undefined) acc[key] = pickup[key];
    return acc;
  }, {});
}

/** Pickups assigned to this rider: the last 7 days (to catch missed ones) through the next 14. */
async function listRiderPickups(rider) {
  const today = todayInIndia();
  const snapshot = await pickups()
    .where("riderId", "==", rider.uid)
    .where("date", ">=", shiftDate(today, -7))
    .where("date", "<=", shiftDate(today, 14))
    .orderBy("date", "asc")
    .get();
  return {
    today,
    maxDistanceMeters: MAX_DISTANCE_METERS,
    pickups: fromSnapshot(snapshot).map(riderView)
  };
}

async function assignedPickup(rider, pickupId) {
  const ref = pickups().doc(pickupId);
  const pickup = fromDoc(await ref.get());
  if (!pickup || pickup.riderId !== rider.uid) {
    throw new AppError("This pickup is not assigned to you", 404, "PICKUP_NOT_FOUND");
  }
  if (pickup.status === "Completed") {
    throw new AppError("This pickup is already completed", 409, "PICKUP_ALREADY_COMPLETED");
  }
  return { ref, pickup };
}

/** Rider accepts the job. Idempotent. */
async function acceptPickup(rider, pickupId) {
  const { ref, pickup } = await assignedPickup(rider, pickupId);
  if (pickup.riderTrip?.acceptedAt) return riderView(pickup);
  const riderTrip = { ...(pickup.riderTrip || {}), acceptedAt: new Date().toISOString() };
  await ref.set({ riderTrip, ...auditUpdate(rider) }, { merge: true });
  forgetActiveTrips(rider.uid);
  return riderView({ ...pickup, riderTrip });
}

/** Rider sets off for the pickup; the start position is kept when the phone gives one. */
async function startTrip(rider, pickupId, { position } = {}) {
  const { ref, pickup } = await assignedPickup(rider, pickupId);
  if (!pickup.riderTrip?.acceptedAt) {
    throw new AppError("Accept the pickup before starting", 409, "NOT_ACCEPTED");
  }
  if (pickup.riderTrip?.startedAt) return riderView(pickup);
  const riderTrip = cleanUndefined({
    ...pickup.riderTrip,
    startedAt: new Date().toISOString(),
    startPosition: position ? normalizeGeo(position, { source: "rider-gps", actor: rider }) : undefined
  });
  await ref.set({ riderTrip, ...auditUpdate(rider) }, { merge: true });
  return riderView({ ...pickup, riderTrip });
}

function validatePhotos(photos, pickupId) {
  if (!Array.isArray(photos)) return [];
  // Photos must be ones uploaded for this pickup through /uploads (purpose "pickup-visit").
  const prefix = `image/authenticated/${sanitizePathSegment(env.cloudinaryFolder)}/pickup-visit/${sanitizePathSegment(pickupId)}/`;
  return photos.slice(0, 6).map((photo) => {
    if (!photo || typeof photo.storagePath !== "string" || !photo.storagePath.startsWith(prefix) || typeof photo.url !== "string") {
      throw new AppError("Photos must be taken in the app for this pickup", 422, "INVALID_PHOTO");
    }
    return { storagePath: photo.storagePath, url: photo.url };
  });
}

async function recordVisit(rider, pickupId, data) {
  const { ref: pickupRef, pickup } = await assignedPickup(rider, pickupId);
  if (!pickup.riderTrip?.startedAt) {
    throw new AppError("Accept and start the pickup before recording a visit", 409, "NOT_STARTED");
  }

  const outcome = (await listOutcomes()).find((row) => row.id === data.outcomeId);
  if (!outcome) throw new AppError("Choose what happened at the pickup", 422, "INVALID_OUTCOME");

  const position = normalizeGeo(data.position, { source: "rider-gps", actor: rider });
  if (!position) {
    throw new AppError("Your location is needed to record a visit. Turn on location and try again.", 422, "LOCATION_REQUIRED");
  }

  const photos = validatePhotos(data.photos, pickupId);
  if (outcome.requiresPhoto && photos.length === 0) {
    throw new AppError(`Add a photo for "${outcome.label}"`, 422, "PHOTO_REQUIRED");
  }

  const distance = pickup.geo ? Math.round(distanceMeters(pickup.geo, position)) : null;
  const flags = [];
  if (distance === null) flags.push("no-pickup-pin");
  else if (distance > MAX_DISTANCE_METERS) flags.push("too-far");
  if (position.accuracy !== undefined && position.accuracy > MAX_ACCURACY_METERS) flags.push("low-accuracy");

  const farReason = String(data.farReason || "").trim();
  if (flags.includes("too-far") && !farReason) {
    throw new AppError(
      `You are ${distance} m from the pickup location (limit ${MAX_DISTANCE_METERS} m). Move closer, or give a reason.`,
      422,
      "TOO_FAR",
      { distanceMeters: distance, maxDistanceMeters: MAX_DISTANCE_METERS }
    );
  }

  const visitRef = visits().doc();
  const visit = cleanUndefined({
    id: visitRef.id,
    pickupId,
    orderId: pickup.orderId || pickupId,
    pickupDate: pickup.date,
    donorId: pickup.donorId || null,
    donorName: pickup.donorName || "",
    address: [pickup.house || pickup.houseNo, pickup.society, pickup.sector, pickup.city].filter(Boolean).join(", "),
    riderId: rider.uid,
    riderName: pickup.riderName || rider.name || rider.email,
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    position,
    pickupGeo: pickup.geo || null,
    distanceMeters: distance,
    maxDistanceMeters: MAX_DISTANCE_METERS,
    verified: flags.length === 0,
    flags,
    farReason: farReason || null,
    photos,
    acceptedAt: pickup.riderTrip.acceptedAt,
    startedAt: pickup.riderTrip.startedAt,
    startPosition: pickup.riderTrip.startPosition || null,
    notes: String(data.notes || "").trim(),
    date: todayInIndia(),
    ...auditCreate(rider)
  });

  const lastVisit = {
    visitId: visit.id,
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    verified: visit.verified,
    flags,
    distanceMeters: distance,
    at: visit.createdAt,
    riderName: visit.riderName
  };

  const batch = db.batch();
  batch.set(visitRef, visit);
  batch.set(pickupRef, cleanUndefined({
    lastVisit,
    visitCount: increment(1),
    ...(outcome.pickupStatus ? { status: outcome.pickupStatus } : {}),
    ...(outcome.pickupStatus === "Postponed" ? { postponeReason: outcome.label } : {}),
    ...auditUpdate(rider)
  }), { merge: true });
  await batch.commit();
  forgetActiveTrips(rider.uid);

  return { visit, pickup: riderView({ ...pickup, lastVisit, visitCount: (pickup.visitCount || 0) + 1, ...(outcome.pickupStatus ? { status: outcome.pickupStatus } : {}) }) };
}

// ── Live rider locations ─────────────────────────────────────────────────────

/** Accepted, not completed, and no visit recorded since it was accepted. */
function isActiveTrip(pickup) {
  const acceptedAt = pickup.riderTrip?.acceptedAt;
  if (!acceptedAt || pickup.status === "Completed") return false;
  return !pickup.lastVisit?.at || pickup.lastVisit.at < acceptedAt;
}

function activeTripSummary(pickup) {
  return cleanUndefined({
    pickupId: pickup.id,
    orderId: pickup.orderId || pickup.id,
    donorName: pickup.donorName || "",
    address: [pickup.house || pickup.houseNo, pickup.society, pickup.sector, pickup.city].filter(Boolean).join(", "),
    date: pickup.date,
    timeSlot: pickup.timeSlot || "",
    geo: pickup.geo || null,
    stage: pickup.riderTrip?.startedAt ? "started" : "accepted",
    acceptedAt: pickup.riderTrip?.acceptedAt,
    startedAt: pickup.riderTrip?.startedAt
  });
}

async function activeTripsForRider(riderUid) {
  return cache.getOrFetch(`rider:active:${riderUid}`, async () => {
    const snapshot = await pickups()
      .where("riderId", "==", riderUid)
      .where("date", ">=", shiftDate(todayInIndia(), -7))
      .get();
    return fromSnapshot(snapshot).filter(isActiveTrip).map(activeTripSummary);
  }, 60);
}

function forgetActiveTrips(riderUid) {
  cache.invalidate(`rider:active:${riderUid}`);
}

/**
 * The rider app sends its position while the rider has an accepted pickup open.
 * Only the latest position is kept (one document per rider).
 */
async function recordRiderPing(rider, { position }) {
  const trips = await activeTripsForRider(rider.uid);
  if (!trips.length) return { tracking: false };
  const point = normalizeGeo(position, { source: "rider-gps", actor: rider });
  if (!point) throw new AppError("A position is required", 422, "LOCATION_REQUIRED");
  await riderLocations().doc(rider.uid).set({
    riderId: rider.uid,
    riderName: rider.name || rider.email,
    position: point,
    heading: Number.isFinite(Number(position.heading)) ? Number(position.heading) : null,
    speed: Number.isFinite(Number(position.speed)) ? Number(position.speed) : null,
    updatedAt: new Date().toISOString()
  });
  return { tracking: true };
}

/** Admin map: riders with an active trip and a recent ping, plus their pickups. */
async function listLiveRiders() {
  const since = new Date(Date.now() - LIVE_WINDOW_MINUTES * 60000).toISOString();
  const [locationsSnap, pickupsSnap] = await Promise.all([
    riderLocations().where("updatedAt", ">=", since).get(),
    pickups().where("date", ">=", shiftDate(todayInIndia(), -7)).get()
  ]);
  const tripsByRider = {};
  fromSnapshot(pickupsSnap)
    .filter((pickup) => pickup.riderId && isActiveTrip(pickup))
    .forEach((pickup) => {
      (tripsByRider[pickup.riderId] ||= { riderName: pickup.riderName, trips: [] }).trips.push(activeTripSummary(pickup));
    });

  const locations = Object.fromEntries(fromSnapshot(locationsSnap).map((row) => [row.riderId, row]));
  const riderIds = new Set([...Object.keys(tripsByRider), ...Object.keys(locations)]);
  const riders = [...riderIds]
    .filter((id) => tripsByRider[id]) // show riders only while they have an accepted pickup
    .map((id) => ({
      riderId: id,
      riderName: locations[id]?.riderName || tripsByRider[id].riderName || "Rider",
      position: locations[id]?.position || null,
      heading: locations[id]?.heading ?? null,
      speed: locations[id]?.speed ?? null,
      lastSeenAt: locations[id]?.updatedAt || null,
      trips: tripsByRider[id].trips.sort((a, b) => String(a.date).localeCompare(String(b.date)))
    }))
    .sort((a, b) => a.riderName.localeCompare(b.riderName));

  // Today's rider-assigned pickups by stage, for the dashboard.
  const today = todayInIndia();
  const todays = fromSnapshot(pickupsSnap).filter((pickup) => pickup.riderId && pickup.date === today);
  const stageOf = (pickup) => {
    if (pickup.status === "Completed") return "completed";
    if (pickup.lastVisit?.at && (!pickup.riderTrip?.acceptedAt || pickup.lastVisit.at >= pickup.riderTrip.acceptedAt)) return "visited";
    if (pickup.riderTrip?.startedAt) return "started";
    if (pickup.riderTrip?.acceptedAt) return "accepted";
    return "assigned";
  };
  const summary = { assigned: 0, accepted: 0, started: 0, visited: 0, completed: 0, flagged: 0, total: todays.length };
  todays.forEach((pickup) => {
    summary[stageOf(pickup)] += 1;
    if (pickup.lastVisit && pickup.lastVisit.verified === false && String(pickup.lastVisit.at || "").slice(0, 10) >= shiftDate(today, -1)) summary.flagged += 1;
  });
  summary.liveRiders = riders.filter((rider) => rider.lastSeenAt).length;

  return { liveWindowMinutes: LIVE_WINDOW_MINUTES, generatedAt: new Date().toISOString(), today, summary, riders };
}

// ── Admin review ─────────────────────────────────────────────────────────────

async function listVisits({ dateFrom, dateTo, riderId, pickupId, flagged, limit = 300 } = {}) {
  let query = visits();
  if (pickupId) query = query.where("pickupId", "==", pickupId);
  if (riderId) query = query.where("riderId", "==", riderId);
  if (dateFrom) query = query.where("date", ">=", dateFrom);
  if (dateTo) query = query.where("date", "<=", dateTo);
  if (flagged === true || flagged === "true") query = query.where("verified", "==", false);
  const snapshot = await query.orderBy("createdAt", "desc").limit(Math.min(1000, Number(limit) || 300)).get();
  return fromSnapshot(snapshot);
}

module.exports = {
  MAX_DISTANCE_METERS,
  OUTCOME_PICKUP_STATUSES,
  distanceMeters,
  normalizeGeo,
  listOutcomes,
  createOutcome,
  updateOutcome,
  prepareAssignment,
  rememberDonorGeo,
  listRiderPickups,
  acceptPickup,
  startTrip,
  recordRiderPing,
  listLiveRiders,
  recordVisit,
  listVisits
};
