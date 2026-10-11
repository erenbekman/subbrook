export interface Transaction {
  date: string
  description: string
  amountMinor: number
  currency: string | null
}

export interface ColumnMap {
  headerRow: number
  date: number
  description: number
  amount: number
  debit: number
  currency: number
  chargesNegative: boolean
}

const FOLD: Record<string, string> = { ı: 'i', ş: 's', ğ: 'g', ç: 'c', ö: 'o', ü: 'u' }

export function fold(text: string): string {
  return text.toLowerCase().replace(/\u0307/g, '').replace(/[ışğçöü]/g, (ch) => FOLD[ch])
}

export function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1254').decode(buffer)
  }
}

export function parseCsv(text: string): string[][] {
  const sample = text.split(/\r?\n/).slice(0, 30).join('\n')
  const delimiter = [';', ',', '\t', '|']
    .map((d) => ({ d, n: sample.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) { row.push(cell.trim()); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  return rows.filter((r) => r.some((c) => c))
}

export function parseNumber(raw: string): number | null {
  let s = raw.replace(/\s|₺|TL|TRY|USD|EUR|GBP|\$|€|£/gi, '')
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1) }
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1) }
  else if (s.startsWith('+')) s = s.slice(1)
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let decimal: string | null = null
  if (lastComma >= 0 && lastDot >= 0) decimal = lastComma > lastDot ? ',' : '.'
  else if (lastComma >= 0) decimal = s.length - lastComma - 1 <= 2 ? ',' : null
  else if (lastDot >= 0) decimal = s.split('.').length === 2 && s.length - lastDot - 1 !== 3 ? '.' : null
  const [whole, frac = ''] = decimal ? [s.slice(0, s.lastIndexOf(decimal)), s.slice(s.lastIndexOf(decimal) + 1)] : [s, '']
  const value = Number(whole.replace(/[.,]/g, '') || '0') * 100 + Math.round(Number(`0.${frac || '0'}`) * 100)
  return negative ? -value : value
}

export function parseDate(raw: string): string | null {
  const s = raw.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const HEADER = {
  date: /^(islem tarihi|tarih|date|completed date|transaction date|booking date|valor)\b/,
  description: /(aciklama|description|islem|merchant|payee|details|detay|isyeri)/,
  amount: /^(tutar|amount|miktar|islem tutari)/,
  debit: /^(borc|debit|paid out|cikan)/,
  currency: /^(doviz|para birimi|currency|ccy)\b/,
}

function findHeader(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map(fold)
    const hits = [HEADER.date, HEADER.amount, HEADER.description, HEADER.debit].filter((re) => cells.some((c) => re.test(c))).length
    if (hits >= 2) return i
  }
  return -1
}

function column(header: string[], re: RegExp, skip: number[] = []): number {
  return header.findIndex((c, i) => !skip.includes(i) && re.test(fold(c)))
}

function ratio(rows: string[][], col: number, test: (s: string) => boolean): number {
  const cells = rows.map((r) => r[col] ?? '').filter((c) => c)
  return cells.length ? cells.filter(test).length / cells.length : 0
}

export function guessColumns(rows: string[][]): ColumnMap {
  const headerRow = findHeader(rows)
  const body = rows.slice(headerRow + 1, headerRow + 200)
  const width = Math.max(0, ...rows.map((r) => r.length))
  const cols = Array.from({ length: width }, (_, i) => i)
  const header = headerRow >= 0 ? rows[headerRow] : []

  let date = column(header, HEADER.date)
  if (date < 0) date = cols.sort((a, b) => ratio(body, b, (s) => !!parseDate(s)) - ratio(body, a, (s) => !!parseDate(s)))[0] ?? 0
  const debit = column(header, HEADER.debit)
  let amount = column(header, HEADER.amount)
  if (amount < 0 && debit < 0) {
    amount = cols
      .filter((c) => c !== date)
      .sort((a, b) => ratio(body, b, (s) => parseNumber(s) !== null) - ratio(body, a, (s) => parseNumber(s) !== null))[0] ?? -1
  }
  let description = column(header, HEADER.description, [date, amount, debit])
  if (description < 0) {
    const avgLength = (c: number) => body.reduce((n, r) => n + (r[c]?.length ?? 0), 0) / Math.max(1, body.length)
    description = cols.filter((c) => ![date, amount, debit].includes(c)).sort((a, b) => avgLength(b) - avgLength(a))[0] ?? -1
  }
  const currency = column(header, HEADER.currency, [date, amount, debit, description])

  const signs = body.map((r) => parseNumber(r[amount] ?? '')).filter((n): n is number => n !== null && n !== 0)
  const chargesNegative = signs.filter((n) => n < 0).length > signs.length / 2
  return { headerRow, date, description, amount, debit, currency, chargesNegative }
}

export function toTransactions(rows: string[][], map: ColumnMap): Transaction[] {
  const out: Transaction[] = []
  for (const r of rows.slice(map.headerRow + 1)) {
    const date = parseDate(r[map.date] ?? '')
    const description = (r[map.description] ?? '').replace(/\s+/g, ' ').trim()
    if (!date || !description) continue
    let charge: number | null = null
    if (map.debit >= 0 && r[map.debit]) {
      const n = parseNumber(r[map.debit])
      charge = n === null ? null : Math.abs(n)
    } else if (map.amount >= 0) {
      const n = parseNumber(r[map.amount] ?? '')
      if (n !== null) charge = map.chargesNegative ? -n : n
    }
    if (charge === null || charge <= 0) continue
    const currency = map.currency >= 0 ? (r[map.currency] ?? '').toUpperCase().replace('TL', 'TRY').trim() || null : null
    out.push({ date, description, amountMinor: charge, currency })
  }
  return out
}
