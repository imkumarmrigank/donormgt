function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function derivePaymentStatus(totalValue, amountPaid, explicitStatus) {
  if (explicitStatus === "Write Off") return "Write Off";

  const total = toNumber(totalValue);
  const paid = toNumber(amountPaid);
  if (total === 0) return paid > 0 ? "Paid" : "Not Paid";
  if (paid >= total) return "Paid";
  if (paid > 0) return "Partially Paid";
  return "Not Paid";
}

function deriveRaddiPaymentStatus(paymentStatus) {
  if (paymentStatus === "Paid") return "Received";
  if (paymentStatus === "Write Off") return "Write-off";
  return "Yet to Receive";
}

function deriveDonorStatus(lastPickup, explicitStatus) {
  if (explicitStatus === "Lost" || explicitStatus === "Postponed") return explicitStatus;
  if (!lastPickup) return "Active";

  const pickupDate = new Date(`${lastPickup}`.slice(0, 10));
  if (Number.isNaN(pickupDate.getTime())) return "Active";

  const days = Math.floor((Date.now() - pickupDate.getTime()) / 86400000);
  if (days <= 30) return "Active";
  if (days <= 45) return "Pickup Due";
  if (days <= 60) return "At Risk";
  return "Churned";
}

function inferPickupType(rstItems = [], sksItems = [], fallback = "RST") {
  const hasRst = Array.isArray(rstItems) && rstItems.length > 0;
  const hasSks = Array.isArray(sksItems) && sksItems.length > 0;
  if (hasRst && hasSks) return "RST+SKS";
  if (hasRst) return "RST";
  if (hasSks) return "SKS";
  return fallback;
}

function buildDonorSnapshot(donor = {}) {
  return {
    donorId: donor.id || donor.donorId,
    donorName: donor.name || donor.donorName || "",
    mobile: donor.mobile || "",
    house: donor.house || "",
    houseNo: donor.houseNo || donor.house || "",
    society: donor.society || "",
    societyId: donor.societyId || "",
    sector: donor.sector || "",
    sectorId: donor.sectorId || "",
    city: donor.city || "",
    cityId: donor.cityId || ""
  };
}

function buildPartnerSnapshot(partner = {}) {
  return {
    partnerId: partner.id || partner.partnerId,
    PickupPartner: partner.name || partner.PickupPartner || partner.pickupPartnerName || "",
    pickupPartnerName: partner.name || partner.PickupPartner || partner.pickupPartnerName || "",
    pickuppartneradiMobile: partner.mobile || partner.pickuppartneradiMobile || partner.pickupPartnerMobile || "",
    pickupPartnerMobile: partner.mobile || partner.pickuppartneradiMobile || partner.pickupPartnerMobile || "",
    pickupPartnerEmail: partner.email || ""
  };
}

function buildRaddiRecordFromPickup(pickup, donor = {}, partner = {}) {
  const paymentStatus = derivePaymentStatus(pickup.totalValue, pickup.amountPaid, pickup.paymentStatus);
  const rawWeights = pickup.rstItemWeights || {};
  const itemKgMap = Object.entries(rawWeights).reduce((acc, [item, weight]) => {
    const value = typeof weight === "object" ? weight.value : weight;
    const unit = typeof weight === "object" ? weight.unit : "kg";
    const kg = unit === "gm" ? toNumber(value) / 1000 : toNumber(value);
    acc[item] = kg;
    return acc;
  }, {});

  const partnerRateChart = pickup.pickuppartnerRateChart || partner.rateChart || {};
  const itemEstimatedMap = Object.entries(itemKgMap).reduce((acc, [item, kg]) => {
    const rate = toNumber(partnerRateChart[item], 0);
    acc[item] = rate > 0 && kg > 0 ? Math.round(kg * rate) : 0;
    return acc;
  }, {});

  return {
    orderId: pickup.orderId || pickup.id,
    pickupId: pickup.id,
    mobile: donor.mobile || pickup.mobile || "",
    name: donor.name || pickup.donorName || "",
    houseNo: donor.house || pickup.houseNo || "",
    society: donor.society || pickup.society || "",
    societyId: donor.societyId || pickup.societyId || "",
    sector: donor.sector || pickup.sector || "",
    sectorId: donor.sectorId || pickup.sectorId || "",
    city: donor.city || pickup.city || "",
    cityId: donor.cityId || pickup.cityId || "",
    pickupDate: pickup.date || "",
    orderDate: pickup.createdAt || "",
    PickupPartnerName: partner.name || pickup.PickupPartner || pickup.pickupPartnerName || "",
    PickupPartnerPhone: partner.mobile || pickup.pickuppartneradiMobile || pickup.pickupPartnerMobile || "",
    donorStatus: deriveDonorStatus(pickup.date),
    rstItems: pickup.rstItems || [],
    sksItems: pickup.sksItems || [],
    itemKgMap,
    rstOthers: pickup.rstOthers || [],
    pickuppartnerRateChart: partnerRateChart,
    itemEstimatedMap: pickup.itemEstimatedMap || itemEstimatedMap,
    totalKg: toNumber(pickup.totalKg ?? pickup.totalKgs),
    totalAmount: toNumber(pickup.totalValue),
    amountPaid: toNumber(pickup.amountPaid),
    paymentStatus: deriveRaddiPaymentStatus(paymentStatus),
    orderStatus: pickup.status || "Completed",
    type: pickup.type || inferPickupType(pickup.rstItems, pickup.sksItems)
  };
}

module.exports = {
  toNumber,
  derivePaymentStatus,
  deriveRaddiPaymentStatus,
  deriveDonorStatus,
  inferPickupType,
  buildDonorSnapshot,
  buildPartnerSnapshot,
  buildRaddiRecordFromPickup
};
