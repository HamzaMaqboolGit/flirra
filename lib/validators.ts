import { z } from "zod";
import { isAdult } from "./billing-math";
import { isCountry } from "./countries";

export const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72, "Password must be 72 characters or fewer").regex(/[A-Za-z]/, "Password must include a letter").regex(/[0-9]/, "Password must include a number");

export const registerSchema = z.object({
  email: z.string().trim().email().max(160),
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(40),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  role: z.enum(["MALE", "FEMALE"]),
  accountType: z.enum(["USER", "CREATOR"]).default("USER"),
  country: z.string().refine(isCountry, "Choose a country"),
  acceptedTerms: z.literal(true).optional(),
  confirmedAdult: z.literal(true),
  next: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  const dob = new Date(`${value.dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== value.dateOfBirth || !isAdult(dob)) {
    ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "You must be 18 or older" });
  }
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(72),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  username: z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_]+$/).optional(),
  country: z.string().refine(isCountry, "Choose a country"),
  city: z.string().trim().max(80).default(""),
  bio: z.string().max(500),
  interests: z.array(z.string().trim().min(1).max(24)).max(12),
  discoverable: z.boolean().default(true),
  role: z.enum(["MALE", "FEMALE"]).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).superRefine((value, ctx) => {
  if (!value.dateOfBirth) return;
  const date = new Date(`${value.dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.dateOfBirth || !isAdult(date)) {
    ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Enter a valid date. You must be 18 or older." });
  }
});

export const queueSchema = z.object({
  mode: z.enum(["queue", "direct"]),
  country: z.string().optional(),
  recipientId: z.string().optional(),
});

export const withdrawalSchema = z.object({
  amountCredits: z.number().int().positive(),
});

export const payoutSchema = z.object({
  legalName: z.string().trim().min(2).max(80),
  country: z.string().refine(isCountry, "Choose a country"),
  method: z.enum(["MANUAL", "STRIPE_CONNECT"]),
  accountHint: z.string().trim().max(120).default(""),
  bankName: z.string().trim().max(100).default(""),
  accountNumber: z.string().trim().max(34).default(""),
  routingNumber: z.string().trim().max(20).default(""),
  iban: z.string().trim().max(34).default(""),
  swiftCode: z.string().trim().max(20).default(""),
}).superRefine((value, ctx) => {
  if (value.method === "MANUAL" && value.bankName.length < 2) ctx.addIssue({ code: "custom", path: ["bankName"], message: "Enter your bank name" });
  if (value.method === "MANUAL" && !value.accountNumber && !value.iban) ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "Enter an account number or IBAN" });
});

export const reportSchema = z.object({
  reportedId: z.string().min(1),
  callId: z.string().optional(),
  conversationId: z.string().optional(),
  reason: z.enum(["ABUSIVE_LANGUAGE","HARASSMENT","HATE_SPEECH","THREATS","SEXUAL_HARASSMENT","INAPPROPRIATE_VIDEO","SPAM_SCAM","FAKE_PROFILE","UNDERAGE","OTHER"]),
  details: z.string().max(500).optional(),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  topic: z.string().trim().min(2).max(80),
  message: z.string().trim().min(10).max(2000),
});

export function zodError(error: z.ZodError) {
  return error.issues[0]?.message || "Check the form and try again";
}
