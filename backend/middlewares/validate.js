const { z } = require("zod");

const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = (err.errors || err.issues || []).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    next(err);
  }
};

const schemas = {
  register: z.object({
    name: z.string().min(1, "Le nom est requis"),
    email: z.string().email("Email invalide"),
    password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  }),

  login: z.object({
    email: z.string().email("Email invalide"),
    password: z.string().min(1, "Le mot de passe est requis"),
  }),

  forgotPassword: z.object({
    email: z.string().email("Email invalide"),
  }),

  resetPassword: z.object({
    password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  }),

  broadcast: z.object({
    type: z.enum(["text", "image", "poll"], { message: "Type de diffusion invalide" }),
    content: z.any(),
    targetGroups: z.array(z.string()).optional().default([]),
    toAllGroups: z.boolean().optional().default(false),
    toAllMembers: z.boolean().optional().default(false),
  }),

  forwardingRule: z.object({
    name: z.string().min(1, "Le nom de la règle est requis"),
    sourceGroupId: z.string().min(1, "Le groupe source est requis"),
    targetGroupIds: z.array(z.string()).optional().default([]),
    forwardToAllGroups: z.boolean().optional().default(false),
    forwardToMembers: z.boolean().optional().default(false),
    onlyAdmins: z.boolean().optional().default(false),
    masterGroup: z.boolean().optional().default(false),
    includeMedia: z.boolean().optional().default(true),
    targetGroupPattern: z.string().optional().default(""),
  }),

  message: z.object({
    jid: z.string().min(1, "Le destinataire est requis"),
    message: z.string().min(1, "Le message est requis"),
  }),

  settings: z.object({
    prefix: z.string().max(2).optional(),
    commandGroupName: z.string().optional(),
    autoRejectCalls: z.boolean().optional(),
    moderationEnabled: z.boolean().optional(),
    autoRestrictKeyword: z.string().optional(),
    welcomeMessage: z.string().optional(),
    masterGroupKeyword: z.string().optional(),
    forwardingKeyword: z.string().optional(),
    rateLimitMessagesPerMinute: z.number().int().min(1).max(300).optional(),
    rateLimitDelayBetween: z.number().int().min(100).max(10000).optional(),
    rateLimitDailyLimit: z.number().int().min(10).max(100000).optional(),
    autoReplies: z.array(z.object({
      keyword: z.string().optional().default(""),
      response: z.string().optional().default(""),
      exactMatch: z.boolean().optional().default(false),
      groupIds: z.array(z.string()).optional().default([]),
    })).optional(),
    telegramToken: z.string().optional(),
    telegramChatId: z.string().optional(),
    notifyOnDisconnect: z.boolean().optional(),
    notifyOnError: z.boolean().optional(),
    notifyOnNewUser: z.boolean().optional(),
    webhookUrl: z.string().url("URL de webhook invalide").or(z.literal("")).optional(),
    webhookApiKey: z.string().optional(),
  }),

  webhookSend: z.object({
    to: z.string().optional(),
    groupId: z.string().optional(),
    text: z.string().min(1, "Le texte est requis"),
    type: z.enum(["text", "image"]).optional().default("text"),
    caption: z.string().optional().default(""),
  }),
};

module.exports = { validate, schemas };
