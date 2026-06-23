import { z } from "zod";

export const ComponentValueSchema = z.union([z.number(), z.null()]);
export const ComponentsSchema = z.record(z.string(), ComponentValueSchema);

export const EmployeeRecordSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  department: z.string().nullable(),
  components: ComponentsSchema,
  grossSalary: z.number(),
  netSalary: z.number(),
});

export const EmployeeRecordsSchema = z.array(EmployeeRecordSchema);

export function validateEmployeeRecords(records: unknown, label = "records") {
  const res = EmployeeRecordsSchema.safeParse(records);
  if (!res.success) {
    // throw an Error with readable Zod issues
    throw new Error(`Validation failed for ${label}: ${res.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return res.data;
}
