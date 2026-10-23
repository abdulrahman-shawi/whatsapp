const DEFAULT_SAMPLE_RATE = 0.1;

export function getSentryTraceSampleRate(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_SAMPLE_RATE;
  const rate = Number(value);
  if (!Number.isFinite(rate)) return DEFAULT_SAMPLE_RATE;
  return Math.min(Math.max(rate, 0), 1);
}
