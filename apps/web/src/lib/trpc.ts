import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

export const trpc = createTRPCReact<AppRouter>();

/**
 * A procedure's return type, so a component can hold one in state without
 * restating its shape. Restating it is how the upload modal's "Validation
 * Summary" came to carry `errors: number` while the server returned a list.
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
