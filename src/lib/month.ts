import { computed, type Ref } from 'vue'
import { store } from './store'
import { monthRange, occurrencesBetween, today } from './dates'
import { shareMinor, sumByCurrency } from './money'
import { sumInPrimary } from './fx'
import type { Occurrence } from './types'

/** Everything the Overview and Calendar need about one month, derived from the store. */
export function useMonth(year: Ref<number>, month0: Ref<number>) {
  const range = computed(() => monthRange(year.value, month0.value))
  const t = today()

  const statusByKey = computed(() => new Map(store.payments.map((p) => [`${p.subscription_id}|${p.due_date}`, p.status])))

  const occurrences = computed<Occurrence[]>(() =>
    store.subscriptions
      .flatMap((s) => occurrencesBetween(s, range.value.from, range.value.to))
      .map((o) => ({ ...o, status: statusByKey.value.get(`${o.sub.id}|${o.date}`) ?? (o.date < t ? 'paid' as const : null) }))
      .sort((a, b) => (a.date === b.date ? a.sub.name.localeCompare(b.sub.name) : a.date.localeCompare(b.date))),
  )

  const byDay = computed(() => {
    const map = new Map<string, Occurrence[]>()
    for (const o of occurrences.value) map.set(o.date, [...(map.get(o.date) ?? []), o])
    return map
  })

  const totals = computed(() => {
    const counted = occurrences.value.filter((o) => o.status !== 'skipped' && o.status !== 'refunded')
    const all = sumByCurrency(counted.map((o) => ({ minor: shareMinor(o.sub), currency: o.sub.currency })))
    const paid = sumByCurrency(counted.filter((o) => o.status === 'paid').map((o) => ({ minor: shareMinor(o.sub), currency: o.sub.currency })))
    const item = (o: Occurrence) => ({ minor: shareMinor(o.sub), currency: o.sub.currency, date: o.date < t ? o.date : t })
    const allConverted = sumInPrimary(counted.map(item))
    const paidConverted = sumInPrimary(counted.filter((o) => o.status === 'paid').map(item))
    const converted = allConverted && paidConverted ? { all: allConverted, paid: paidConverted } : null
    return { all, paid, converted }
  })

  return { range, occurrences, byDay, totals }
}
