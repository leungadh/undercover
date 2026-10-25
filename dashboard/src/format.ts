import type { DecisionKind, Status } from "./api";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const moment = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const STATUSES: Status[] = [
  "waiting",
  "in_progress",
  "awaiting_sign_off",
  "decided",
];

export const STATUS_LABELS: Record<Status, string> = {
  waiting: "Waiting",
  in_progress: "In progress",
  awaiting_sign_off: "Waiting for sign-off",
  decided: "Decided",
};

export const DECISION_LABELS: Record<DecisionKind, string> = {
  approve: "Approved",
  decline: "Declined",
  refer: "Referred",
};

/** Format an amount in US dollars, such as $1,250.00. */
export function money(amount: number): string {
  return dollars.format(amount);
}

/** Format a date such as 2026-06-24 as Jun 24, 2026. */
export function date(isoDate: string): string {
  return day.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Format a timestamp as a local date and time. */
export function dateTime(timestamp: string): string {
  return moment.format(new Date(timestamp));
}

/** Turn an identifier such as trip_delay into a label such as Trip delay. */
export function label(identifier: string): string {
  const words = identifier.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
