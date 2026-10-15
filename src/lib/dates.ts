import type { IntervalUnit, Occurrence, Subscription } from './types'

// All dates are local calendar days as 'YYYY-MM-DD'. We build Date objects at
// local noon so DST shifts never move a day.

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function today(): string {
  return toISO(new Date())
}

/** Add n intervals. Month/year steps clamp to the last day (Jan 31 + 1 month = Feb 28/29). */
export function addInterval(iso: string, unit: IntervalUnit, count: number): string {
  const d = fromISO(iso)
  if (unit === 'day') d.setDate(d.getDate() + count)
  else if (unit === 'week') d.setDate(d.getDate() + count * 7)
  else {
    const months = unit === 'month' ? count : count * 12
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + months)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, last))
  }
  return toISO(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000)
}

/** The next charge on or after `from`, rolling next_due forward if it is in the past. */
export function nextChargeOnOrAfter(sub: Subscription, from: string): string {
  return chargesBefore(sub, from).next
}

export function chargesBefore(sub: Subscription, before: string): { dates: string[]; next: string } {
  const dates: string[] = []
  let d = sub.next_due
  for (let k = 1; d < before && k <= 10_000; k++) {
    dates.push(d)
    d = addInterval(sub.next_due, sub.interval_unit, sub.interval_count * k)
  }
  return { dates, next: d }
}

/** Every charge of `sub` between two dates, inclusive. Steps back from next_due for past dates. */
export function occurrencesBetween(sub: Subscription, from: string, to: string): Occurrence[] {
  if (sub.status !== 'active') return []
  const out: Occurrence[] = []
  let d = sub.next_due
  let guard = 0
  // walk back to the first charge on or after `from`, never before the start date
  while (d > from && guard++ < 1000) {
    const prev = addInterval(d, sub.interval_unit, -sub.interval_count)
    if (prev < from || prev < sub.start_date) break
    d = prev
  }
  while (d < from && guard++ < 2000) d = addInterval(d, sub.interval_unit, sub.interval_count)
  while (d <= to && guard++ < 3000) {
    out.push({ sub, date: d, isTrialEnd: !!sub.trial_ends && d === sub.trial_ends, status: null })
    d = addInterval(d, sub.interval_unit, sub.interval_count)
  }
  return out
}

export function monthRange(year: number, month0: number): { from: string; to: string } {
  return { from: toISO(new Date(year, month0, 1, 12)), to: toISO(new Date(year, month0 + 1, 0, 12)) }
}

export function weekRange(iso: string): { from: string; to: string } {
  const d = fromISO(iso)
  const monday = addInterval(iso, 'day', -((d.getDay() + 6) % 7))
  return { from: monday, to: addInterval(monday, 'day', 6) }
}

export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

export function relativeDay(iso: string, ref = today()): string {
  const n = daysBetween(ref, iso)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n > 1 && n < 15) return `in ${n} days`
  if (n === -1) return 'yesterday'
  if (n < 0 && n > -15) return `${-n} days ago`
  return fromISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
