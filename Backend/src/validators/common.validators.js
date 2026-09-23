const { z } = require("zod");
const { ROLE_VALUES } = require("../config/roles");

const isoDateValue = /^\d{4}-\d{2}-\d{2}$/;
const isoDateString = z.string().regex(isoDateValue, "Expected date format YYYY-MM-DD");

function withDateRangeValidation(schema, path = ["query"]) {
  return schema.superRefine((payload, ctx) => {
    const target = payload?.[path[0]] || {};
    const dateFrom = target.dateFrom;
    const dateTo = target.dateTo;
    if (!dateFrom || !dateTo) return;
    if (String(dateFrom) > String(dateTo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "dateFrom"],
        message: "dateFrom cannot be greater than dateTo"
      });
    }
  });
}

const idParam = z.object({
  params: z.object({
    id: z.string().min(1)
  })
});

const uidParam = z.object({
  params: z.object({
    uid: z.string().min(1)
  })
});

const listQuery = withDateRangeValidation(z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    status: z.string().optional(),
    city: z.string().optional(),
    sector: z.string().optional(),
    society: z.string().optional(),
    cityId: z.string().optional(),
    sectorId: z.string().optional(),
    societyId: z.string().optional(),
    donorId: z.string().optional(),
    partnerId: z.string().optional(),
    dateFrom: isoDateString.optional(),
    dateTo: isoDateString.optional(),
    cursor: z.string().optional(),
    pageSize: z.coerce.number().int().min(1).max(1000).optional(),
    fields: z.string().optional(),
    q: z.string().optional()
  }).passthrough().default({})
}));

const role = z.enum(ROLE_VALUES);

const optionalString = z.string().transform(val => (val && val.trim()) ? val.trim() : undefined).optional();
const dateString = isoDateString.optional().or(z.literal(""));
const stringArray = z.array(z.string()).default([]);
const amount = z.coerce.number().min(0).default(0);

module.exports = {
  z,
  idParam,
  uidParam,
  listQuery,
  role,
  optionalString,
  dateString,
  withDateRangeValidation,
  stringArray,
  amount
};
