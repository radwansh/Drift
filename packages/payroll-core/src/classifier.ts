import type { MatchedPair } from "./types";

const THRESHOLD = 0.01;

export function classifyEmployeeStatus(
  currentNet: number | null,
  previousNet: number | null,
): "unchanged" | "increased" | "decreased" | "new" | "departed" {
  if (currentNet === null && previousNet === null) {
    return "unchanged";
  }
  if (currentNet === null) {
    return "departed";
  }
  if (previousNet === null) {
    return "new";
  }

  const diff = currentNet - previousNet;
  if (Math.abs(diff) < THRESHOLD) {
    return "unchanged";
  }
  return diff > 0 ? "increased" : "decreased";
}

export function classifyMatchedPairs(pairs: MatchedPair[]): MatchedPair[] {
  return pairs.map((pair) => {
    const status = classifyEmployeeStatus(
      pair.current?.netSalary ?? null,
      pair.previous?.netSalary ?? null,
    );
    return { ...pair, status };
  });
}
