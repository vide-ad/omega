/** Date helpers over `YYYY-MM-DD` strings. All arithmetic is done in UTC to avoid DST drift. */

const DAY_MS = 86_400_000;

export function parseDate(date: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid ISO date: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return formatDate(new Date(parseDate(date).getTime() + days * DAY_MS));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY_MS);
}

/** Date portion of an ISO timestamp, or the string itself if already a date. */
export function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

/** ISO-8601 week: returns `{ year, week }` where week 1 contains the year's first Thursday. */
export function isoWeek(date: string): { year: number; week: number } {
  const d = parseDate(date);
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // nearest Thursday
  const year = d.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return { year, week };
}

/** `YYYY-Www` key, e.g. `2026-W37`. */
export function isoWeekKey(date: string): string {
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday of the ISO week containing `date`. */
export function isoWeekStart(date: string): string {
  const d = parseDate(date);
  const dayNum = d.getUTCDay() || 7;
  return addDays(date, 1 - dayNum);
}

/** Sunday of the ISO week containing `date`. */
export function isoWeekEnd(date: string): string {
  return addDays(isoWeekStart(date), 6);
}
