const { db } = require("../config/firebase");
const { COLLECTIONS } = require("../config/collections");
const { AppError } = require("../utils/AppError");
const {
  fromDoc,
  fromSnapshot,
  auditCreate,
  increment,
  arrayUnion,
  cleanUndefined
} = require("../utils/firestore");
const { fetchCursorPage, listPayload } = require("../utils/query");
const {
  toNumber,
  derivePaymentStatus
} = require("../utils/businessRules");
const {
  pickupsCollection,
  pickupPendingAmount,
  pickupTransactionSummary,
  listPickups
} = require("./pickup.service");
const { partnersCollection } = require("./pickupPartner.service");
const { applyPaymentAggregateDelta } = require("./aggregate.service");

const PAYMENT_ALLOCATION_PICKUP_LIMIT = 400;

function paymentsCollection() {
  return db.collection(COLLECTIONS.PAYMENTS);
}

function paymentLinksCollection(pickupId) {
  return pickupsCollection().doc(pickupId).collection(COLLECTIONS.PAYMENT_LINKS);
}

function legacyPickupPaymentsCollection(pickupId) {
  return pickupsCollection().doc(pickupId).collection(COLLECTIONS.PAYMENTS);
}

function updatePartnerTransactions(transactions = [], pickup, paymentStatus) {
  const summary = pickupTransactionSummary({ ...pickup, paymentStatus });
  const index = transactions.findIndex((tx) => tx.pickupId === pickup.id);
  if (index === -1) return [...transactions, summary];
  return transactions.map((tx, i) =>
    i === index
      ? { ...tx, value: summary.value, paid: summary.paid, status: summary.status, date: summary.date, donor: summary.donor, society: summary.society }
      : tx
  );
}

function paymentPayload({ pickup, partnerId, amount, data, actor, cumulative, writeOffAmount = 0 }) {
  const totalValue = toNumber(pickup.totalValue);
  return cleanUndefined({
    pickupId: pickup.id,
    pickupPath: `${COLLECTIONS.PICKUPS}/${pickup.id}`,
    orderId: pickup.orderId || pickup.id,
    partnerId,
    partnerName: pickup.PickupPartner || pickup.pickupPartnerName || "",
    donorId: pickup.donorId || null,
    donorName: pickup.donorName || "",
    donorMobile: pickup.mobile || "",
    city: pickup.city || "",
    cityId: pickup.cityId || "",
    sector: pickup.sector || "",
    sectorId: pickup.sectorId || "",
    society: pickup.society || "",
    societyId: pickup.societyId || "",
    amount,
    cumulative,
    pendingAfter: data.writeOff ? 0 : Math.max(0, totalValue - cumulative),
    totalValue,
    refMode: data.writeOff ? (data.refMode || "writeoff") : (data.refMode || "cash"),
    refValue: data.refValue || "",
    notes: data.notes || "",
    date: data.date || new Date().toISOString().slice(0, 10),
    screenshot: data.screenshot || null,
    writeOff: data.writeOff === true,
    writeOffAmount,
    status: "posted",
    ...auditCreate(actor)
  });
}

