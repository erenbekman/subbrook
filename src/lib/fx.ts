import { computed } from 'vue'
import { fetch } from '@tauri-apps/plugin-http'
import * as repo from './db'
import { saveSetting, store } from './store'
import { today } from './dates'
import { CURRENCIES } from './money'
import type { FxRate, FxSource } from './types'

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml'
const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml'
const RECHECK_MS = 6 * 60 * 60 * 1000
const RETRY_MS = 10 * 60 * 1000

type Day = { date: string; rates: Record<string, number> }

const index = computed(() => {
  const by: Record<FxSource, Map<string, Record<string, number>>> = { tcmb: new Map(), ecb: new Map() }
  for (const r of store.rates) {
    const day = by[r.source].get(r.rate_date) ?? {}
    day[r.currency] = r.rate
    by[r.source].set(r.rate_date, day)
  }
  const sorted = (m: Map<string, Record<string, number>>): Day[] =>
    [...m.entries()].map(([date, rates]) => ({ date, rates })).sort((a, b) => a.date.localeCompare(b.date))
  return { tcmb: sorted(by.tcmb), ecb: sorted(by.ecb) }
})

function dayOn(source: FxSource, date: string): Day | undefined {
  const days = index.value[source]
  let found: Day | undefined
  for (const d of days) {
    if (d.date > date) break
    found = d
  }
  return found ?? days[0]
}

export function convert(minor: number, from: string, to: string, date = today()): number | null {
  if (from === to) return minor
  const order: FxSource[] = from === 'TRY' || to === 'TRY' ? ['tcmb', 'ecb'] : ['ecb', 'tcmb']
  for (const source of order) {
    const rates = dayOn(source, date)?.rates
    if (rates?.[from] && rates[to]) return Math.round((minor * rates[from]) / rates[to])
  }
  return null
}

export function sumInPrimary(items: { minor: number; currency: string; date?: string }[]): { minor: number; approx: boolean } | null {
  const to = store.settings.currency
  let minor = 0
  let approx = false
  for (const item of items) {
    const value = convert(item.minor, item.currency, to, item.date)
    if (value === null) return null
    if (item.currency !== to) approx = true
    minor += value
  }
  return { minor, approx }
}

export const latestRates = computed(() => {
  const last = (days: Day[]) => days[days.length - 1]?.date ?? null
  return { tcmb: last(index.value.tcmb), ecb: last(index.value.ecb) }
})

function keep(code: string | null): code is string {
  return !!code && CURRENCIES.includes(code)
}

export function parseTcmb(xml: string): FxRate[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const [d, m, y] = (doc.documentElement.getAttribute('Tarih') ?? '').split('.')
  if (!y) throw new Error('TCMB: no date in response')
  const rate_date = `${y}-${m}-${d}`
  const out: FxRate[] = [{ source: 'tcmb', rate_date, currency: 'TRY', rate: 1 }]
  for (const el of Array.from(doc.getElementsByTagName('Currency'))) {
    const code = el.getAttribute('CurrencyCode')
    const unit = Number(el.getElementsByTagName('Unit')[0]?.textContent)
    const selling = Number(el.getElementsByTagName('ForexSelling')[0]?.textContent)
    if (keep(code) && unit > 0 && selling > 0) out.push({ source: 'tcmb', rate_date, currency: code, rate: selling / unit })
  }
  return out
}

export function parseEcb(xml: string): FxRate[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const out: FxRate[] = []
  for (const day of Array.from(doc.getElementsByTagName('Cube')).filter((c) => c.hasAttribute('time'))) {
    const rate_date = day.getAttribute('time')!
    out.push({ source: 'ecb', rate_date, currency: 'EUR', rate: 1 })
    for (const c of Array.from(day.getElementsByTagName('Cube'))) {
      const code = c.getAttribute('currency')
      const perEur = Number(c.getAttribute('rate'))
      if (keep(code) && perEur > 0) out.push({ source: 'ecb', rate_date, currency: code, rate: 1 / perEur })
    }
  }
  return out
}

async function download(url: string, parse: (xml: string) => FxRate[]): Promise<FxRate[]> {
  const res = await fetch(url, { connectTimeout: 15_000 })
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`)
  const rates = parse(await res.text())
  if (rates.length < 2) throw new Error(`${new URL(url).hostname}: no rates in response`)
  return rates
}

function needsRates(): boolean {
  return store.subscriptions.some((s) => s.currency !== store.settings.currency)
}

let lastAttempt = 0
let running: Promise<string | null> | null = null

export function refreshRates(force = false): Promise<string | null> {
  if (!force) {
    if (!needsRates() || Date.now() - lastAttempt < RETRY_MS) return Promise.resolve(null)
    const checked = Date.parse(store.settings.fx_checked_at)
    if (checked && Date.now() - checked < RECHECK_MS) return Promise.resolve(null)
  }
  running ??= (async () => {
    lastAttempt = Date.now()
    const results = await Promise.allSettled([download(TCMB_URL, parseTcmb), download(ECB_URL, parseEcb)])
    const rates = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    if (rates.length) {
      await repo.saveRates(rates)
      store.rates = await repo.listRates()
      await saveSetting('fx_checked_at', new Date().toISOString())
    }
    const errors = results.flatMap((r) => (r.status === 'rejected' ? [String(r.reason)] : []))
    return errors.length ? errors.join(' · ') : null
  })().finally(() => { running = null })
  return running
}
