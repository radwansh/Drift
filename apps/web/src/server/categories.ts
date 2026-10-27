import { z } from "zod";
import { ALL_CATEGORIES } from "@saas/payroll-core";

/**
 * The component categories, as a zod enum.
 *
 * The list was written out by hand in `routers/annual.ts`. Step 11b needs the
 * same enum in `routers/payroll-periods.ts`, so it is built from
 * `ALL_CATEGORIES` in `@saas/payroll-core` rather than copied — a second copy
 * is a second thing to keep in step with the `Category` union, and a category
 * missing from it would reject a value the engine itself produces.
 */
export const CategoryEnum = z.enum(ALL_CATEGORIES);
