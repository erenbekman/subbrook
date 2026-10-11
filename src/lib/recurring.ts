import { addInterval, daysBetween } from './dates'
import { fold, type Transaction } from './statement'
import type { IntervalUnit, Subscription } from './types'

export interface Candidate {
  key: string
  name: string
  raw: string
  category: string | null
  dates: string[]
  amounts: number[]
  amountMinor: number
  currency: string
  unit: IntervalUnit
  intervalCount: number
  pattern: string
  confidence: 'sure' | 'maybe'
  startDate: string
  nextDue: string
  trackedId: number | null
  priceChanged: boolean
}

const KNOWN: { re: RegExp; name: string; category: string | null }[] = [
  { re: /netflix/, name: 'Netflix', category: 'Entertainment' },
  { re: /spotify/, name: 'Spotify', category: 'Music' },
  { re: /youtube/, name: 'YouTube Premium', category: 'Entertainment' },
  { re: /google\s*\*?\s*(one|storage)|google one/, name: 'Google One', category: 'Cloud' },
  { re: /apple music/, name: 'Apple Music', category: 'Music' },
  { re: /icloud|apple\.com\/bill|itunes/, name: 'Apple (iCloud+ / App Store)', category: 'Cloud' },
  { re: /disney/, name: 'Disney+', category: 'Entertainment' },
  { re: /prime video|amazon prime|amzn prime|primevideo/, name: 'Amazon Prime', category: 'Entertainment' },
  { re: /exxen/, name: 'Exxen', category: 'Entertainment' },
  { re: /blu ?tv/, name: 'BluTV', category: 'Entertainment' },
  { re: /\bgain\b/, name: 'Gain', category: 'Entertainment' },
  { re: /tabii/, name: 'Tabii', category: 'Entertainment' },
  { re: /bein ?connect|\btod\b/, name: 'TOD', category: 'Entertainment' },
  { re: /mubi/, name: 'MUBI', category: 'Entertainment' },
  { re: /xbox/, name: 'Xbox Game Pass', category: 'Entertainment' },
  { re: /playstation|\bpsn\b/, name: 'PlayStation Plus', category: 'Entertainment' },
  { re: /twitch/, name: 'Twitch', category: 'Entertainment' },
  { re: /deezer/, name: 'Deezer', category: 'Music' },
  { re: /audible/, name: 'Audible', category: 'Education' },
  { re: /storytel/, name: 'Storytel', category: 'Education' },
  { re: /openai|chatgpt/, name: 'ChatGPT', category: 'AI' },
  { re: /anthropic|claude\.ai/, name: 'Claude', category: 'AI' },
  { re: /midjourney/, name: 'Midjourney', category: 'AI' },
  { re: /perplexity/, name: 'Perplexity', category: 'AI' },
  { re: /cursor/, name: 'Cursor', category: 'Dev tools' },
  { re: /github/, name: 'GitHub', category: 'Dev tools' },
  { re: /figma/, name: 'Figma', category: 'Dev tools' },
  { re: /notion/, name: 'Notion', category: 'Dev tools' },
  { re: /canva/, name: 'Canva', category: 'Dev tools' },
  { re: /adobe/, name: 'Adobe', category: 'Dev tools' },
  { re: /jetbrains/, name: 'JetBrains', category: 'Dev tools' },
  { re: /1password/, name: '1Password', category: 'Dev tools' },
  { re: /bitwarden/, name: 'Bitwarden', category: 'Dev tools' },
  { re: /microsoft|msft|office ?365/, name: 'Microsoft 365', category: 'Cloud' },
  { re: /dropbox/, name: 'Dropbox', category: 'Cloud' },
  { re: /vercel/, name: 'Vercel', category: 'Cloud' },
  { re: /digitalocean/, name: 'DigitalOcean', category: 'Cloud' },
  { re: /hetzner/, name: 'Hetzner', category: 'Cloud' },
  { re: /amazon web services|\baws\b/, name: 'AWS', category: 'Cloud' },
  { re: /duolingo/, name: 'Duolingo', category: 'Education' },
  { re: /coursera/, name: 'Coursera', category: 'Education' },
  { re: /linkedin/, name: 'LinkedIn Premium', category: null },
  { re: /patreon/, name: 'Patreon', category: null },
]

const EXCLUDE = /\b(eft|havale|fast|atm|nakit|para cekme|faiz|kmh|virman|kart odeme|ekstre odeme|yapilan odeme|tesekkur|payment received|transfer|top-up|topup|exchanged to|refund|iade)\b/

const NOISE = /\b(TR|TUR|TURKEY|TÜRKİYE|ISTANBUL|İSTANBUL|ANKARA|IZMIR|İZMİR|LONDON|DUBLIN|LUXEMBOURG|AMSTERDAM|CA|US|USA|NL|IE|GB|UK|COM|NET|ORG|WWW|INC|LTD|LLC|AŞ|A Ş|SAN|TİC|TIC|BV|GMBH|SARL)\b/g

