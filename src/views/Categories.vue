<script setup lang="ts">
import { computed } from 'vue'
import { store } from '../lib/store'
import { formatMoney, monthlyMinor } from '../lib/money'
import { sumInPrimary } from '../lib/fx'
import ServiceTile from '../components/ServiceTile.vue'
import type { Subscription } from '../lib/types'

const emit = defineEmits<{ add: []; open: [id: number] }>()

// Monthly cost per category, converted to the primary currency when rates exist; otherwise in the leading currency.
const groups = computed(() => {
  const active = store.subscriptions.filter((s) => s.status === 'active')
  const rows = store.categories.map((c) => ({ id: c.id as number | null, name: c.name, color: c.color, subs: active.filter((s) => s.category_id === c.id) }))
  const none = active.filter((s) => s.category_id === null)
  if (none.length) rows.push({ id: null, name: 'Uncategorized', color: 'cat-1', subs: none })
  return rows.filter((r) => r.subs.length).map((r) => ({
    ...r,
    totals: totalsOf(r.subs),
    converted: sumInPrimary(r.subs.map((s) => ({ minor: monthlyMinor(s), currency: s.currency }))),
  }))
})
type Group = (typeof groups.value)[number]
const convertible = computed(() => groups.value.every((g) => g.converted))

function totalsOf(subs: Subscription[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of subs) out[s.currency] = (out[s.currency] ?? 0) + monthlyMinor(s)
  return out
}

const lead = computed(() => {
  if (convertible.value) return [store.settings.currency, groups.value.reduce((a, g) => a + g.converted!.minor, 0)] as [string, number]
  const all: Record<string, number> = {}
  for (const g of groups.value) for (const [c, v] of Object.entries(g.totals)) all[c] = (all[c] ?? 0) + v
  if (all[store.settings.currency]) return [store.settings.currency, all[store.settings.currency]] as [string, number]
  return Object.entries(all).sort((a, b) => b[1] - a[1])[0] ?? [store.settings.currency, 0]
})
const valueOf = (g: Group) => (convertible.value ? g.converted!.minor : g.totals[lead.value[0]] ?? 0)
const share = (g: Group) => (lead.value[1] ? Math.round((valueOf(g) / lead.value[1]) * 100) : 0)
function label(g: Group): string {
  if (convertible.value && g.converted) return `${g.converted.approx ? '≈ ' : ''}${formatMoney(g.converted.minor, store.settings.currency)}`
  return Object.entries(g.totals).map(([c, v]) => formatMoney(v, c)).join(' + ')
}
</script>

<template>
  <main class="page">
    <div class="head">
      <span class="caption">{{ groups.length }} categories · per month</span>
      <h1 class="title">Categories</h1>
    </div>

    <div v-if="lead[1]" class="bar" role="img" aria-label="Share of monthly spend by category">
      <div v-for="g in groups" :key="g.name" class="bar-seg" :style="{ flexGrow: Math.max(1, valueOf(g)), background: `var(--${g.color})` }">
        <span v-if="share(g) >= 6">{{ share(g) }}%</span>
      </div>
    </div>

    <section v-for="g in groups" :key="g.name" class="row">
      <div class="name">
        <span class="swatch" :style="{ background: `var(--${g.color})` }" />
        <div>
          <h2 class="heading">{{ g.name }}</h2>
          <span class="meta">{{ g.subs.length }} {{ g.subs.length === 1 ? 'subscription' : 'subscriptions' }} · {{ share(g) }}% of spend</span>
        </div>
      </div>
      <div class="chips">
        <button v-for="s in g.subs" :key="s.id" class="chip" @click="emit('open', s.id)">
          <ServiceTile :name="s.name" :color="g.color" :size="28" />{{ s.name }}
        </button>
      </div>
      <div class="total figure-l">{{ label(g) }}</div>
    </section>

    <div v-if="!groups.length" class="empty-note">
      <p v-if="store.subscriptions.length" class="meta">Nothing active right now. Paused and cancelled subscriptions aren't counted.</p>
      <template v-else>
        <p class="meta">Add subscriptions to see where your money goes.</p>
        <button class="btn btn-primary" @click="emit('add')">Add subscription</button>
      </template>
    </div>
  </main>
</template>

<style scoped>
.page { width: 100%; max-width: 1180px; margin: 0 auto; padding: 48px 48px 64px; display: flex; flex-direction: column; gap: 28px; }
.head { display: flex; flex-direction: column; gap: 8px; }
.bar { display: flex; gap: 4px; height: 40px; }
.bar-seg { min-width: 28px; flex-basis: 0; border-radius: 10px; display: flex; align-items: center; padding: 0 12px; overflow: hidden; }
.bar-seg span { font-size: 12px; font-weight: 700; color: var(--paper); }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 32px; padding: 22px 0; border-top: 1px solid var(--line); }
.name { flex: 1 1 260px; display: flex; align-items: center; gap: 14px; }
.swatch { width: 14px; height: 14px; border-radius: 5px; flex: none; }
.chips { flex: 2 1 320px; display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px 0 4px; border: 0; border-radius: var(--radius-pill); background: var(--surface); box-shadow: 0 1px 2px rgba(9, 20, 19, 0.06); font-size: 13px; font-weight: 600; cursor: pointer; }
.empty-note { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; padding-top: 22px; border-top: 1px solid var(--line); }
.empty-note .meta { margin: 0; }
.total { flex: 0 0 auto; min-width: 160px; text-align: right; font-size: 28px; }
</style>
