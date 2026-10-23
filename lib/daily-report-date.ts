export function getPreviousUtcDayRange(now: Date) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return {
    start,
    end,
    key: start.toISOString().slice(0, 10),
  };
}
