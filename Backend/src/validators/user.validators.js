const { z, role, optionalString } = require("./common.validators");

const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6).optional(),
    name: z.string().min(1),
    role: role.default("executive"),
    phone: optionalString,
    active: z.boolean().default(true),
    firebaseUid: optionalString
  })
});

const updateUserSchema = z.object({
  params: z.object({
    id: z.string().min(1)
  }),
  body: z.object({
    name: optionalString,
    role: role.optional(),
    phone: optionalString,
    active: z.boolean().optional(),
    aadhaarDocument: z.any().optional()
  }).passthrough()
});

module.exports = {
  createUserSchema,
  updateUserSchema
};
