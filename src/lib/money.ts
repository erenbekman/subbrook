import type { Subscription } from './types'

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP']

const formatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(minor: number, currency: string): string {
  let f = formatters.get(currency)
  if (!f) {
    f = new Intl.NumberFormat(navigator.language, { style: 'currency', currency })
    formatters.set(currency, f)
  }
  return f.format(minor / 100)
}

/** Split "₺10.089,97" into ["₺10.089", ",97"] so the decimals can be set quieter. */
export function splitDecimals(text: string): [string, string] {
  const m = text.match(/^(.*?)([.,]\d{2})(\D*)$/)
  return m ? [m[1], m[2] + m[3]] : [text, '']
}

const PER_MONTH = { day: 30.4375, week: 30.4375 / 7, month: 1, year: 1 / 12 } as const

/** What this subscription costs the user per month: normalized cycle, divided by people sharing it. */
export function monthlyMinor(sub: Subscription): number {
  return Math.round((sub.amount_minor * PER_MONTH[sub.interval_unit]) / sub.interval_count / sub.share_count)
}

/** The user's share of one charge. */
export function shareMinor(sub: Subscription): number {
  return Math.round(sub.amount_minor / sub.share_count)
}

/** Sum amounts per currency: { TRY: 1008997, USD: 2600 } */
export function sumByCurrency(items: { minor: number; currency: string }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const i of items) out[i.currency] = (out[i.currency] ?? 0) + i.minor
  return out
}

export function parseAmount(input: string): number {
  // accepts "1.350,00", "1350.00", "1350" → minor units
  const clean = input.trim().replace(/[^\d.,]/g, '')
  const lastSep = Math.max(clean.lastIndexOf(','), clean.lastIndexOf('.'))
  if (lastSep >= 0 && clean.length - lastSep - 1 <= 2) {
    const whole = clean.slice(0, lastSep).replace(/[.,]/g, '')
    const frac = clean.slice(lastSep + 1).padEnd(2, '0')
    return Number(whole || '0') * 100 + Number(frac)
  }
  return Number(clean.replace(/[.,]/g, '') || '0') * 100
}
