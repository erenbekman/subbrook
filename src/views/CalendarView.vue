<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMonth } from '../lib/month'
import { fromISO, toISO, today } from '../lib/dates'
import { formatMoney, shareMinor } from '../lib/money'
import { markPayment, store } from '../lib/store'
import { sumInPrimary } from '../lib/fx'
import ServiceTile from '../components/ServiceTile.vue'
import type { PaymentStatus } from '../lib/types'

const emit = defineEmits<{ add: []; open: [id: number] }>()

const STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'paid', label: 'Paid' }, { value: 'skipped', label: 'Skipped' }, { value: 'refunded', label: 'Refunded' },
]
const MARKS: Record<PaymentStatus, string> = { paid: '✓', skipped: '–', refunded: '↩' }

const now = new Date()
const year = ref(now.getFullYear())
const month0 = ref(now.getMonth())
const { byDay, occurrences } = useMonth(year, month0)
const t = today()
const picked = ref(t)

const label = computed(() => new Date(year.value, month0.value, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))
const weekdays = computed(() => {
  // Monday-first week labels in the user's language
  const base = new Date(2024, 0, 1) // a Monday
  return Array.from({ length: 7 }, (_, i) => new Date(base.getFullYear(), 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }))
})

function shift(n: number): void {
  const d = new Date(year.value, month0.value + n, 1)
  year.value = d.getFullYear()
  month0.value = d.getMonth()
}
function goToday(): void {
  year.value = now.getFullYear()
  month0.value = now.getMonth()
  picked.value = t
}

const weeks = computed(() => {
  const first = new Date(year.value, month0.value, 1, 12)
  const offset = (first.getDay() + 6) % 7 // Monday = 0
  const start = new Date(year.value, month0.value, 1 - offset, 12)
  const rows: { days: { iso: string; day: number; inMonth: boolean }[]; total: string; count: number }[] = []
  for (let w = 0; w < 6; w++) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i, 12)
      return { iso: toISO(d), day: d.getDate(), inMonth: d.getMonth() === month0.value }
    })
    if (w > 0 && !days.some((d) => d.inMonth)) break
    const occ = days.filter((d) => d.inMonth).flatMap((d) => byDay.value.get(d.iso) ?? [])
    const counted = occ.filter((o) => o.status !== 'skipped' && o.status !== 'refunded')
    const converted = sumInPrimary(counted.map((o) => ({ minor: shareMinor(o.sub), currency: o.sub.currency, date: o.date < t ? o.date : t })))
    const sums: Record<string, number> = {}
    for (const o of counted) sums[o.sub.currency] = (sums[o.sub.currency] ?? 0) + shareMinor(o.sub)
    const total = converted && counted.length
      ? `${converted.approx ? '≈ ' : ''}${formatMoney(converted.minor, store.settings.currency)}`
      : Object.entries(sums).map(([c, v]) => formatMoney(v, c)).join(' + ')
    rows.push({ days, count: occ.length, total: total || '—' })
  }
  return rows
})

const maxDay = computed(() => Math.max(1, ...[...byDay.value.values()].map((l) => l.reduce((a, o) => a + shareMinor(o.sub), 0))))
function load(iso: string): number {
  const sum = (byDay.value.get(iso) ?? []).reduce((a, o) => a + shareMinor(o.sub), 0)
  return sum ? Math.max(8, Math.round((Math.sqrt(sum) / Math.sqrt(maxDay.value)) * 100)) : 0
}

const pickedList = computed(() => byDay.value.get(picked.value) ?? [])
const pickedLabel = computed(() => fromISO(picked.value).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))
const upcoming = computed(() => occurrences.value.filter((o) => o.date >= t).slice(0, 6))
const short = (minor: number, c: string) => formatMoney(minor, c).replace(/[.,]00(?=\D*$)/, '')
</script>

