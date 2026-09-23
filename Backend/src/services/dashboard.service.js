const { listDonors } = require("./donor.service");
const { listPickups } = require("./pickup.service");
const { listInflows, listOutflows, getStock } = require("./sks.service");
const { buildRaddiRecordFromPickup } = require("../utils/businessRules");
const { listDailyAggregates, sumAggregates } = require("./aggregate.service");

// ── Helpers ───────────────────────────────────────────────────────────────────
function monthKey(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", { month: "short" });
}

function monthSortKey(dateValue) {
  if (!dateValue) return null;
  const str = String(dateValue).slice(0, 7);
  return str.length >= 7 ? str : null;
}

function buildMonthlyRSTChart(completedPickups) {
  const map = {};
  completedPickups.forEach((pickup) => {
    const key = monthSortKey(pickup.date);
    if (!key) return;
    const label = monthKey(pickup.date);
    if (!map[key]) map[key] = { month: label, value: 0, pickups: 0 };
    map[key].value   += Number(pickup.totalValue) || 0;
    map[key].pickups += 1;
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
    .slice(-7);
}

function buildMonthlySKSChart(completedPickups, sksInflows = []) {
  const map = {};

  // Count SKS items from completed pickups (each sksItems entry = 1 item donated)
  completedPickups
    .filter((p) => (p.sksItems || []).length > 0)
    .forEach((pickup) => {
      const key = monthSortKey(pickup.date);
      if (!key) return;
      const label = monthKey(pickup.date);
      if (!map[key]) map[key] = { month: label, items: 0, pickups: 0 };
      map[key].items   += (pickup.sksItems || []).length;
      map[key].pickups += 1;
    });

  // Count SKS items from inflow records (use actual item quantities)
  sksInflows.forEach((inflow) => {
    const key = monthSortKey(inflow.date);
    if (!key) return;
    const label = monthKey(inflow.date);
    if (!map[key]) map[key] = { month: label, items: 0, pickups: 0 };
    const inflowQty = (inflow.items || []).reduce((s, it) => s + (Number(it?.qty) || 0), 0);
    map[key].items += inflowQty;
    // Inflows count as separate entries, not pickups — pickups counter unchanged
  });

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
    .slice(-7);
}

function sumSKSItemsFromPickups(pickups = [], sksInflows = []) {
  const pickupTotal  = pickups.reduce((sum, pickup) => sum + ((pickup.sksItems || []).length), 0);
  const inflowTotal  = sksInflows.reduce(
    (sum, inflow) => sum + (inflow.items || []).reduce((s, it) => s + (Number(it?.qty) || 0), 0),
    0
  );
  return pickupTotal + inflowTotal;
}

function buildMonthlyChartFromAggregates(rows = [], valueField, outputField) {
  const map = {};
  rows.forEach((row) => {
    const key = monthSortKey(row.date || row.id);
    if (!key) return;
    const label = monthKey(row.date || row.id);
    if (!map[key]) map[key] = { month: label, [outputField]: 0, pickups: 0 };
    map[key][outputField] += Number(row[valueField]) || 0;
    map[key].pickups += Number(row.totalPickupsCompleted) || 0;
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
    .slice(-7);
}

function buildRSTBreakdown(raddiRecords, completedPickups) {
  const map = {};
  raddiRecords.forEach((r) => {
    const itemKgMap = r.itemKgMap || {};
    Object.entries(itemKgMap).forEach(([item, kg]) => {
      if (kg > 0) map[item] = (map[item] || 0) + kg;
    });
    (r.rstOthers || []).forEach((o) => {
      if (o.name && o.amount > 0) map["Others"] = (map["Others"] || 0) + (parseFloat(o.weight) || 0);
    });
  });
  if (Object.keys(map).length === 0) {
    completedPickups.forEach((p) => {
      (p.rstItems || []).forEach((item) => { map[item] = (map[item] || 0) + 1; });
    });
  }
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({
      name,
      value: parseFloat(value.toFixed(2)),
      pct:   total > 0 ? parseFloat(((value / total) * 100).toFixed(1)) : 0
    }));
}

function buildSKSBreakdown(completedPickups, sksInflows = []) {
  const map = {};

  // Aggregate from completed pickup sksItems (each entry = 1 item)
  completedPickups.forEach((p) => {
    (p.sksItems || []).forEach((item) => {
      const key = item.startsWith("Others") ? "Others" : item;
      map[key] = (map[key] || 0) + 1;
    });
  });

  // Aggregate from SKS inflow records (use item quantities for accurate totals)
  sksInflows.forEach((inflow) => {
    (inflow.items || []).forEach((it) => {
      if (!it || !it.name) return;
      const key = String(it.name).startsWith("Others") ? "Others" : it.name;
      map[key] = (map[key] || 0) + (Number(it.qty) || 0);
    });
  });

  const total = Object.values(map).reduce((s, v) => s + v, 0);
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({
      name,
      value,
      pct: total > 0 ? parseFloat(((value / total) * 100).toFixed(1)) : 0
    }));
}

function buildRSTFinancialSummary(raddiRecords) {
  const totalRevenue  = raddiRecords.reduce((sum, record) => sum + (Number(record.totalAmount) || 0), 0);
  const totalReceived = raddiRecords.reduce((sum, record) => {
    const total = Number(record.totalAmount) || 0;
    const paid = Number(record.amountPaid) || 0;
    return sum + Math.min(total, paid);
  }, 0);
  const totalPending  = raddiRecords.reduce((sum, record) => {
    const total = Number(record.totalAmount) || 0;
    const paid = Number(record.amountPaid) || 0;
    return sum + Math.max(0, total - Math.min(total, paid));
  }, 0);

  const partnerMap = {};
  raddiRecords.forEach((record) => {
    const partnerName = record.PickupPartnerName || "Unassigned";
    if (!partnerMap[partnerName]) partnerMap[partnerName] = { name: partnerName, total: 0, received: 0, pending: 0 };
    const total = Number(record.totalAmount) || 0;
    const paid = Number(record.amountPaid) || 0;
    const received = Math.min(total, paid);
    const pending = Math.max(0, total - received);
    partnerMap[partnerName].total += total;
    partnerMap[partnerName].received += received;
    partnerMap[partnerName].pending += pending;
  });
  const partnerBreakdown = Object.values(partnerMap).sort((a, b) => b.pending - a.pending);

  return {
    totalRevenue,
    totalReceived,
    totalPending,
    collectionPct: totalRevenue > 0 ? Math.round((totalReceived / totalRevenue) * 100) : 0,
    partnerBreakdown
  };
}

function buildSKSDispatchSummary(sksOutflows) {
  const totalDispatched = sksOutflows.reduce((s, r) => s + (r.items || []).reduce((a, it) => a + (it.qty || 0), 0), 0);
  const totalReceived   = sksOutflows.reduce((s, r) => s + (Number(r.payment?.amount) || 0), 0);
  const totalValue      = sksOutflows.reduce((s, r) => s + (Number(r.payment?.totalValue) || 0), 0);
  const paidCount       = sksOutflows.filter((r) => r.payment?.status === "Paid").length;

  const recipientMap = {};
  sksOutflows.forEach((r) => {
    const n = r.partnerName || "Unknown";
    if (!recipientMap[n]) recipientMap[n] = { name: n, items: 0, received: 0 };
    recipientMap[n].items    += (r.items || []).reduce((a, it) => a + (it.qty || 0), 0);
    recipientMap[n].received += Number(r.payment?.amount) || 0;
  });

  return {
    totalDispatched,
    totalReceived,
    totalValue,
    paidCount,
    dispatches: sksOutflows.length,
    collectionPct: totalValue > 0 ? Math.round((totalReceived / totalValue) * 100) : 0,
    recipientBreakdown: Object.values(recipientMap).sort((a, b) => b.items - a.items).slice(0, 5)
  };
}

async function getStats(filters = {}) {
  const { dateFrom, dateTo, city, sector, partnerId } = filters;
  const canUseDailyAggregates = !(city || sector || partnerId);
  const aggregateRows = canUseDailyAggregates
    ? await listDailyAggregates({ dateFrom, dateTo, limit: 370 })
    : [];
  const aggregateTotals = sumAggregates(aggregateRows);
  const hasAggregates = aggregateRows.length > 0 && Object.keys(aggregateTotals).length > 0;

  const pickupFilters = {
    limit:     2000,
    dateFrom:  dateFrom  || undefined,
    dateTo:    dateTo    || undefined,
    city:      city      || undefined,
    sector:    sector    || undefined,
    partnerId: partnerId || undefined,
  };

  const sksFilters = {
    limit:    2000,
    dateFrom: dateFrom || undefined,
    dateTo:   dateTo   || undefined,
  };

  const donorFilters = {
    limit:  2000,
    city:   city   || undefined,
    sector: sector || undefined,
  };

  const safe = (p) => (p.status === "fulfilled" ? p.value : null);

  const results = await Promise.allSettled([
    listDonors(donorFilters),                    // 0
    listPickups(pickupFilters),                   // 1
    listInflows(sksFilters),                      // 2
    listOutflows(sksFilters),                     // 3
    getStock(),                                   // 4
  ]);

  const donors      = safe(results[0]) || [];
  const pickups     = safe(results[1]) || [];
  const sksInflows  = safe(results[2]) || [];
  const sksOutflows = safe(results[3]) || [];
  const stock       = safe(results[4]) || [];

  const completedPickups  = pickups.filter((p) => p.status === "Completed");
  const raddiRecords      = completedPickups.map((pickup) =>
    buildRaddiRecordFromPickup(
      pickup,
      pickup.donorSnapshot || pickup,
      pickup.pickupPartnerSnapshot || pickup
    )
  );
  const pendingPayments   = pickups.filter((p) => ["Not Paid", "Partially Paid"].includes(p.paymentStatus));
  const upcomingPickups   = pickups.filter((p) => p.status === "Pending");
  const now               = new Date();
  const overduePickups    = donors.filter(
    (d) => d.nextPickup && new Date(d.nextPickup) < now && d.status === "Active"
  );

  const rstBreakdown         = buildRSTBreakdown(raddiRecords, completedPickups);
  const sksBreakdown         = buildSKSBreakdown(completedPickups, sksInflows);
  const rstFinancialSummary  = buildRSTFinancialSummary(raddiRecords);
  const sksDispatchSummary   = buildSKSDispatchSummary(sksOutflows);
  const monthlyRSTChart      = buildMonthlyRSTChart(completedPickups);
  const monthlySKSChart      = buildMonthlySKSChart(completedPickups, sksInflows);
  const filteredAmountReceived = raddiRecords.reduce((sum, record) => {
    const total = Number(record.totalAmount) || 0;
    const paid = Number(record.amountPaid) || 0;
    return sum + Math.min(total, paid);
  }, 0);
  const filteredPendingFromPartners = raddiRecords.reduce((sum, record) => {
    const total = Number(record.totalAmount) || 0;
    const paid = Number(record.amountPaid) || 0;
    return sum + Math.max(0, total - Math.min(total, paid));
  }, 0);

  const stats = {
    totalDonors:              donors.length,
    activeDonors:             donors.filter((d) => d.status === "Active").length,
    postponedDonors:          donors.filter((d) => d.status === "Postponed").length,
    lostDonors:               donors.filter((d) => d.status === "Lost").length,
    pickupDueDonors:          donors.filter((d) => d.status === "Pickup Due").length,
    atRiskDonors:             donors.filter((d) => d.status === "At Risk").length,
    churnedDonors:            donors.filter((d) => d.status === "Churned").length,
    totalPickupsCompleted:    completedPickups.length,
    totalPickupsThisMonth:    completedPickups.length,
    totalRSTValue:            raddiRecords.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0),
    pendingPayments:          pendingPayments.length,
    upcomingPickups:          upcomingPickups.length,
    overduePickups:           overduePickups.length,
    drivePickups:             pickups.filter((p) => p.pickupMode === "Drive").length,
    individualPickups:        pickups.filter((p) => p.pickupMode === "Individual").length,
    totalRaddiKg:             raddiRecords.reduce((sum, r) => sum + (Number(r.totalKg) || 0), 0),
    totalRevenue:             raddiRecords.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0),
    amountReceived:           filteredAmountReceived,
    pendingFromPickupPartners: filteredPendingFromPartners,
    sksInflowCount:           sksInflows.length,
    sksOutflowCount:          sksOutflows.length,
    sksStockItems:            stock.length,
    totalSKSItems:            sumSKSItemsFromPickups(completedPickups, sksInflows),
    totalSKSPickups:          completedPickups.filter((p) => (p.sksItems || []).length > 0).length,
  };

  return {
    stats,
    monthlyRSTChart,
    monthlySKSChart,
    rstBreakdown,
    sksBreakdown,
    rstFinancialSummary,
    sksDispatchSummary,
    // Legacy aliases
    monthlyData:   monthlyRSTChart,
    itemBreakdown: rstBreakdown,
    stock,
    appliedFilters: { dateFrom, dateTo, city, sector, partnerId },
    aggregation: { dailyAggregatesUsed: hasAggregates, rows: aggregateRows.length },
  };
}

