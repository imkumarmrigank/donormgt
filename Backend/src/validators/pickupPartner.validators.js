const {
  z,
  optionalString,
  amount
} = require("./common.validators");

function parseJsonField(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

const formStringArray = z.preprocess((value) => {
  const parsed = parseJsonField(value);
  if (parsed === undefined) return [];
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "string") {
    return parsed.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return parsed;
}, z.array(z.string()).default([]));

const formObject = z.preprocess((value) => {
  const parsed = parseJsonField(value);
  return parsed === undefined ? undefined : parsed;
}, z.record(z.coerce.number()).optional());

const formArray = z.preprocess((value) => {
  const parsed = parseJsonField(value);
  return parsed === undefined ? undefined : parsed;
}, z.array(z.any()).optional());

const formBoolean = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean().optional());

const nullableString = z.preprocess((value) => {
  if (value === "" || value === "null") return null;
  return value;
}, z.string().nullable().optional());

const partnerBase = z.object({
  name: z.string().min(1),
  mobile: z.string().min(7).max(15),
  email: z.string().email().optional().or(z.literal("")),
  sectors: formStringArray.optional(),
  societies: formStringArray.optional(),
  area: optionalString,
  city: optionalString,
  cityId: optionalString,
  sectorId: optionalString,
  societyId: optionalString,
  rating: z.coerce.number().min(0).max(5).optional(),
  totalPickups: amount.optional(),
  totalValue: amount.optional(),
  amountReceived: amount.optional(),
  pendingAmount: amount.optional(),
  rateChart: formObject,
  transactions: formArray,
  photo: nullableString,
  photoUrl: nullableString,
  photoPath: nullableString,
  aadhaarDoc: nullableString,
  aadhaarDocument: nullableString,
  aadhaarUrl: nullableString,
  aadhaarPath: nullableString,
  active: formBoolean,
  isActive: formBoolean
}).passthrough();

const createPickupPartnerSchema = z.object({
  body: partnerBase
});

const updatePickupPartnerSchema = z.object({
  params: z.object({
    id: z.string().min(1)
  }),
  body: partnerBase.partial()
});

module.exports = {
  createPickupPartnerSchema,
  updatePickupPartnerSchema
};
