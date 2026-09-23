const { z } = require("./common.validators");

const signedReadUrlSchema = z.object({
  body: z.object({
    storagePath: z.string().min(1)
  })
});

module.exports = {
  signedReadUrlSchema
};
