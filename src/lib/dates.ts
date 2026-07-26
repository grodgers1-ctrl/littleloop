// Pure date utilities. All user-facing calculations use the device's
// local timezone. Dates are stored as date-only ISO strings (YYYY-MM-DD),
// never as locale-formatted strings.

export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateOnly(s: string): Date {
  // Parses YYYY-MM-DD as a LOCAL date (not UTC).
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${s}`);
  return new Date(y, m - 1, d);
}

export function todayDateOnly(now: Date = new Date()): string {
  return toDateOnly(now);
}

export function isFutureDate(date: string, now: Date = new Date()): boolean {
  const today = toDateOnly(now);
  return date > today;
}

export function isValidDateOnly(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseDateOnly(s);
  if (Number.isNaN(d.getTime())) return false;
  // Reject overflow (e.g. month 13 rolls over, day 30 of Feb).
  return (
    d.getFullYear() === parseInt(s.slice(0, 4), 10) &&
    d.getMonth() === parseInt(s.slice(5, 7), 10) - 1 &&
    d.getDate() === parseInt(s.slice(8, 10), 10)
  );
}

export function isValidChildName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 60;
}

export function isValidCadence(c: unknown): c is "daily" | "weekly" {
  return c === "daily" || c === "weekly";
}

// --- Daily period key --------------------------------------------------------

export function dailyPeriodKey(date: string): string {
  if (!isValidDateOnly(date)) throw new Error(`Invalid date: ${date}`);
  return date;
}

// --- Weekly period key (Monday-anchored) -------------------------------------
// We compute Monday manually rather than relying on the host's locale-aware
// %U / %V formatting, which is not deterministic across browsers.

export function startOfWeekMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // If Sunday, treat as day 7 so it rolls back to the previous Monday.
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function weeklyPeriodKey(date: string): string {
  if (!isValidDateOnly(date)) throw new Error(`Invalid date: ${date}`);
  return toDateOnly(startOfWeekMonday(parseDateOnly(date)));
}

// --- Child age display -------------------------------------------------------

export interface AgeParts {
  years: number;
  months: number;
  weeks: number;
  days: number;
}

export function diffParts(from: Date, to: Date): AgeParts {
  if (to < from) return { years: 0, months: 0, weeks: 0, days: 0 };
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  if (days < 0) {
    // Borrow days from previous month
    const prevMonth = new Date(to.getFullYear(), to.getMonth(), 0);
    days += prevMonth.getDate();
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }
  // After year/month correction, days is the remaining integer day difference.
  // Convert to weeks+days for readability.
  const weeks = Math.floor(days / 7);
  const remDays = days - weeks * 7;
  return { years, months, weeks, days: remDays };
}

export function ageAt(capturedDate: string, dob: string): AgeParts {
  return diffParts(parseDateOnly(dob), parseDateOnly(capturedDate));
}

export function formatAge(parts: AgeParts): string {
  const { years, months, weeks, days } = parts;
  if (years <= 0 && months <= 0 && weeks <= 0) {
    return days === 1 ? "1 day old" : `${days} days old`;
  }
  const parts2: string[] = [];
  if (years > 0) parts2.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months > 0) parts2.push(`${months} ${months === 1 ? "month" : "months"}`);
  if (years === 0 && months === 0 && weeks > 0) {
    parts2.push(`${weeks} ${weeks === 1 ? "week" : "weeks"}`);
  }
  if (parts2.length === 0 && days > 0) {
    parts2.push(`${days} ${days === 1 ? "day" : "days"}`);
  }
  return `${parts2.join(", ")} old`;
}

// --- Display formatting ------------------------------------------------------

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatDateLong(s: string): string {
  const d = parseDateOnly(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatWeekLabel(mondayIso: string): string {
  return `Week of ${formatDateLong(mondayIso)}`;
}