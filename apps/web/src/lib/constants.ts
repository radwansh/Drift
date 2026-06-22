export const APP_NAME = "Drift";
export const APP_TAGLINE = "Payroll variance analysis, simplified";
export const COMPANY_EMPLOYEE_RANGES = [
  { label: "1-50 employees", value: "1-50" },
  { label: "51-200 employees", value: "51-200" },
  { label: "201-500 employees", value: "201-500" },
  { label: "501-2000 employees", value: "501-2000" },
  { label: "2000+ employees", value: "2000+" },
] as const;

export const PERIOD_TYPE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  bi_monthly: "Bi-Monthly (Twice a Month)",
  bi_weekly: "Bi-Weekly (Every 2 Weeks)",
};

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Detailed View", href: "/detailed", icon: "Table" },
  { label: "Payroll Periods", href: "/payroll-periods", icon: "Calendar" },
  { label: "Integrations", href: "/integrations", icon: "Plug" },
  { label: "Settings", href: "/settings", icon: "Settings" },
] as const;
