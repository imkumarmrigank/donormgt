const {
  z,
  optionalString,
  dateString,
  stringArray,
  amount
} = require("./common.validators");

const pickupBase = z.object({
  orderId: optionalString,
  donorId: optionalString,
  donorName: optionalString,
  mobile: optionalString,
  house: optionalString,
  houseNo: optionalString,
  society: optionalString,
  sector: optionalString,
  city: optionalString,
  societyId: optionalString,
  sectorId: optionalString,
  cityId: optionalString,
  partnerId: optionalString,
  PickupPartner: optionalString,
  pickupPartnerName: optionalString,
  pickuppartneradiMobile: optionalString,
  pickupPartnerMobile: optionalString,
  date: dateString,
  timeSlot: optionalString,
  status: z.string().default("Pending"),
  type: z.string().optional(),
  pickupMode: z.string().default("Individual"),
  rstItems: stringArray.optional(),
  sksItems: stringArray.optional(),
  sksItemDetails: z.record(z.any()).optional(),
  rstItemWeights: z.record(z.any()).optional(),
  rstOthers: z.array(z.any()).optional(),
  totalKgs: amount.optional(),
  totalKg: amount.optional(),
  totalValue: amount.optional(),
  amountPaid: amount.optional(),
  paymentStatus: z.string().optional(),
  nextDate: dateString,
  notes: optionalString,
  postponeReason: optionalString,
  lostReason: optionalString
}).passthrough();

// Scheduling a pickup does NOT require a partner — partners are assigned
// later, either via Pickup Overview or at record time. The partner guard
// lives exclusively on recordPickupSchema / the service-layer record path.
const createPickupSchema = z.object({
  body: pickupBase
});

const updatePickupSchema = z.object({
  params: z.object({
    id: z.string().min(1)
  }),
  body: pickupBase.partial()
});

const recordPickupSchema = z.object({
  params: z.object({
    id: z.string().min(1)
  }),
  body: pickupBase.partial().extend({
    status: z.string().default("Completed")
  }).refine(
    (b) => !!(b.partnerId || b.PickupPartner || b.pickupPartnerName),
    {
      message: "Pickup Partner assignment is required before recording pickup.",
      path: ["partnerId"]
    }
  )
});

// ── Reschedule: only date, timeSlot, and notes may be changed ─────────────────
// Status is always reset to "Pending" by the service layer.
// Cannot reschedule a Completed pickup — guard lives in the service.
const reschedulePickupSchema = z.object({
  params: z.object({
    id: z.string().min(1)
  }),
  body: z.object({
    date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    timeSlot: optionalString,
    notes:    optionalString,
  })
});

module.exports = {
  createPickupSchema,
  updatePickupSchema,
  recordPickupSchema,
  reschedulePickupSchema,
};