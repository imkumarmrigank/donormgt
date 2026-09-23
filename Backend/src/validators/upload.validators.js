const { z, optionalString } = require("./common.validators");

const signedUploadUrlSchema = z.object({
  body: z.object({
    fileName: z.string().min(1),
    contentType: z.string().min(1),
    purpose: z.enum(["aadhaar", "payment-proof", "sks-proof", "general"]).default("general"),
    entityId: optionalString
  })
});

const signedReadUrlSchema = z.object({
  body: z.object({
    storagePath: z.string().min(1)
  })
});

module.exports = {
  signedUploadUrlSchema,
  signedReadUrlSchema
};