<template>
  <main class="page">
    <div class="grid-col">
      <div class="toolbar">
        <button class="btn round" aria-label="Previous month" @click="shift(-1)">‹</button>
        <h1 class="title">{{ label }}</h1>
        <button class="btn round" aria-label="Next month" @click="shift(1)">›</button>
        <button class="btn" @click="goToday">Today</button>
      </div>

      <div class="cal" role="grid" :aria-label="label">
        <div class="cal-row head" role="row">
          <span v-for="w in weekdays" :key="w" class="caption">{{ w }}</span>
          <span class="caption right">Week</span>
        </div>
        <div v-for="(week, wi) in weeks" :key="wi" class="cal-row" role="row">
          <button
            v-for="d in week.days" :key="d.iso" class="day"
            :class="{ out: !d.inMonth, has: byDay.get(d.iso)?.length, sel: d.iso === picked && d.inMonth, past: d.iso < t }"
            :disabled="!d.inMonth" :aria-label="d.iso" @click="picked = d.iso"
          >
            <span class="num" :class="{ today: d.iso === t }">{{ d.inMonth ? d.day : '' }}</span>
            <template v-if="d.inMonth">
              <span v-for="o in byDay.get(d.iso) ?? []" :key="o.sub.id" class="chip"
                :class="{ paid: o.status === 'paid', void: o.status === 'skipped' || o.status === 'refunded', trial: !o.status && !!o.sub.trial_ends && o.sub.trial_ends >= d.iso }"
                :style="{ '--c': `var(--${o.sub.category_color || 'cat-1'})`, '--cs': `var(--${o.sub.category_color || 'cat-1'}-soft)` }">
                <span class="mark">{{ o.status ? MARKS[o.status] : o.sub.name.charAt(0).toUpperCase() }}</span>
                <span class="chip-name">{{ o.sub.name }}</span>
                <span class="chip-amt">{{ short(shareMinor(o.sub), o.sub.currency) }}</span>
              </span>
              <span class="load" :class="{ paid: d.iso < t }" :style="{ width: load(d.iso) + '%' }" />
            </template>
          </button>
          <div class="week-total"><strong>{{ week.total }}</strong><span class="quiet">{{ week.count ? week.count + (week.count === 1 ? ' charge' : ' charges') : '' }}</span></div>
        </div>
      </div>
    </div>

    <aside class="side">
      <section class="card day-card">
        <span class="caption">{{ picked === t ? 'Today' : picked < t ? 'Past' : 'Upcoming' }}</span>
        <h2 class="figure-l">{{ pickedLabel }}</h2>
        <template v-if="!store.subscriptions.length">
          <p class="meta">Charges land here on the day they're due, with a total for every week.</p>
          <button class="btn add-btn" @click="emit('add')">Add subscription</button>
        </template>
        <p v-else-if="!pickedList.length" class="meta">Nothing due this day.</p>
        <div v-for="o in pickedList" :key="o.sub.id" class="pick-item">
          <button class="pick-row" @click="emit('open', o.sub.id)">
            <ServiceTile :name="o.sub.name" :color="o.sub.category_color" :size="40" :trial="!!o.sub.trial_ends && o.sub.trial_ends >= o.date" />
            <span class="who"><strong>{{ o.sub.name }}</strong><span class="meta">{{ o.sub.category_name ?? 'Uncategorized' }}</span></span>
            <strong :class="{ struck: o.status === 'skipped' || o.status === 'refunded' }">{{ formatMoney(shareMinor(o.sub), o.sub.currency) }}</strong>
          </button>
          <div v-if="o.date <= t" class="segmented" role="radiogroup" :aria-label="`${o.sub.name} payment status`">
            <button v-for="st in STATUSES" :key="st.value" role="radio" :aria-checked="o.status === st.value" @click="markPayment(o.sub, o.date, st.value)">{{ st.label }}</button>
          </div>
        </div>
      </section>
      <section>
        <h2 class="caption">Coming up</h2>
        <p v-if="!upcoming.length" class="meta">No more charges this month.</p>
        <button v-for="o in upcoming" :key="o.sub.id + o.date" class="up-row" @click="picked = o.date">
          <span class="quiet">{{ fromISO(o.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }}</span>
          <span class="dot" :style="{ background: `var(--${o.sub.category_color || 'cat-1'})` }" />
          <span class="grow">{{ o.sub.name }}</span>
          <strong>{{ formatMoney(shareMinor(o.sub), o.sub.currency) }}</strong>
        </button>
      </section>
    </aside>
  </main>
</template>

<style scoped>
.page { width: 100%; max-width: 1320px; margin: 0 auto; padding: 40px 40px 56px; display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start; }
.grid-col { flex: 999 1 720px; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.round { width: 36px; padding: 0; }
.cal { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--line); padding-top: 10px; }
.cal-row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)) 96px; gap: 6px; }
.right { text-align: right; }
.day {
  all: unset; box-sizing: border-box; min-height: 108px; padding: 8px; border-radius: var(--radius-md);
  display: flex; flex-direction: column; gap: 5px; cursor: pointer; background: var(--sunken);
}
.day.has { background: var(--surface); }
.day.out { background: transparent; cursor: default; }
.day.sel { box-shadow: inset 0 0 0 2px var(--brand); }
.num { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
.day.past .num { color: var(--ink-3); }
.num.today { background: var(--ink); color: var(--paper); }
.chip { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px 0 4px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; background: var(--cs); color: var(--c); }
.chip.paid { background: var(--mint-soft); color: var(--brand); }
.chip.trial { background: var(--trial-soft); color: var(--trial); border: 1.5px dashed var(--trial); }
.mark { width: 18px; height: 18px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; background: var(--c); color: var(--paper); }
.chip.paid .mark { background: var(--brand); }
.chip.void { background: var(--sunken); color: var(--ink-3); }
.chip.void .mark { background: var(--line-strong); color: var(--ink-2); }
.chip.void .chip-amt { color: var(--ink-3); text-decoration: line-through; }
.chip.trial .mark { background: transparent; color: var(--trial); }
.chip-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip-amt { flex: none; font-weight: 700; color: var(--ink); }
.load { margin-top: auto; height: 3px; border-radius: 2px; background: var(--line-strong); }
.load.paid { background: var(--mint); }
.week-total { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 2px; font-size: 13px; border-left: 1px solid var(--line); }
.week-total .quiet { font-size: 11px; }
.side { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.day-card { display: flex; flex-direction: column; gap: 12px; }
.day-card h2 { margin: 0; }
.day-card .meta { margin: 0; }
.add-btn { align-self: flex-start; }
.pick-item { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding-bottom: 10px; border-top: 1px solid var(--line); }
.pick-row, .up-row { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 10px 0; }
.up-row { border-top: 1px solid var(--line); }
.struck { color: var(--ink-3); text-decoration: line-through; }
.who { flex: 1; display: flex; flex-direction: column; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.grow { flex: 1; font-weight: 600; }
</style>
