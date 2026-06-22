import { z } from "zod";

export const AiNarrative = z.object({
  summary: z.string(),
  highlights: z.array(z.string()),
  concerns: z.array(z.string()),
  severity: z.enum(["routine", "review", "critical"]),
});
export type AiNarrative = z.infer<typeof AiNarrative>;

export const AiColumnSuggestion = z.array(z.object({
  sourceColumn: z.string(),
  suggestedComponent: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  isEmployeeId: z.boolean().default(false),
  isEmployeeName: z.boolean().default(false),
  isDepartment: z.boolean().default(false),
  isGrossSalary: z.boolean().default(false),
  isNetSalary: z.boolean().default(false),
}));
export type AiColumnSuggestion = z.infer<typeof AiColumnSuggestion>;

export const AiQuery = z.object({
  question: z.string().min(1).max(500),
  comparisonRunId: z.string().uuid(),
});
export type AiQuery = z.infer<typeof AiQuery>;

export const AiQueryResponse = z.object({
  answer: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  relatedEmployees: z.array(z.string()).optional(),
});
export type AiQueryResponse = z.infer<typeof AiQueryResponse>;