export function merchantKey(description: string): string {
  return description
    .toLocaleUpperCase('tr')
    .replace(/^(IYZICO|IYZ|PAYPAL|PP|GOOGLE|SQ|PADDLE\.NET|STRIPE)\s*[*/]\s*/, '')
    .replace(/HTTPS?:\/\//g, '')
    .replace(/\d[\d\s-]{3,}/g, ' ')
    .replace(/[^A-ZÇĞİÖŞÜ0-9 ]+/g, ' ')
    .replace(NOISE, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !/^\d+$/.test(t))
    .slice(0, 3)
    .join(' ')
}

function titleCase(key: string): string {
  return key.toLowerCase().replace(/\u0307/g, '').replace(/(^|\s)(\S)/g, (_, sp: string, ch: string) => sp + ch.toUpperCase())
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

const CADENCES: { min: number; max: number; unit: IntervalUnit; count: number; label: string; slack: number }[] = [
  { min: 5, max: 9, unit: 'week', count: 1, label: 'weekly', slack: 2 },
  { min: 25, max: 38, unit: 'month', count: 1, label: 'monthly', slack: 5 },
  { min: 55, max: 70, unit: 'month', count: 2, label: 'every 2 months', slack: 6 },
  { min: 80, max: 100, unit: 'month', count: 3, label: 'every 3 months', slack: 8 },
  { min: 170, max: 200, unit: 'month', count: 6, label: 'every 6 months', slack: 10 },
  { min: 350, max: 380, unit: 'year', count: 1, label: 'yearly', slack: 10 },
]

function normalizedName(name: string): string {
  return fold(name).replace(/[^a-z0-9]+/g, ' ').trim()
}

function tracking(subs: Subscription[], name: string, known: RegExp | null): Subscription | undefined {
  const target = normalizedName(name)
  return subs.find((s) => {
    const own = normalizedName(s.name)
    if (known?.test(own)) return true
    return own === target || (target.length >= 4 && (own.includes(target) || target.includes(own) && own.length >= 4))
  })
}

export function detectRecurring(
  transactions: Transaction[], subscriptions: Subscription[], fallbackCurrency: string, today: string,
): Candidate[] {
  const groups = new Map<string, { name: string; category: string | null; known: RegExp | null; txs: Transaction[] }>()
  for (const tx of transactions) {
    const lower = fold(tx.description)
    if (EXCLUDE.test(lower)) continue
    const known = KNOWN.find((k) => k.re.test(lower))
    const key = known ? `known:${known.name}` : merchantKey(tx.description)
    if (!key) continue
    const group = groups.get(key) ?? { name: known?.name ?? titleCase(key), category: known?.category ?? null, known: known?.re ?? null, txs: [] }
    group.txs.push(tx)
    groups.set(key, group)
  }

  const out: Candidate[] = []
  for (const [key, g] of groups) {
    const txs = [...g.txs].sort((a, b) => a.date.localeCompare(b.date))
    const amounts = txs.map((t) => t.amountMinor)
    const stable = Math.max(...amounts) <= Math.min(...amounts) * 1.15
    const gaps = txs.slice(1).map((t, i) => daysBetween(txs[i].date, t.date)).filter((d) => d > 0)
    const cadence = gaps.length ? CADENCES.find((c) => { const m = median(gaps); return m >= c.min && m <= c.max }) : undefined
    const regular = !!cadence && gaps.every((d) => {
      const m = median(gaps)
      return Math.abs(d - m) <= cadence.slack || Math.abs(d - 2 * m) <= cadence.slack * 2
    })

    let confidence: Candidate['confidence'] | null = null
    if (regular && stable && (g.known || txs.length >= 3)) confidence = 'sure'
    else if (regular && (g.known || stable || cadence!.unit !== 'week')) confidence = 'maybe'
    else if (g.known && !gaps.length) confidence = 'maybe'
    if (!confidence) continue

    const unit = cadence?.unit ?? 'month'
    const intervalCount = cadence?.count ?? 1
    const last = txs[txs.length - 1].date
    let next = last
    for (let k = 1; next < today && k < 10_000; k++) next = addInterval(last, unit, intervalCount * k)
    const amountMinor = amounts[amounts.length - 1]
    const currency = txs[txs.length - 1].currency ?? fallbackCurrency
    const existing = tracking(subscriptions, g.name, g.known)
    const label = cadence?.label ?? 'seen once'

    out.push({
      key, name: g.name, raw: txs[txs.length - 1].description, category: g.category,
      dates: txs.map((t) => t.date), amounts, amountMinor, currency, unit, intervalCount,
      pattern: `${label}${txs.length > 1 ? `, ${txs.length}×` : ''}${stable ? '' : ', amount varies'}`,
      confidence, startDate: txs[0].date, nextDue: next,
      trackedId: existing?.id ?? null,
      priceChanged: !!existing && existing.currency === currency && Math.abs(existing.amount_minor - amountMinor) > existing.amount_minor * 0.02,
    })
  }

  return out.sort((a, b) => (a.confidence === b.confidence ? b.amountMinor - a.amountMinor : a.confidence === 'sure' ? -1 : 1))
}
