import { router } from "../trpc";
import { authRouter } from "./auth";
import { payrollPeriodsRouter } from "./payroll-periods";
import { comparisonsRouter } from "./comparisons";
import { employeesRouter } from "./employees";
import { columnMappingsRouter } from "./column-mappings";
import { exportsRouter } from "./exports";
import { integrationsRouter } from "./integrations";
import { settingsRouter } from "./settings";
import { aiRouter } from "./ai";

export const appRouter = router({
  auth: authRouter,
  payrollPeriods: payrollPeriodsRouter,
  comparisons: comparisonsRouter,
  employees: employeesRouter,
  columnMappings: columnMappingsRouter,
  exports: exportsRouter,
  integrations: integrationsRouter,
  settings: settingsRouter,
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;
