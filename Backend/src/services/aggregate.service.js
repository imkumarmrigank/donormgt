const { admin, db } = require("../config/firebase");
const { COLLECTIONS } = require("../config/collections");
const { increment, cleanUndefined } = require("../utils/firestore");
const { toNumber } = require("../utils/businessRules");

function aggregateCollection() {
  return db.collection(COLLECTIONS.DAILY_AGGREGATES);
}

function dayKey(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function aggregateRef(date) {
  return aggregateCollection().doc(dayKey(date));
}

function aggregateBase(date) {
  return {
    id: dayKey(date),
    date: dayKey(date),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

function pickupAggregateDelta(pickup, direction = 1) {
  if (!pickup || pickup.status !== "Completed") return null;

  const totalValue = toNumber(pickup.totalValue);
  const amountPaid = Math.min(totalValue, toNumber(pickup.amountPaid));
  const pending = pickup.paymentStatus === "Write Off"
    ? 0
    : Math.max(0, totalValue - amountPaid);
  const totalKg = toNumber(pickup.totalKg ?? pickup.totalKgs);
  const sksPickup = (pickup.sksItems || []).length > 0 ? 1 : 0;

  return cleanUndefined({
    totalPickupsCompleted: increment(direction),
    totalRSTValue: increment(totalValue * direction),
    totalRevenue: increment(totalValue * direction),
    totalRaddiKg: increment(totalKg * direction),
    amountReceived: increment(amountPaid * direction),
    pendingFromPickupPartners: increment(pending * direction),
    totalSKSPickups: increment(sksPickup * direction),
    drivePickups: increment((pickup.pickupMode === "Drive" ? 1 : 0) * direction),
    individualPickups: increment((pickup.pickupMode !== "Drive" ? 1 : 0) * direction)
  });
}

function applyPickupAggregateDelta(writer, pickup, direction = 1) {
  const delta = pickupAggregateDelta(pickup, direction);
  if (!delta) return;
  writer.set(aggregateRef(pickup.date), {
    ...aggregateBase(pickup.date),
    ...delta
  }, { merge: true });
}

function applyPickupAggregateChange(writer, oldPickup, newPickup) {
  if (oldPickup?.status === "Completed") applyPickupAggregateDelta(writer, oldPickup, -1);
  if (newPickup?.status === "Completed") applyPickupAggregateDelta(writer, newPickup, 1);
}

function applyPaymentAggregateDelta(writer, payment, direction = 1) {
  if (!payment) return;
  const amount = toNumber(payment.amount) * direction;
  const writeOffAmount = toNumber(payment.writeOffAmount) * direction;

  writer.set(aggregateRef(payment.date), {
    ...aggregateBase(payment.date),
    paymentCount: increment(direction),
    paymentAmount: increment(amount),
    writeOffAmount: increment(writeOffAmount),
    paymentCashAmount: increment(payment.refMode === "cash" ? amount : 0),
    paymentDigitalAmount: increment(payment.refMode !== "cash" ? amount : 0)
  }, { merge: true });
}

async function listDailyAggregates({ dateFrom, dateTo, limit = 366 } = {}) {
  let query = aggregateCollection().orderBy(admin.firestore.FieldPath.documentId(), "asc");
  if (dateFrom) query = query.where(admin.firestore.FieldPath.documentId(), ">=", dayKey(dateFrom));
  if (dateTo) query = query.where(admin.firestore.FieldPath.documentId(), "<=", dayKey(dateTo));
  const snapshot = await query.limit(limit).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function sumAggregates(rows = []) {
  return rows.reduce((acc, row) => {
    Object.entries(row).forEach(([key, value]) => {
      if (["id", "date", "updatedAt"].includes(key)) return;
      acc[key] = (acc[key] || 0) + toNumber(value);
    });
    return acc;
  }, {});
}

module.exports = {
  aggregateCollection,
  dayKey,
  applyPickupAggregateDelta,
  applyPickupAggregateChange,
  applyPaymentAggregateDelta,
  listDailyAggregates,
  sumAggregates
};
