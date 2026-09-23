const { db } = require("../config/firebase");
const { COLLECTIONS } = require("../config/collections");
const { fromSnapshot, auditCreate, auditUpdate, cleanUndefined } = require("../utils/firestore");
const { cache } = require("../utils/cache");

const LOCATION_CACHE_TTL_SECONDS = 10 * 60;

function invalidateLocationCache() {
  cache.invalidatePrefix("locations:");
}

function normalizeName(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return normalizeName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function cityRef(city) {
  return db.collection(COLLECTIONS.CITIES).doc(slugify(city));
}

function sectorRef(city, sector) {
  return db.collection(COLLECTIONS.SECTORS).doc(`${slugify(city)}__${slugify(sector)}`);
}

function societyRef(city, sector, society) {
  return db.collection(COLLECTIONS.SOCIETIES).doc(`${slugify(city)}__${slugify(sector)}__${slugify(society)}`);
}

function locationIds({ city, sector, society, cityId, sectorId, societyId } = {}) {
  const cleanCity = normalizeName(city);
  const cleanSector = normalizeName(sector);
  const cleanSociety = normalizeName(society);
  const resolvedCityId = cityId || (cleanCity ? slugify(cleanCity) : undefined);
  const resolvedSectorId = sectorId || (resolvedCityId && cleanSector ? `${resolvedCityId}__${slugify(cleanSector)}` : undefined);
  const resolvedSocietyId = societyId || (resolvedSectorId && cleanSociety ? `${resolvedSectorId}__${slugify(cleanSociety)}` : undefined);

  return cleanUndefined({
    city: cleanCity || undefined,
    sector: cleanSector || undefined,
    society: cleanSociety || undefined,
    cityId: resolvedCityId,
    sectorId: resolvedSectorId,
    societyId: resolvedSocietyId
  });
}

function locationSnapshot(payload = {}) {
  return locationIds(payload);
}

function applyLocationFilters(query, filters = {}) {
  const ids = locationIds(filters);
  if (ids.cityId) query = query.where("cityId", "==", ids.cityId);
  if (ids.sectorId) query = query.where("sectorId", "==", ids.sectorId);
  if (ids.societyId) query = query.where("societyId", "==", ids.societyId);
  return query;
}

function buildCity(city, actor) {
  const ids = locationIds({ city });
  return cleanUndefined({
    id: ids.cityId,
    name: ids.city,
    normalizedName: ids.city.toLowerCase(),
    ...auditCreate(actor),
    ...auditUpdate(actor)
  });
}

function buildSector(city, sector, actor) {
  const ids = locationIds({ city, sector });
  return cleanUndefined({
    id: ids.sectorId,
    name: ids.sector,
    normalizedName: ids.sector.toLowerCase(),
    city: ids.city,
    cityId: ids.cityId,
    ...auditCreate(actor),
    ...auditUpdate(actor)
  });
}

function buildSociety(city, sector, society, actor) {
  const ids = locationIds({ city, sector, society });
  return cleanUndefined({
    id: ids.societyId,
    name: ids.society,
    normalizedName: ids.society.toLowerCase(),
    city: ids.city,
    cityId: ids.cityId,
    sector: ids.sector,
    sectorId: ids.sectorId,
    ...auditCreate(actor),
    ...auditUpdate(actor)
  });
}

function setLocationDocs(writer, location, actor) {
  const city = normalizeName(location.city);
  const sector = normalizeName(location.sector);
  const society = normalizeName(location.society);

  if (!city) return;

  writer.set(cityRef(city), buildCity(city, actor), { merge: true });
  if (sector) writer.set(sectorRef(city, sector), buildSector(city, sector, actor), { merge: true });
  if (sector && society) writer.set(societyRef(city, sector, society), buildSociety(city, sector, society, actor), { merge: true });
}

async function upsertLocationHierarchy(location, actor, tx = null) {
  if (tx) {
    setLocationDocs(tx, location, actor);
    return;
  }

  const batch = db.batch();
  setLocationDocs(batch, location, actor);
  await batch.commit();
  invalidateLocationCache();
}

async function upsertLocationsFromPayload(payload, actor, tx = null) {
  const city = normalizeName(payload.city);

  await upsertLocationHierarchy({
    city,
    sector: payload.sector,
    society: payload.society
  }, actor, tx);

  const sectors = Array.isArray(payload.sectors) ? payload.sectors : [];
  const societies = Array.isArray(payload.societies) ? payload.societies : [];

  if (tx) {
    sectors.forEach((sector) => setLocationDocs(tx, { city, sector }, actor));
    if (sectors.length === 1) {
      societies.forEach((society) => setLocationDocs(tx, { city, sector: sectors[0], society }, actor));
    }
    return;
  }

  if (city && (sectors.length || societies.length)) {
    const batch = db.batch();
    sectors.forEach((sector) => setLocationDocs(batch, { city, sector }, actor));
    if (sectors.length === 1) {
      societies.forEach((society) => setLocationDocs(batch, { city, sector: sectors[0], society }, actor));
    }
    await batch.commit();
    invalidateLocationCache();
  }
}

async function listCities() {
  return cache.getOrFetch("locations:cities", async () => {
    const snapshot = await db.collection(COLLECTIONS.CITIES).orderBy("name", "asc").get();
    return fromSnapshot(snapshot);
  }, LOCATION_CACHE_TTL_SECONDS);
}

/**
 * Natural sorting function for sector names.
 * Handles both numbered sectors (Sector 1, Sector 2, etc.) and named localities (DLF Phase 1, etc.)
 * Numbered sectors sort by number: Sector 1, Sector 2, ... Sector 10, Sector 11, ...
 * Named localities sort alphabetically after numbered sectors.
 */
function sortSectorsNatural(a, b) {
  const nameA = a.name || "";
  const nameB = b.name || "";

  // Extract numeric suffix using regex for patterns like "Sector 1", "Sector 10A", "DLF Phase 2"
  const numMatchA = nameA.match(/^.*?(\d+)\s*(.*)$/);
  const numMatchB = nameB.match(/^.*?(\d+)\s*(.*)$/);

  // If both have numeric suffixes, compare numerically
  if (numMatchA && numMatchB) {
    const numA = parseInt(numMatchA[1], 10);
    const numB = parseInt(numMatchB[1], 10);

    // If base numbers are different, sort by number
    if (numA !== numB) {
      return numA - numB;
    }

    // If base numbers are same, sort by any suffix (e.g., "A" < "B")
    const suffixA = numMatchA[2] || "";
    const suffixB = numMatchB[2] || "";
    return suffixA.localeCompare(suffixB);
  }

  // Fall back to alphabetical sorting for non-numbered sectors
  return nameA.localeCompare(nameB);
}

async function listSectors(city) {
  const ids = locationIds(typeof city === "object" ? city : { city });
  const key = `locations:sectors:${ids.cityId || "all"}`;
  return cache.getOrFetch(key, async () => {
    let query = db.collection(COLLECTIONS.SECTORS);
    if (ids.cityId) query = query.where("cityId", "==", ids.cityId);
    const snapshot = await query.get();
    return fromSnapshot(snapshot).sort(sortSectorsNatural);
  }, LOCATION_CACHE_TTL_SECONDS);
}

async function listSocieties({ city, sector } = {}) {
  const ids = locationIds({ city, sector });
  const key = `locations:societies:${ids.cityId || "all"}:${ids.sectorId || "all"}`;
  return cache.getOrFetch(key, async () => {
    let query = db.collection(COLLECTIONS.SOCIETIES);
    if (ids.cityId) query = query.where("cityId", "==", ids.cityId);
    if (ids.sectorId) query = query.where("sectorId", "==", ids.sectorId);
    const snapshot = await query.get();
    return fromSnapshot(snapshot).sort((a, b) => a.name.localeCompare(b.name));
  }, LOCATION_CACHE_TTL_SECONDS);
}

async function getLocationTree() {
  return cache.getOrFetch("locations:tree", async () => {
    const [cities, sectors, societies] = await Promise.all([
      listCities(),
      listSectors(),
      listSocieties()
    ]);

    const citySectors = {};
    const sectorSocieties = {};

    cities.forEach((city) => {
      citySectors[city.name] = [];
    });

    sectors.forEach((sector) => {
      if (!citySectors[sector.city]) citySectors[sector.city] = [];
      citySectors[sector.city].push(sector.name);
      sectorSocieties[`${sector.city}::${sector.name}`] = [];
    });

    societies.forEach((society) => {
      const key = `${society.city}::${society.sector}`;
      if (!sectorSocieties[key]) sectorSocieties[key] = [];
      sectorSocieties[key].push(society.name);
    });

    return {
      cities,
      sectors,
      societies,
      citySectors,
      sectorSocieties
    };
  }, LOCATION_CACHE_TTL_SECONDS);
}

async function deleteCity(id) {
  await db.collection(COLLECTIONS.CITIES).doc(id).delete();
  invalidateLocationCache();
}

async function deleteSector(id) {
  await db.collection(COLLECTIONS.SECTORS).doc(id).delete();
  invalidateLocationCache();
}

async function deleteSociety(id) {
  await db.collection(COLLECTIONS.SOCIETIES).doc(id).delete();
  invalidateLocationCache();
}

module.exports = {
  slugify,
  invalidateLocationCache,
  locationIds,
  locationSnapshot,
  applyLocationFilters,
  upsertLocationHierarchy,
  upsertLocationsFromPayload,
  listCities,
  listSectors,
  listSocieties,
  getLocationTree,
  deleteCity,
  deleteSector,
  deleteSociety
};