function paymentHistoryEntry(payment) {
  const timestamp = new Date().toISOString();
  return cleanUndefined({
    id: payment.id,
    pickupId: payment.pickupId,
    orderId: payment.orderId,
    partnerId: payment.partnerId,
    donorName: payment.donorName,
    amount: payment.amount,
    refMode: payment.refMode,
    refValue: payment.refValue,
    notes: payment.notes,
    date: payment.date,
    screenshot: payment.screenshot,
    writeOff: payment.writeOff,
    writeOffAmount: payment.writeOffAmount,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

function paymentLinkPayload(paymentRef, payment, actor) {
  return cleanUndefined({
    id: payment.id,
    paymentId: payment.id,
    paymentPath: paymentRef.path,
    pickupId: payment.pickupId,
    partnerId: payment.partnerId,
    amount: payment.amount,
    date: payment.date,
    writeOff: payment.writeOff,
    ...auditCreate(actor)
  });
}

function writePayment(tx, paymentRef, payment, actor) {
  tx.set(paymentRef, payment);
  tx.set(
    paymentLinksCollection(payment.pickupId).doc(payment.id),
    paymentLinkPayload(paymentRef, payment, actor),
    { merge: true }
  );
  applyPaymentAggregateDelta(tx, payment, 1);
}

function responsePayment(payment) {
  const timestamp = new Date().toISOString();
  return { ...payment, createdAt: timestamp, updatedAt: timestamp };
}

// List top-level payments for reports, reconciliation, and exports.
async function listPayments(filters = {}) {
  let query = paymentsCollection();
  if (filters.pickupId)  query = query.where("pickupId",  "==", filters.pickupId);
  if (filters.partnerId) query = query.where("partnerId", "==", filters.partnerId);
  if (filters.dateFrom)  query = query.where("date", ">=", filters.dateFrom);
  if (filters.dateTo)    query = query.where("date", "<=", filters.dateTo);
  if (filters.refMode)   query = query.where("refMode", "==", filters.refMode);
  if (filters.writeOff !== undefined) query = query.where("writeOff", "==", filters.writeOff === true || filters.writeOff === "true");

  const page = await fetchCursorPage(query, {
    limit: filters.pageSize || filters.limit,
    defaultLimit: 100,
    maxLimit: 500,
    cursor: filters.cursor,
    fields: filters.fields,
    orderBy: [{ field: "date", direction: "desc" }]
  });

  return listPayload(page);
}

// ── Payments for one pickup ───────────────────────────────────────────────────
async function getPickupPayments(pickupId) {
  const snapshot = await paymentsCollection()
    .where("pickupId", "==", pickupId)
    .orderBy("date", "desc")
    .limit(100)
    .get();
  const payments = fromSnapshot(snapshot);
  if (payments.length) return payments;

  const legacySnapshot = await legacyPickupPaymentsCollection(pickupId)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  return fromSnapshot(legacySnapshot);
}

// ── Partner payment summary ───────────────────────────────────────────────────
/**
 * Returns a backend-computed, per-partner grouping of all completed pickups.
 * Supports optional filters: dateFrom, dateTo, partnerId.
 *
 * When a date range is applied, per-partner totals are re-computed from
 * filtered pickups only.  Without a date range the pre-aggregated partner
 * document fields (totalValue / amountReceived / pendingAmount) are used for
 * the overall totals, and the records array is the slice returned by the
 * pickup query (which will be un-filtered for the all-time case).
 */
async function getPartnerSummary(filters = {}) {
  const { dateFrom, dateTo, partnerId, search, status } = filters;
  const hasDateFilter = !!(dateFrom || dateTo);
  const recordLimit = Math.min(1000, Math.max(50, Number(filters.recordLimit || filters.limit) || 500));

  const partnerMap = {};

  function ensurePartner({ id, name, mobile } = {}) {
    const key = id || name;
    if (!key) return null;
    if (!partnerMap[key]) {
      partnerMap[key] = {
        pickuppartnerId: id || key,
        partnerName: name || key,
        mobile: mobile || "",
        total: 0,
        paid: 0,
        pending: 0,
        writeOff: 0,
        count: 0,
        records: [],
        history: []
      };
    }
    return partnerMap[key];
  }

  if (partnerId) {
    const partnerDoc = await partnersCollection().doc(partnerId).get();
    const partner = fromDoc(partnerDoc);
    if (partner) {
      const entry = ensurePartner({ id: partner.id, name: partner.name, mobile: partner.mobile });
      if (!hasDateFilter && entry) {
        entry.total = toNumber(partner.totalValue);
        entry.paid = toNumber(partner.amountReceived);
        entry.pending = Math.max(0, toNumber(partner.pendingAmount));
        entry.count = toNumber(partner.totalPickups);
      }
    }
  } else if (!hasDateFilter) {
    const partnersSnap = await partnersCollection().orderBy("name", "asc").limit(500).get();
    fromSnapshot(partnersSnap).forEach((partner) => {
      const entry = ensurePartner({ id: partner.id, name: partner.name, mobile: partner.mobile });
      entry.total = toNumber(partner.totalValue);
      entry.paid = toNumber(partner.amountReceived);
      entry.pending = Math.max(0, toNumber(partner.pendingAmount));
      entry.count = toNumber(partner.totalPickups);
    });
  }

  const pickupFilters = {
    status: "Completed",
    partnerId: partnerId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    limit: recordLimit
  };

  // For all-time view:
  // - If status=clear: show paid pickups
  // - If status=pending: show unpaid pickups
  // - If status is omitted/"all": do NOT restrict; we still want records available
  //   for fully paid partners so the UI can expand "View Pickups".
  if (!hasDateFilter) {
    if (status === "clear") pickupFilters.paymentStatus = "Paid";
    else if (status === "pending") pickupFilters.paymentStatus = ["Not Paid", "Partially Paid"];
  }

  const pickups = await listPickups(pickupFilters);

  pickups
    .filter((p) => p.PickupPartner || p.partnerId)
    .forEach((p) => {
      const entry = ensurePartner({
        id: p.partnerId || p.PickupPartner,
        name: p.PickupPartner || p.pickupPartnerName || p.partnerId,
        mobile: p.pickuppartneradiMobile || p.pickupPartnerMobile || ""
      });
      if (!entry) return;

      const total = toNumber(p.totalValue);
      const paid = Math.min(total, toNumber(p.amountPaid));
      const isWO = p.paymentStatus === "Write Off";
      const pending = isWO ? 0 : Math.max(0, total - paid);
      const writeOff = isWO ? Math.max(0, total - paid) : 0;

      if (hasDateFilter) {
        entry.total += total;
        entry.paid += paid;
        entry.pending += pending;
        entry.writeOff += writeOff;
        entry.count += 1;
      }
      entry.records.push(p);
    });

  let paymentQuery = paymentsCollection();
  if (partnerId) paymentQuery = paymentQuery.where("partnerId", "==", partnerId);
  if (dateFrom) paymentQuery = paymentQuery.where("date", ">=", dateFrom);
  if (dateTo) paymentQuery = paymentQuery.where("date", "<=", dateTo);
  const paymentPage = await fetchCursorPage(paymentQuery, {
    limit: 1000,
    defaultLimit: 500,
    maxLimit: 1000,
    orderBy: [{ field: "date", direction: "desc" }]
  });

  paymentPage.records.forEach((payment) => {
    const entry = ensurePartner({
      id: payment.partnerId,
      name: payment.partnerName || payment.partnerId,
      mobile: ""
    });
    if (!entry) return;
    entry.history.push(paymentHistoryEntry(payment));
    if (hasDateFilter) entry.writeOff += toNumber(payment.writeOffAmount);
  });

  let partners = Object.values(partnerMap).sort(
    (a, b) => b.pending - a.pending || a.partnerName.localeCompare(b.partnerName)
  );

  if (search) {
    const q = search.toLowerCase();
    partners = partners.filter(
      (p) =>
        p.partnerName.toLowerCase().includes(q) ||
        (p.mobile || "").includes(q) ||
        p.records.some((record) => [
          record.orderId,
          record.id,
          record.donorName,
          record.mobile,
          record.society
        ].some((value) => String(value || "").toLowerCase().includes(q)))
    );
  }

  if (status === "pending") partners = partners.filter((p) => p.pending > 0);
  if (status === "clear") partners = partners.filter((p) => p.pending === 0);

  const summary = {
    totalPartners:  partners.length,
    withPending:    partners.filter((p) => p.pending > 0).length,
    totalRevenue:   partners.reduce((s, p) => s + p.total,    0),
    totalReceived:  partners.reduce((s, p) => s + p.paid,     0),
    totalPending:   partners.reduce((s, p) => s + p.pending,  0),
    totalWriteOff:  partners.reduce((s, p) => s + p.writeOff, 0),
  };

  return {
    partners,
    summary,
    filters: { dateFrom, dateTo, partnerId, search, status },
    pageInfo: {
      recordLimit,
      paymentHistoryTruncated: paymentPage.pageInfo.hasMore
    }
  };
}

// ── Record payment on a single pickup ────────────────────────────────────────
async function recordSinglePickupPayment(partnerId, data, actor) {
  if (!data.pickupId) {
    throw new AppError("pickupId is required for single-pickup payment", 422, "PICKUP_ID_REQUIRED");
  }

  return db.runTransaction(async (tx) => {
    const partnerRef = partnersCollection().doc(partnerId);
    const pickupRef  = pickupsCollection().doc(data.pickupId);
    const [partnerDoc, pickupDoc] = await Promise.all([tx.get(partnerRef), tx.get(pickupRef)]);

    if (!partnerDoc.exists) throw new AppError("Pickup partner not found", 404, "PICKUP_PARTNER_NOT_FOUND");
    if (!pickupDoc.exists)  throw new AppError("Pickup not found",         404, "PICKUP_NOT_FOUND");

    const partner       = fromDoc(partnerDoc);
    const pickup        = fromDoc(pickupDoc);
    const currentPaid   = toNumber(pickup.amountPaid);
    const currentPending = pickupPendingAmount(pickup);
    const amount        = data.writeOff ? 0 : toNumber(data.amount);

    if (!data.writeOff && amount <= 0)               throw new AppError("Payment amount must be greater than zero", 422, "INVALID_PAYMENT_AMOUNT");
    if (!data.writeOff && amount > currentPending)   throw new AppError("Payment amount cannot exceed pending amount", 422, "PAYMENT_EXCEEDS_PENDING", { pending: currentPending });

    const newPaid       = data.writeOff ? currentPaid : currentPaid + amount;
    const paymentStatus = data.writeOff ? "Write Off" : derivePaymentStatus(pickup.totalValue, newPaid);
    const newPickup     = { ...pickup, amountPaid: newPaid, paymentStatus };
    const paymentRef    = paymentsCollection().doc();
    const payment       = {
      id: paymentRef.id,
      ...paymentPayload({
        pickup,
        partnerId,
        amount,
        data,
        actor,
        cumulative: newPaid,
        writeOffAmount: data.writeOff ? currentPending : 0
      })
    };

    writePayment(tx, paymentRef, payment, actor);
    tx.set(pickupRef, cleanUndefined({
      amountPaid:    newPaid,
      paymentStatus,
      paymentIds:    arrayUnion(payment.id),
      lastPayment:   paymentHistoryEntry(payment)
    }), { merge: true });
    tx.set(partnerRef, {
      amountReceived: increment(data.writeOff ? 0 : amount),
      pendingAmount:  increment(data.writeOff ? -currentPending : -amount),
      transactions:   updatePartnerTransactions(partner.transactions || [], newPickup, paymentStatus)
    }, { merge: true });

    return { payment: responsePayment(payment), pickup: newPickup };
  });
}

// ── Allocate a lump-sum payment across unpaid pickups ─────────────────────────
async function allocatePartnerPayment(partnerId, data, actor) {
  const amountToApply = toNumber(data.amount);
  if (amountToApply <= 0) throw new AppError("Payment amount must be greater than zero", 422, "INVALID_PAYMENT_AMOUNT");

  return db.runTransaction(async (tx) => {
    const partnerRef  = partnersCollection().doc(partnerId);
    const partnerDoc  = await tx.get(partnerRef);
    if (!partnerDoc.exists) throw new AppError("Pickup partner not found", 404, "PICKUP_PARTNER_NOT_FOUND");

    const unpaidQuery = pickupsCollection()
      .where("partnerId", "==", partnerId)
      .where("paymentStatus", "in", ["Not Paid", "Partially Paid"])
      .orderBy("date", "asc")
      .limit(PAYMENT_ALLOCATION_PICKUP_LIMIT);
    const unpaidSnapshot = await tx.get(unpaidQuery);
    const unpaidPickups  = fromSnapshot(unpaidSnapshot)
      .filter((p) => pickupPendingAmount(p) > 0)
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

    let remaining = amountToApply;
    const partner = fromDoc(partnerDoc);
    let transactions = partner.transactions || [];
    const payments = [];

    for (const pickup of unpaidPickups) {
      if (remaining <= 0) break;
      const applyAmount   = Math.min(remaining, pickupPendingAmount(pickup));
      remaining          -= applyAmount;
      const newPaid        = toNumber(pickup.amountPaid) + applyAmount;
      const paymentStatus  = derivePaymentStatus(pickup.totalValue, newPaid);
      const newPickup      = { ...pickup, amountPaid: newPaid, paymentStatus };
      const paymentRef     = paymentsCollection().doc();
      const payment        = { id: paymentRef.id, ...paymentPayload({ pickup, partnerId, amount: applyAmount, data, actor, cumulative: newPaid }) };

      payments.push(payment);
      transactions = updatePartnerTransactions(transactions, newPickup, paymentStatus);
      writePayment(tx, paymentRef, payment, actor);
      tx.set(pickupsCollection().doc(pickup.id), {
        amountPaid:  newPaid,
        paymentStatus,
        paymentIds:  arrayUnion(payment.id),
        lastPayment: paymentHistoryEntry(payment)
      }, { merge: true });
    }

    const applied = amountToApply - remaining;
    if (applied <= 0) throw new AppError("No pending pickups found for this partner", 422, "NO_PENDING_PICKUPS");

    tx.set(partnerRef, {
      amountReceived: increment(applied),
      pendingAmount:  increment(-applied),
      transactions
    }, { merge: true });

    return {
      applied,
      unapplied: remaining,
      payments:  payments.map(responsePayment)
    };
  });
}

// ── Entry point for recording a payment ──────────────────────────────────────
async function recordPartnerPayment(partnerId, data, actor) {
  return data.pickupId
    ? recordSinglePickupPayment(partnerId, data, actor)
    : allocatePartnerPayment(partnerId, data, actor);
}

// ── Clear all pending balance for one partner ─────────────────────────────────
async function clearPartnerBalance(partnerId, data, actor) {
  return db.runTransaction(async (tx) => {
    const partnerRef = partnersCollection().doc(partnerId);
    const partnerDoc = await tx.get(partnerRef);
    if (!partnerDoc.exists) throw new AppError("Pickup partner not found", 404, "PICKUP_PARTNER_NOT_FOUND");

    const unpaidQuery    = pickupsCollection()
      .where("partnerId", "==", partnerId)
      .where("paymentStatus", "in", ["Not Paid", "Partially Paid"])
      .orderBy("date", "asc")
      .limit(PAYMENT_ALLOCATION_PICKUP_LIMIT);
    const unpaidSnapshot = await tx.get(unpaidQuery);
    const pickups        = fromSnapshot(unpaidSnapshot).filter((p) => pickupPendingAmount(p) > 0);
    const partner        = fromDoc(partnerDoc);
    let transactions     = partner.transactions || [];
    let totalCleared     = 0;
    const payments       = [];

    for (const pickup of pickups) {
      const pending      = pickupPendingAmount(pickup);
      const amount       = data.writeOff ? 0 : pending;
      const newPaid      = data.writeOff ? toNumber(pickup.amountPaid) : toNumber(pickup.amountPaid) + pending;
      const paymentStatus = data.writeOff ? "Write Off" : "Paid";
      const newPickup    = { ...pickup, amountPaid: newPaid, paymentStatus };
      const paymentRef   = paymentsCollection().doc();
      const payment      = {
        id: paymentRef.id,
        ...paymentPayload({
          pickup,
          partnerId,
          amount,
          data,
          actor,
          cumulative: newPaid,
          writeOffAmount: data.writeOff ? pending : 0
        })
      };

      totalCleared += pending;
      payments.push(payment);
      transactions = updatePartnerTransactions(transactions, newPickup, paymentStatus);
      writePayment(tx, paymentRef, payment, actor);
      tx.set(pickupsCollection().doc(pickup.id), {
        amountPaid: newPaid, paymentStatus,
        paymentIds: arrayUnion(payment.id),
        lastPayment: paymentHistoryEntry(payment)
      }, { merge: true });
    }

    tx.set(partnerRef, {
      amountReceived: increment(data.writeOff ? 0 : totalCleared),
      pendingAmount:  increment(-totalCleared),
      transactions
    }, { merge: true });

    return {
      cleared:  totalCleared,
      writeOff: data.writeOff === true,
      payments: payments.map(responsePayment)
    };
  });
}

module.exports = {
  paymentsCollection,
  listPayments,
  getPickupPayments,
  getPartnerSummary,
  recordPartnerPayment,
  clearPartnerBalance
};
