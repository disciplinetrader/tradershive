import { format, formatInTimeZone } from "date-fns-tz";
import { formatDistanceToNow } from "date-fns";

/**
 * Format a date in a specific timezone.
 */
export function formatZoned(
  date: Date | number | string,
  template: string,
  timezone: string = "UTC"
): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Invalid Date";
  return formatInTimeZone(d, timezone, template);
}

/**
 * Format a relative time string (e.g. "2 hours ago").
 */
export function formatRelative(date: Date | number | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Invalid Date";
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Get the current time in a specific timezone.
 */
export function getLocalTime(timezone: string): string {
  return formatZoned(new Date(), "HH:mm", timezone);
}

/**
 * Get the UTC offset string for a timezone (e.g. "GMT+01:00").
 */
export function getTimezoneOffset(timezone: string): string {
  try {
    return formatZoned(new Date(), "O", timezone);
  } catch {
    return "GMT+00:00";
  }
}
