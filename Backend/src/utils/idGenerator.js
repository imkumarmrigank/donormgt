const { db } = require("../config/firebase");
const { COLLECTIONS } = require("../config/collections");

const SPECS = {
  donors: { counter: "donors", prefix: "D-", width: 3 },
  pickupPartners: { counter: "pickupPartners", prefix: "K-", width: 3 },
  pickups: { counter: "pickups", prefix: "P-", width: 3 },
  sksInflows: { counter: "sksInflows", prefix: "IN-", width: 4 },
  sksOutflows: { counter: "sksOutflows", prefix: "OUT-", width: 4 }
};

async function nextId(type, tx) {
  const spec = SPECS[type];
  if (!spec) throw new Error(`Unknown id type: ${type}`);

  const ref = db.collection(COLLECTIONS.COUNTERS).doc(spec.counter);
  const snap = await tx.get(ref);
  const current = snap.exists ? Number(snap.data().value || 0) : 0;
  const next = current + 1;
  tx.set(ref, { value: next, updatedAt: new Date().toISOString() }, { merge: true });
  return `${spec.prefix}${String(next).padStart(spec.width, "0")}`;
}

module.exports = { nextId };
