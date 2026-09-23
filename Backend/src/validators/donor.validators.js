const {
  z,
  optionalString,
  dateString,
  amount
} = require("./common.validators");

const donorBase = z.object({
  mobile: z.string().min(7).max(15),
  name: z.string().min(1),
  house: optionalString,
  houseNo: optionalString,
  society: optionalString,
  sector: optionalString,
  city: optionalString,
  societyId: optionalString,
  sectorId: optionalString,
  cityId: optionalString,
  status: z.string().default("Active"),
  lastPickup: dateString,
  nextPickup: dateString,
  totalRST: amount.optional(),
  totalSKS: amount.optional(),
  donorType: z.string().optional(),
  supportContribution: optionalString,
  lostReason: optionalString,
  postponeReason: optionalString,
  aadhaarDocument: z.any().optional()
}).passthrough();

const createDonorSchema = z.object({
  body: donorBase
});

const updateDonorSchema = z.object({
  params: z.object({
    id: z.string().min(1)
  }),
  body: donorBase.partial()
});

module.exports = {
  createDonorSchema,
  updateDonorSchema
};
