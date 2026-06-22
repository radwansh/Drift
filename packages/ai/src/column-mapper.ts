import type { AiColumnSuggestion } from "@saas/types";
import { callClaude, isAiAvailable } from "./client";
import { COLUMN_MAPPER_SYSTEM_PROMPT } from "./column-mapper/prompts";

interface ClaudeMapperResponse {
  mappings: Array<{ header: string; component: string }>;
  identifiers: {
    employeeId: string | null;
    employeeName: string | null;
    department: string | null;
    grossSalary: string | null;
    netSalary: string | null;
  };
}

const RULE_MAP: Record<string, string> = {
  id: "employee_id",
  emp_id: "employee_id",
  employee_id: "employee_id",
  employeeid: "employee_id",
  empid: "employee_id",
  code: "employee_id",
  personnel_no: "employee_id",
  personnelno: "employee_id",
  name: "employee_name",
  employee_name: "employee_name",
  employeename: "employee_name",
  full_name: "employee_name",
  fullname: "employee_name",
  dept: "department",
  department: "department",
  dept_name: "department",
  departmentname: "department",
  cost_center: "department",
  costcenter: "department",
  gross: "gross_salary",
  gross_salary: "gross_salary",
  grosssalary: "gross_salary",
  gross_pay: "gross_salary",
  grosspay: "gross_salary",
  net: "net_salary",
  net_salary: "net_salary",
  netsalary: "net_salary",
  net_pay: "net_salary",
  netpay: "net_salary",
  paid: "net_salary",
  base: "base_salary",
  basic: "base_salary",
  base_salary: "base_salary",
  basesalary: "base_salary",
  basic_salary: "base_salary",
  basicsalary: "base_salary",
  bonus: "bonus",
  commission: "bonus",
  incentive: "bonus",
  incentives: "bonus",
  tax: "tax_deduction",
  income_tax: "tax_deduction",
  incometax: "tax_deduction",
  tax_deduction: "tax_deduction",
  taxdeduction: "tax_deduction",
  allowance: "other_allowance",
  housing: "housing_allowance",
  housing_allowance: "housing_allowance",
  housingallowance: "housing_allowance",
  rent: "housing_allowance",
  transport: "transport_allowance",
  transport_allowance: "transport_allowance",
  transportallowance: "transport_allowance",
  travel: "transport_allowance",
  travel_allowance: "transport_allowance",
  travelallowance: "transport_allowance",
  deduction: "other_deduction",
  insurance: "insurance_deduction",
  insurance_deduction: "insurance_deduction",
  insurancededuction: "insurance_deduction",
  medical: "insurance_deduction",
  health: "insurance_deduction",
  pension: "pension_deduction",
  pension_deduction: "pension_deduction",
  pensiondeduction: "pension_deduction",
  social_security: "pension_deduction",
  socialsecurity: "pension_deduction",
  provident_fund: "pension_deduction",
  pf: "pension_deduction",
};

const ROLE_KEYS: Record<string, (keyof typeof RULE_MAP)[]> = {
  employee_id: ["id", "emp_id", "employee_id", "employeeid", "empid", "code", "personnel_no", "personnelno"],
  employee_name: ["name", "employee_name", "employeename", "full_name", "fullname"],
  department: ["dept", "department", "dept_name", "departmentname", "cost_center", "costcenter"],
  gross_salary: ["gross", "gross_salary", "grosssalary", "gross_pay", "grosspay"],
  net_salary: ["net", "net_salary", "netsalary", "net_pay", "netpay", "paid"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function ruleBasedMapping(headers: string[]): AiColumnSuggestion {
  return headers.map((header) => {
    const normalized = normalizeHeader(header);
    const suggestedComponent = RULE_MAP[normalized] ?? "other_allowance";
    const isKnown = normalized in RULE_MAP;
    const confidence = isKnown ? 0.85 : 0.3;
    const reasoning = isKnown
      ? `Header "${header}" matches known pattern "${normalized}" -> ${suggestedComponent}`
      : `Header "${header}" did not match any known pattern, defaulting to other_allowance`;

    const isEmployeeId = ROLE_KEYS.employee_id.includes(normalized as any);
    const isEmployeeName = ROLE_KEYS.employee_name.includes(normalized as any);
    const isDepartment = ROLE_KEYS.department.includes(normalized as any);
    const isGrossSalary = ROLE_KEYS.gross_salary.includes(normalized as any);
    const isNetSalary = ROLE_KEYS.net_salary.includes(normalized as any);

    return {
      sourceColumn: header,
      suggestedComponent,
      confidence,
      reasoning,
      isEmployeeId,
      isEmployeeName,
      isDepartment,
      isGrossSalary,
      isNetSalary,
    };
  });
}

export async function suggestColumnMappings(
  headers: string[],
): Promise<AiColumnSuggestion> {
  const ruleBased = ruleBasedMapping(headers);

  if (!isAiAvailable) {
    return ruleBased;
  }

  const userMessage = JSON.stringify({ headers });
  const claudeRaw = await callClaude(COLUMN_MAPPER_SYSTEM_PROMPT, userMessage);

  if (!claudeRaw) {
    return ruleBased;
  }

  try {
    const parsed: ClaudeMapperResponse = JSON.parse(
      claudeRaw.replace(/```json|```/g, "").trim(),
    );

    const enhanced = headers.map((header) => {
      const rule = ruleBased.find((r) => r.sourceColumn === header);
      const claudeMapping = parsed.mappings.find((m) => m.header === header);

      if (!claudeMapping) {
        return rule!;
      }

      const suggestedComponent = claudeMapping.component;
      const identifiers = parsed.identifiers;
      const isEmployeeId = identifiers.employeeId === header;
      const isEmployeeName = identifiers.employeeName === header;
      const isDepartment = identifiers.department === header;
      const isGrossSalary = identifiers.grossSalary === header;
      const isNetSalary = identifiers.netSalary === header;

      const componentMatches = rule?.suggestedComponent === suggestedComponent;
      const confidence = componentMatches
        ? Math.min(1, (rule?.confidence ?? 0) + 0.1)
        : 0.7;

      return {
        sourceColumn: header,
        suggestedComponent,
        confidence,
        reasoning: `AI mapping: "${header}" -> ${suggestedComponent}`,
        isEmployeeId,
        isEmployeeName,
        isDepartment,
        isGrossSalary,
        isNetSalary,
      };
    });

    return enhanced;
  } catch {
    return ruleBased;
  }
}
