export function calculateDelta(
  current: number | null,
  previous: number | null,
): { absolute: number | null; percentage: number | null } {
  if (current === null && previous === null) {
    return { absolute: null, percentage: null };
  }

  if (current === null) {
    const abs = -(previous as number);
    const pct = previous !== 0 ? -100 : null;
    return { absolute: round2(abs), percentage: pct !== null ? round2(pct) : null };
  }

  if (previous === null) {
    const pct = current !== 0 ? null : null;
    return { absolute: round2(current), percentage: null };
  }

  const absolute = round2(current - previous);
  const percentage = previous !== 0 ? round2((absolute / previous) * 100) : null;

  return { absolute, percentage };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
