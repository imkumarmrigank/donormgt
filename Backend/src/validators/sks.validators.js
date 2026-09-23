const {
  z,
  optionalString,
  dateString
} = require("./common.validators");

const item = z.object({
  name: z.string().min(1),
  qty: z.coerce.number().min(0),
  unit: optionalString,
  notes: optionalString
}).passthrough();

const inflowBase = z.object({
  donorId: optionalString,
  donorName: optionalString,
  pickupId: optionalString,
  date: dateString,
  source: optionalString,
  items: z.array(item).min(1),
  notes: optionalString
}).passthrough();

const outflowBase = z.object({
  partnerName: z.string().min(1),
  partnerPhone: optionalString,
  date: dateString,
  items: z.array(item).min(1),
  payment: z.any().optional(),
  notes: optionalString
}).passthrough();

const createSksInflowSchema = z.object({ body: inflowBase });
const createSksOutflowSchema = z.object({ body: outflowBase });

const updateSksInflowSchema = z.object({
  body: inflowBase.partial().extend({
    items: z.array(item).min(1).optional()
  }).passthrough()
});

const updateSksOutflowSchema = z.object({
  body: outflowBase.partial().extend({
    items: z.array(item).min(1).optional()
  }).passthrough()
});

const paymentPatch = z.object({
  method: optionalString,
  amount: z.coerce.number().min(0).optional(),
  totalValue: z.coerce.number().min(0).optional(),
  reference: optionalString,
  notes: optionalString,
  screenshot: optionalString,
  status: optionalString,
}).passthrough();

const recordSksOutflowPaymentSchema = z.object({
  body: z.object({
    payment: paymentPatch
  }).passthrough()
});

module.exports = {
  createSksInflowSchema,
  createSksOutflowSchema,
  updateSksInflowSchema,
  updateSksOutflowSchema,
  recordSksOutflowPaymentSchema
};
