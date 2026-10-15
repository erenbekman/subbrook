import raw from '../data/services.json'
import { fold } from './statement'
import type { IntervalUnit } from './types'

export interface Service {
  id: string
  name: string
  category: string | null
  website: string
  manage_url?: string
  unit: IntervalUnit
  match: RegExp
}

export const SERVICES: Service[] = raw.map((s) => ({ ...s, unit: s.unit as IntervalUnit, match: new RegExp(s.match) }))

export function findService(description: string): Service | undefined {
  const text = fold(description)
  return SERVICES.find((s) => s.match.test(text))
}

export function searchServices(query: string, limit = 5): Service[] {
  const q = fold(query).trim()
  if (!q) return []
  const score = (s: Service): number => {
    const name = fold(s.name)
    if (name.startsWith(q)) return 3
    if (name.split(/[\s.+-]+/).some((w) => w.startsWith(q))) return 2
    if (q.length >= 3 && (name.includes(q) || s.id.includes(q))) return 1
    return 0
  }
  return SERVICES
    .map((s) => ({ s, n: score(s) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((x) => x.s)
}
