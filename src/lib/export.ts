import { invoke } from '@tauri-apps/api/core'
import { addInterval, fromISO, nextChargeOnOrAfter, today } from './dates'
import { store } from './store'
import { formatMoney, shareMinor } from './money'
import type { Subscription } from './types'

const EVERY = { day: 'day', week: 'week', month: 'month', year: 'year' } as const

function every(s: Subscription): string {
  return s.interval_count === 1 ? EVERY[s.interval_unit] : `${s.interval_count} ${EVERY[s.interval_unit]}s`
}

function csvCell(value: string, delimiter: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /["\n\r]/.test(safe) || safe.includes(delimiter) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(subs: Subscription[], locale = navigator.language): string {
  const decimal = (1.5).toLocaleString(locale).includes(',') ? ',' : '.'
  const delimiter = decimal === ',' ? ';' : ','
  const header = ['Name', 'Category', 'Price', 'Currency', 'Every', 'Next payment', 'Started', 'Status', 'Shared by',
    'Your share', 'Payment method', 'Tags', 'Trial ends', 'Website', 'Cancel page', 'Notes']
  const money = (minor: number) => (minor / 100).toFixed(2).replace('.', decimal)
  const rows = subs.map((s) => [
    s.name, s.category_name ?? '', money(s.amount_minor), s.currency, every(s), s.next_due, s.start_date, s.status,
    String(s.share_count), money(shareMinor(s)), s.payment_method_name ?? '', s.tags.map((t) => t.name).join(' '),
    s.trial_ends ?? '', s.website ?? '', s.cancel_url ?? '', s.notes ?? '',
  ])
  return '\uFEFF' + [header, ...rows].map((r) => r.map((c) => csvCell(c, delimiter)).join(delimiter)).join('\r\n') + '\r\n'
}

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function icsDate(iso: string): string {
  return iso.replace(/-/g, '')
}

function foldLine(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  for (const ch of line) {
    const limit = parts.length ? 74 : 75
    if (encoder.encode(current + ch).length > limit) {
      parts.push(current)
      current = ch
    } else current += ch
  }
  parts.push(current)
  return parts.join('\r\n ')
}

function rrule(s: Subscription, start: string): string {
  const freq = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[s.interval_unit]
  let rule = `RRULE:FREQ=${freq};INTERVAL=${s.interval_count}`
  const d = fromISO(start)
  if ((s.interval_unit === 'month' || s.interval_unit === 'year') && d.getDate() >= 29) {
    if (s.interval_unit === 'year') rule += `;BYMONTH=${d.getMonth() + 1}`
    rule += `;BYMONTHDAY=${d.getDate()},-1;BYSETPOS=1`
  }
  return rule
}

function alarm(s: Subscription, what: string): string[] {
  const [h, m] = s.reminder_time.split(':').map(Number)
  const minutes = s.reminder_days * 24 * 60 - (h * 60 + m)
  const trigger = `${minutes > 0 ? '-' : ''}PT${Math.abs(minutes)}M`
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(what)}`, `TRIGGER:${trigger}`, 'END:VALARM']
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function toIcs(subs: Subscription[], today: string, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Subbrook//Subbrook//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Subscriptions']
  for (const s of subs.filter((x) => x.status === 'active')) {
    const start = nextChargeOnOrAfter(s, today)
    const amount = formatMoney(shareMinor(s), s.currency)
    lines.push(
      'BEGIN:VEVENT', `UID:subscription-${s.id}@subbrook.com`, `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(addInterval(start, 'day', 1))}`,
      `SUMMARY:${icsText(`${s.name} · ${amount}`)}`,
      `DESCRIPTION:${icsText(`Every ${every(s)}${s.category_name ? ` · ${s.category_name}` : ''} · tracked in Subbrook`)}`,
      rrule(s, start), 'TRANSP:TRANSPARENT', ...alarm(s, `${s.name} renews`), 'END:VEVENT',
    )
    if (s.trial_ends && s.trial_ends >= today) {
      lines.push(
        'BEGIN:VEVENT', `UID:trial-${s.id}@subbrook.com`, `DTSTAMP:${stamp(now)}`,
        `DTSTART;VALUE=DATE:${icsDate(s.trial_ends)}`, `DTEND;VALUE=DATE:${icsDate(addInterval(s.trial_ends, 'day', 1))}`,
        `SUMMARY:${icsText(`${s.name} trial ends`)}`, 'TRANSP:TRANSPARENT', ...alarm(s, `${s.name} trial ends`), 'END:VEVENT',
      )
    }
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export function exportFile(kind: 'csv' | 'ics'): Promise<boolean> {
  const date = today()
  const contents = kind === 'csv' ? toCsv(store.subscriptions) : toIcs(store.subscriptions, date)
  return invoke<boolean>('save_file', { name: `subbrook-${date}.${kind}`, contents })
}
