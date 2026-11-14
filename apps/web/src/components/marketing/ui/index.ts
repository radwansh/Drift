/**
 * The marketing pages' design-system components now live in components/cv, shared with
 * the app. This module re-exports them so every `from "./ui"` / `from "../ui"` import in
 * components/marketing keeps working. New code imports from "@/components/cv".
 */
export * from "@/components/cv";
