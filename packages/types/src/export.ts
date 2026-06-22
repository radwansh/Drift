import { z } from "zod";
import { ExportFormat, ExportStatus } from "./common";

export const ExportRequest = z.object({
  comparisonRunId: z.string().uuid(),
  format: ExportFormat,
  includeAllColumns: z.boolean().default(true),
  selectedColumns: z.array(z.string()).optional(),
  includeAiNarrative: z.boolean().default(true),
});
export type ExportRequest = z.infer<typeof ExportRequest>;

export const ExportHistory = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  comparisonRunId: z.string().uuid(),
  format: ExportFormat,
  status: ExportStatus,
  fileKey: z.string().nullable(),
  requestedById: z.string().uuid(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type ExportHistory = z.infer<typeof ExportHistory>;

export const SavedView = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  columnConfig: z.array(z.object({
    component: z.string(),
    visible: z.boolean(),
    mode: z.enum(["current", "previous", "side_by_side", "delta_only"]),
  })),
  createdAt: z.string().datetime(),
});
export type SavedView = z.infer<typeof SavedView>;
