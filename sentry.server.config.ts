import * as Sentry from "@sentry/nextjs";
import { getSentryTraceSampleRate } from "@/lib/sentry-sample-rate";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  tracesSampleRate: getSentryTraceSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE
  ),
  integrations: [Sentry.httpIntegration()],
});
