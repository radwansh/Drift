import { z } from "zod";
import { CurrencyCode, Role } from "./common";

export const Company = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100),
  currencyCode: CurrencyCode,
  settings: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Company = z.infer<typeof Company>;

export const CreateCompany = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100),
  currencyCode: CurrencyCode,
});
export type CreateCompany = z.infer<typeof CreateCompany>;

export const UpdateCompany = z.object({
  name: z.string().min(1).max(200).optional(),
  currencyCode: CurrencyCode.optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateCompany = z.infer<typeof UpdateCompany>;

export const User = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: Role,
  clerkUserId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type User = z.infer<typeof User>;

export const InviteUser = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: Role.default("admin"),
});
export type InviteUser = z.infer<typeof InviteUser>;
