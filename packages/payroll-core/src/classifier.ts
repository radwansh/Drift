export interface ClassificationOptions {
  absoluteThreshold?: number; // currency units, e.g. 1.0
  relativeThreshold?: number; // fraction, e.g. 0.005 for 0.5%
}

const DEFAULT_OPTIONS: Required<ClassificationOptions> = {
  absoluteThreshold: 1.0,
  relativeThreshold: 0.005,
};

export function classifyEmployeeStatus(
  currentNet: number | null,
  previousNet: number | null,
  opts: ClassificationOptions = {},
): "unchanged" | "increased" | "decreased" | "new" | "departed" {
  const { absoluteThreshold, relativeThreshold } = { ...DEFAULT_OPTIONS, ...opts };

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

  // Significant if absolute difference exceeds absoluteThreshold
  // OR relative difference exceeds relativeThreshold (based on previousNet)
  const absSignificant = Math.abs(diff) >= absoluteThreshold;
  const relSignificant = previousNet !== 0 && Math.abs(diff / previousNet) >= relativeThreshold;

  if (!absSignificant && !relSignificant) {
    return "unchanged";
  }
  return diff > 0 ? "increased" : "decreased";
}

export function classifyMatchedPairs(pairs: import("./types").MatchedPair[], opts: ClassificationOptions = {}) {
  return pairs.map((pair) => {
    const status = classifyEmployeeStatus(
      pair.current?.netSalary ?? null,
      pair.previous?.netSalary ?? null,
      opts,
    );
    return { ...pair, status };
  });
}
