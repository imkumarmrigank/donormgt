const { admin, db } = require("../src/config/firebase");
const { COLLECTIONS } = require("../src/config/collections");
const { locationSnapshot } = require("../src/services/location.service");
const {
  applyPickupAggregateDelta,
  applyPaymentAggregateDelta
} = require("../src/services/aggregate.service");

const SHOULD_REBUILD_AGGREGATES = process.argv.includes("--rebuild-aggregates");

function hasAnyPatch(patch = {}) {
  return Object.values(patch).some((value) => value !== undefined && value !== "");
}

async function flushBulkWriter(writer, label) {
  await writer.close();
  console.log(`${label}: done`);
}

async function backfillLocationIds(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  const writer = db.bulkWriter();
  let count = 0;

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const patch = locationSnapshot(data);
    const missing = ["cityId", "sectorId", "societyId"].some((key) => patch[key] && !data[key]);
    if (!missing || !hasAnyPatch(patch)) return;
    writer.set(doc.ref, patch, { merge: true });
    count += 1;
  });

  await flushBulkWriter(writer, `${collectionName} location ids (${count}/${snapshot.size})`);
}

async function migrateLegacyPayments() {
  const snapshot = await db.collectionGroup(COLLECTIONS.PAYMENTS).get();
  const writer = db.bulkWriter();
  let count = 0;

  for (const doc of snapshot.docs) {
    const pickupRef = doc.ref.parent.parent;
    if (!pickupRef || pickupRef.parent.id !== COLLECTIONS.PICKUPS) continue;

    const data = doc.data();
    const pickupId = data.pickupId || pickupRef.id;
    const targetId = `${pickupId}_${doc.id}`;
    const targetRef = db.collection(COLLECTIONS.PAYMENTS).doc(targetId);
    const existing = await targetRef.get();
    if (existing.exists) continue;

    const payment = {
      ...data,
      id: targetId,
      legacyPaymentId: doc.id,
      migratedFrom: doc.ref.path,
      pickupId,
      pickupPath: pickupRef.path
    };

    writer.set(targetRef, payment, { merge: true });
    writer.set(
      pickupRef.collection(COLLECTIONS.PAYMENT_LINKS).doc(targetId),
      {
        id: targetId,
        paymentId: targetId,
        paymentPath: targetRef.path,
        pickupId,
        partnerId: payment.partnerId || "",
        amount: Number(payment.amount) || 0,
        date: payment.date || "",
        writeOff: payment.writeOff === true
      },
      { merge: true }
    );
    writer.set(
      pickupRef,
      {
        paymentIds: admin.firestore.FieldValue.arrayUnion(targetId),
        lastPayment: {
          id: targetId,
          pickupId,
          orderId: payment.orderId || pickupId,
          partnerId: payment.partnerId || "",
          donorName: payment.donorName || "",
          amount: Number(payment.amount) || 0,
          refMode: payment.refMode || "cash",
          refValue: payment.refValue || "",
          notes: payment.notes || "",
          date: payment.date || "",
          screenshot: payment.screenshot || null,
          writeOff: payment.writeOff === true,
          writeOffAmount: Number(payment.writeOffAmount) || 0
        }
      },
      { merge: true }
    );
    count += 1;
  }

  await flushBulkWriter(writer, `legacy payment migration (${count}/${snapshot.size})`);
}

async function deleteCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  const writer = db.bulkWriter();
  snapshot.docs.forEach((doc) => writer.delete(doc.ref));
  await flushBulkWriter(writer, `${collectionName} reset (${snapshot.size})`);
}

async function rebuildDailyAggregates() {
  if (!SHOULD_REBUILD_AGGREGATES) {
    console.log("dailyAggregates: skipped (pass --rebuild-aggregates to rebuild derived analytics)");
    return;
  }

  await deleteCollection(COLLECTIONS.DAILY_AGGREGATES);

  const writer = db.bulkWriter();
  const [pickups, payments] = await Promise.all([
    db.collection(COLLECTIONS.PICKUPS).where("status", "==", "Completed").get(),
    db.collection(COLLECTIONS.PAYMENTS).get()
  ]);

  pickups.docs.forEach((doc) => applyPickupAggregateDelta(writer, { id: doc.id, ...doc.data() }, 1));
  payments.docs.forEach((doc) => applyPaymentAggregateDelta(writer, { id: doc.id, ...doc.data() }, 1));
  await flushBulkWriter(writer, `dailyAggregates rebuilt (${pickups.size} pickups, ${payments.size} payments)`);
}

async function main() {
  await backfillLocationIds(COLLECTIONS.DONORS);
  await backfillLocationIds(COLLECTIONS.PICKUPS);
  await backfillLocationIds(COLLECTIONS.PICKUP_PARTNERS);
  await migrateLegacyPayments();
  await rebuildDailyAggregates();
}

if (require.main === module) {
  main()
    .then(() => {
      console.log("Production schema migration complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Production schema migration failed", error);
      process.exit(1);
    });
}

module.exports = {
  backfillLocationIds,
  migrateLegacyPayments,
  rebuildDailyAggregates
};
