import { PageLoading } from "@/components/shared/loading-spinner";

/**
 * Loading is the scanning drift strip, not a spinner (canvas board "Patterns",
 * phase 5 of docs/design/CLAUDE_CODE_BRIEF.md).
 *
 * The label is new. This file rendered a bare `Loader2` with no accessible name
 * at all, so a screen reader met an unlabelled graphic and then silence; its two
 * siblings under /employees already carried one. `PageLoading` puts the label on
 * the strip and in a visible line, so both readers learn the same thing.
 */
export default function AnnualSalariesLoading() {
  return <PageLoading label="Loading annual salaries" />;
}
