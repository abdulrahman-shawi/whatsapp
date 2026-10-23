export const TRIAL_DURATION_DAYS = 14;

export function trialEndDate(startedAt: Date): Date {
  return new Date(startedAt.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
}
