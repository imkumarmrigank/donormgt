const {
  z,
  optionalString,
  dateString,
  amount,
  withDateRangeValidation
} = require("./common.validators");

const paymentBase = z.object({
  pickupId:   optionalString,
  amount,
  refMode:    z.string().default("cash"),
  refValue:   optionalString,
  notes:      optionalString,
  date:       dateString,
  screenshot: z.any().optional(),
  writeOff:   z.boolean().default(false)
}).passthrough();

const recordPaymentSchema = z.object({
  params: z.object({ partnerId: z.string().min(1) }),
  body:   paymentBase
});

const clearBalanceSchema = z.object({
  params: z.object({ partnerId: z.string().min(1) }),
  body:   z.object({
    refMode:    z.string().default("cash"),
    refValue:   optionalString,
    notes:      optionalString,
    date:       dateString,
    screenshot: z.any().optional(),
    writeOff:   z.boolean().default(false)
  }).passthrough()
});

const paymentListSchema = withDateRangeValidation(z.object({
  query: z.object({
    pickupId:  optionalString,
    partnerId: optionalString,
    dateFrom:  dateString,
    dateTo:    dateString,
    refMode:   optionalString,
    writeOff:  z.preprocess((value) => value === "true" ? true : value === "false" ? false : value, z.boolean().optional()),
    cursor:    optionalString,
    fields:    optionalString,
    pageSize:  z.coerce.number().int().min(1).max(500).optional(),
    limit:     z.coerce.number().int().min(1).max(500).optional()
  }).default({})
}));

// Query params accepted by GET /payments/partners/summary
const partnerSummarySchema = withDateRangeValidation(z.object({
  query: z.object({
    dateFrom:  dateString,
    dateTo:    dateString,
    partnerId: optionalString,
    search:    optionalString,
    status:    z.enum(["pending", "clear", "all"]).optional(),
    recordLimit: z.coerce.number().int().min(50).max(1000).optional()
  }).default({})
}));

module.exports = {
  recordPaymentSchema,
  clearBalanceSchema,
  paymentListSchema,
  partnerSummarySchema
};
