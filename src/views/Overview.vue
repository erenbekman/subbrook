<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { store } from '../lib/store'
import { useMonth, usePeriod } from '../lib/month'
import { fromISO, nextChargeOnOrAfter, relativeDay, today, weekRange, yearRange } from '../lib/dates'
import { formatMoney, shareMinor, splitDecimals } from '../lib/money'
import { convert, latestRates } from '../lib/fx'
import type { Occurrence } from '../lib/types'
import ServiceTile from '../components/ServiceTile.vue'

const emit = defineEmits<{ add: []; import: []; share: []; open: [id: number] }>()

const now = new Date()
const year = ref(now.getFullYear())
const month0 = ref(now.getMonth())
const { range, occurrences } = useMonth(year, month0)
const t = today()

type Period = 'week' | 'month' | 'year'
const PERIODS: { value: Period; label: string }[] = [{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]
const saved = localStorage.getItem('subbrook.period')
const period = ref<Period>(saved === 'week' || saved === 'year' ? saved : 'month')
watch(period, (p) => localStorage.setItem('subbrook.period', p))

const periodRange = computed(() => (period.value === 'week' ? weekRange(t) : period.value === 'year' ? yearRange(year.value) : range.value))
const { occurrences: periodOccurrences, totals } = usePeriod(periodRange)

const monthLabel = computed(() => new Date(year.value, month0.value, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))
const periodLabel = computed(() => {
  if (period.value === 'year') return String(year.value)
  if (period.value === 'month') return monthLabel.value
  const fmt = (d: string) => fromISO(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${fmt(periodRange.value.from)} – ${fmt(periodRange.value.to)}`
})

// Converted totals lead when rates exist; otherwise the primary currency, or the largest total.
const converted = computed(() => totals.value.converted)
const primary = computed(() => {
  if (converted.value || totals.value.all[store.settings.currency]) return store.settings.currency
  const entries = Object.entries(totals.value.all).sort((a, b) => b[1] - a[1])
  return entries[0]?.[0] ?? store.settings.currency
})
const allMinor = computed(() => converted.value?.all.minor ?? totals.value.all[primary.value] ?? 0)
const paidMinor = computed(() => converted.value?.paid.minor ?? totals.value.paid[primary.value] ?? 0)
const hero = computed(() => splitDecimals(formatMoney(allMinor.value, primary.value)))
const others = computed(() => converted.value ? [] : Object.entries(totals.value.all).filter(([c]) => c !== primary.value).map(([c, v]) => formatMoney(v, c)))
const paid = computed(() => formatMoney(paidMinor.value, primary.value))
const toCome = computed(() => formatMoney(allMinor.value - paidMinor.value, primary.value))
const rateNote = computed(() => {
  if (!converted.value?.all.approx) return ''
  const useTcmb = primary.value === 'TRY' && latestRates.value.tcmb
  const date = useTcmb ? latestRates.value.tcmb : latestRates.value.ecb
  return date ? `Other currencies converted at ${useTcmb ? 'TCMB' : 'ECB'} rates of ${fromISO(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''
})

function inPrimary(o: Occurrence): number | null {
  return convert(shareMinor(o.sub), o.sub.currency, store.settings.currency, o.date < t ? o.date : t)
}
const upcomingCount = computed(() => periodOccurrences.value.filter((o) => o.date >= t).length)

const segments = computed(() => periodOccurrences.value.filter((o) => o.status !== 'skipped' && o.status !== 'refunded').map((o) => ({
  key: o.sub.id + o.date,
  grow: Math.max(1, inPrimary(o) ?? shareMinor(o.sub)),
  kind: o.status === 'paid' ? 'paid' : o.isTrialEnd || (o.sub.trial_ends && o.sub.trial_ends >= o.date) ? 'trial' : 'due',
})))

const next = computed(() => {
  const list = store.subscriptions
    .filter((s) => s.status === 'active')
    .map((s) => ({ sub: s, date: nextChargeOnOrAfter(s, t) }))
    .sort((a, b) => a.date.localeCompare(b.date))
  return list[0] ?? null
})

// River: one disc per charge, x by day of month, size by amount.
const daysInMonth = computed(() => fromISO(range.value.to).getDate())
const todayPos = computed(() => (t >= range.value.from && t <= range.value.to ? pos(fromISO(t).getDate()) : null))
function pos(day: number): number {
  return ((day - 1) / Math.max(1, daysInMonth.value - 1)) * 94 + 3
}
const discs = computed(() => occurrences.value.map((o, i) => {
  const minor = shareMinor(o.sub)
  const size = Math.min(72, Math.round(18 + Math.sqrt((inPrimary(o) ?? minor) / 100) * 0.6))
  return {
    key: o.sub.id + o.date, o, size, up: i % 2 === 0,
    left: pos(fromISO(o.date).getDate()),
    paid: o.status === 'paid',
    void: o.status === 'skipped' || o.status === 'refunded',
    trial: !!o.sub.trial_ends && o.sub.trial_ends >= o.date,
    label: formatMoney(minor, o.sub.currency).replace(/[.,]00(?=\D*$)/, ''),
  }
}))
const ticks = computed(() => [1, 8, 15, 22, 29].filter((d) => d <= daysInMonth.value))
</script>

<template>
  <main class="page">
    <section v-if="store.ready && store.subscriptions.length === 0" class="empty">
      <h1 class="title">Nothing to track yet</h1>
      <p class="meta">Add your first subscription and Subbrook will show what you pay, and when.</p>
      <div class="empty-actions">
        <button class="btn" @click="emit('import')">Import a bank statement</button>
        <button class="btn btn-primary" @click="emit('add')">Add subscription</button>
      </div>
    </section>

    <template v-else>
      <section class="hero" :aria-label="periodLabel">
        <div class="hero-main">
          <div class="caption-row">
            <span class="caption">{{ periodLabel }}</span>
            <div class="segmented" role="radiogroup" aria-label="Period">
              <button v-for="p in PERIODS" :key="p.value" role="radio" :aria-checked="period === p.value" @click="period = p.value">{{ p.label }}</button>
            </div>
            <button class="btn share" @click="emit('share')">Share</button>
          </div>
          <div class="figure-xl">{{ hero[0] }}<span class="quiet">{{ hero[1] }}</span></div>
          <div v-if="others.length" class="meta">+ {{ others.join(' + ') }}</div>
          <div v-else-if="rateNote" class="meta">{{ rateNote }}</div>
          <div class="segments" role="img" :aria-label="`${paid} paid, ${toCome} still to come`">
            <div v-for="s in segments" :key="s.key" class="seg" :class="s.kind" :style="{ flexGrow: s.grow }" />
          </div>
          <div class="split meta">
            <span><strong>{{ paid }}</strong> paid</span>
            <span><strong>{{ toCome }}</strong> still to come · {{ upcomingCount }} charges</span>
          </div>
        </div>
        <div v-if="next" class="hero-next">
          <span class="caption">Next charge</span>
          <span class="figure-l">{{ relativeDay(next.date) }}</span>
          <span class="meta">{{ next.sub.name }} · <strong>{{ formatMoney(shareMinor(next.sub), next.sub.currency) }}</strong></span>
        </div>
      </section>

      <section class="river-wrap" aria-label="This month's charges on a timeline">
        <div class="river">
          <div class="line" />
          <span v-for="d in ticks" :key="d" class="tick" :style="{ left: pos(d) + '%' }">{{ d === 1 ? monthLabel.split(' ')[0].slice(0, 3) + ' 1' : d }}</span>
          <template v-if="todayPos !== null">
            <div class="today" :style="{ left: todayPos + '%' }" />
            <span class="today-label caption" :style="{ left: todayPos + '%' }">Today</span>
          </template>
          <button
            v-for="d in discs" :key="d.key" class="disc-wrap" :class="{ up: d.up }"
            :style="{ left: d.left + '%', top: (d.up ? 110 - d.size - 26 : 134) + 'px' }"
            :aria-label="`${d.o.sub.name}, ${d.o.date}, ${d.label}`"
            @click="emit('open', d.o.sub.id)"
          >
            <span class="disc" :class="{ paid: d.paid, void: d.void, trial: d.trial }"
              :style="{ width: d.size + 'px', height: d.size + 'px', fontSize: Math.max(10, Math.round(d.size * 0.36)) + 'px', '--c': `var(--${d.o.sub.category_color || 'cat-1'})` }">
              {{ d.o.sub.name.charAt(0).toUpperCase() }}
            </span>
            <span class="disc-label">{{ d.label }}</span>
          </button>
        </div>
      </section>

      <section aria-labelledby="stmt">
        <div class="section-head">
          <h2 id="stmt" class="heading">Statement</h2>
          <span class="meta">{{ monthLabel }}</span>
        </div>
        <template v-for="(o, i) in occurrences" :key="o.sub.id + o.date">
          <div v-if="o.date >= t && (i === 0 || occurrences[i - 1].date < t)" class="today-rule caption">
            <span>Today</span><span class="rule-line" />
          </div>
          <button class="row" :class="{ past: o.date < t }" @click="emit('open', o.sub.id)">
            <span class="date">{{ fromISO(o.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' }) }}</span>
            <ServiceTile :name="o.sub.name" :color="o.sub.category_color" :trial="!!o.sub.trial_ends && o.sub.trial_ends >= o.date" :size="34" />
            <span class="who">
              <span class="name">{{ o.sub.name }}</span>
              <span class="meta">{{ o.sub.category_name ?? 'Uncategorized' }}{{ o.sub.share_count > 1 ? ` · split ×${o.sub.share_count}` : '' }}{{ o.status ? ` · ${o.status}` : '' }}{{ o.sub.currency !== store.settings.currency && inPrimary(o) !== null ? ` · ≈ ${formatMoney(inPrimary(o)!, store.settings.currency)}` : '' }}</span>
            </span>
            <span class="leader" aria-hidden="true" />
            <span v-if="o.isTrialEnd" class="badge badge-trial">Trial ends</span>
            <span class="amount" :class="{ struck: o.status === 'skipped' || o.status === 'refunded' }">{{ formatMoney(shareMinor(o.sub), o.sub.currency) }}</span>
          </button>
        </template>
        <p v-if="occurrences.length === 0" class="meta">No charges this month.</p>
      </section>
    </template>
  </main>
</template>

<style scoped>
.page { width: 100%; max-width: 1180px; margin: 0 auto; padding: 48px 48px 64px; display: flex; flex-direction: column; gap: 44px; }
.empty-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.empty { margin: 12vh auto 0; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; }
.caption-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 16px; }
.caption-row .share { margin-left: auto; }
.share { height: 30px; padding: 0 12px; font-size: 12px; }
.hero { display: flex; flex-wrap: wrap; gap: 32px 72px; align-items: flex-end; }
.hero-main { flex: 3 1 440px; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.hero-next { flex: 1 1 240px; display: flex; flex-direction: column; gap: 6px; padding-left: 28px; border-left: 1px solid var(--line); }
.segments { display: flex; gap: 3px; height: 10px; }
.seg { min-width: 6px; flex-basis: 0; border-radius: 3px; }
.seg.paid { background: var(--mint); }
.seg.due { border: 1.5px solid var(--line-strong); }
.seg.trial { border: 1.5px dashed var(--trial); }
.split { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.split strong { color: var(--ink); }

.river-wrap { overflow-x: auto; }
.river { position: relative; min-width: 860px; height: 220px; }
.line { position: absolute; left: 0; right: 0; top: 110px; height: 1px; background: var(--line-strong); }
.tick { position: absolute; top: 116px; transform: translateX(-50%); font-size: 11px; font-weight: 600; color: var(--ink-3); }
.today { position: absolute; top: 14px; bottom: 14px; width: 1px; background: var(--brand); }
.today-label { position: absolute; top: 0; transform: translateX(-50%); color: var(--brand); font-size: 10px; }
.disc-wrap { all: unset; cursor: pointer; position: absolute; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.disc-wrap.up { flex-direction: column-reverse; }
.disc { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; background: var(--c); color: var(--paper); }
.disc.paid { background: var(--mint); color: var(--ink); }
.disc.void { background: var(--sunken); color: var(--ink-3); }
.struck { color: var(--ink-3); text-decoration: line-through; }
.disc.trial { background: transparent; border: 1.5px dashed var(--trial); color: var(--trial); }
.disc-label { font-size: 11px; font-weight: 700; color: var(--ink-2); white-space: nowrap; }

.section-head { display: flex; align-items: baseline; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.today-rule { display: flex; align-items: center; gap: 10px; padding: 10px 0; color: var(--brand); font-size: 10px; }
.rule-line { flex: 1; height: 1px; background: var(--brand); }
.row { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.row.past { opacity: 0.5; }
.date { width: 52px; flex: none; font-size: 12px; font-weight: 600; color: var(--ink-3); }
.who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.name { font-weight: 600; white-space: nowrap; }
.leader { flex: 1; min-width: 20px; border-bottom: 1px dotted var(--line-strong); transform: translateY(-4px); }
.amount { width: 110px; flex: none; text-align: right; font-weight: 700; }
</style>