async function getSchedulerSummary() {
  const [donors, pickups] = await Promise.all([
    listDonors({ limit: 500 }),
    listPickups({ limit: 500 })
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const now   = new Date();

  const overdue   = [];
  const scheduled = [];
  const atRisk    = [];
  const churned   = [];

  pickups.forEach((pickup) => {
    if (pickup.status !== "Pending") return;
    const entry = {
      id:            pickup.id,
      orderId:       pickup.orderId || pickup.id,
      donorId:       pickup.donorId,
      donorName:     pickup.donorName || "",
      mobile:        pickup.mobile || "",
      society:       pickup.society || "",
      sector:        pickup.sector || "",
      city:          pickup.city || "",
      scheduledDate: pickup.date || "",
      timeSlot:      pickup.timeSlot || "",
      notes:         pickup.notes || "",
      pickupMode:    pickup.pickupMode || "Individual"
    };

    if (pickup.date && pickup.date < today) {
      overdue.push({
        ...entry,
        daysOverdue: Math.floor((now - new Date(`${pickup.date}T00:00:00`)) / 86400000)
      });
    } else {
      scheduled.push(entry);
    }
  });

  donors.forEach((donor) => {
    if (donor.status === "Lost" || !donor.lastPickup) return;
    if (pickups.some((p) => p.donorId === donor.id && p.status === "Pending")) return;

    const days = Math.floor((now - new Date(donor.lastPickup)) / 86400000);
    const base = {
      id:         `TAB-${donor.id}`,
      donorId:    donor.id,
      donorName:  donor.name,
      mobile:     donor.mobile || "",
      society:    donor.society || "",
      sector:     donor.sector || "",
      city:       donor.city || "",
      lastPickup: donor.lastPickup
    };

    if (days > 60)      churned.push({ ...base, daysSincePickup: days, reason: donor.lostReason || "Inactive > 60 days" });
    else if (days > 30) atRisk.push({ ...base, daysSincePickup: days, missedCount: Math.floor(days / 30) });
  });

  return { overdue, scheduled, atRisk, churned };
}

module.exports = {
  getStats,
  getSchedulerSummary
};
