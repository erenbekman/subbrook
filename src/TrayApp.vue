<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import ServiceTile from './components/ServiceTile.vue'
import { load, store } from './lib/store'
import { useMonth } from './lib/month'
import { applyTheme } from './lib/theme'
import { fromISO, nextChargeOnOrAfter, relativeDay, today } from './lib/dates'
import { formatMoney, shareMinor, splitDecimals } from './lib/money'
import type { Subscription } from './lib/types'

const t = today()
const now = fromISO(t)
const { totals } = useMonth(ref(now.getFullYear()), ref(now.getMonth()))

const currency = computed(() => (totals.value.converted ? store.settings.currency : Object.keys(totals.value.all)[0] ?? store.settings.currency))
const allMinor = computed(() => totals.value.converted?.all.minor ?? totals.value.all[currency.value] ?? 0)
const paidMinor = computed(() => totals.value.converted?.paid.minor ?? totals.value.paid[currency.value] ?? 0)
const left = computed(() => splitDecimals(formatMoney(allMinor.value - paidMinor.value, currency.value)))
const monthName = now.toLocaleDateString(undefined, { month: 'long' })
const todayLabel = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })

const active = computed(() => store.subscriptions.filter((s) => s.status === 'active'))
const trial = computed(() =>
  active.value.filter((s) => s.trial_ends && s.trial_ends >= t).sort((a, b) => a.trial_ends!.localeCompare(b.trial_ends!))[0] ?? null)
const nextUp = computed(() =>
  active.value
    .map((sub) => ({ sub, date: nextChargeOnOrAfter(sub, t) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.sub.name.localeCompare(b.sub.name))
    .slice(0, 6))

function cycle(s: Subscription): string {
  return s.interval_count === 1 ? s.interval_unit : `${s.interval_count} ${s.interval_unit}s`
}
function when(date: string): string {
  return `${fromISO(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${relativeDay(date, t)}`
}

function open(subscriptionId?: number): void {
  invoke('open_main', { subscriptionId: subscriptionId ?? null })
}
function quit(): void {
  invoke('quit')
}

function onFocus(): void {
  if (today() !== t) { location.reload(); return }
  applyTheme()
  load()
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') getCurrentWindow().hide()
}

onMounted(() => {
  load()
  window.addEventListener('focus', onFocus)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', onFocus)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="tray">
    <header class="top">
      <div class="caption-row"><span class="caption">Left in {{ monthName }}</span><span class="caption">{{ todayLabel }}</span></div>
      <div class="figure">{{ left[0] }}<span class="quiet">{{ left[1] }}</span></div>
      <div class="bar" role="img" :aria-label="`${formatMoney(paidMinor, currency)} paid this month`">
        <div class="paid" :style="{ flexGrow: Math.max(paidMinor, 0) }" />
        <div class="rest" :style="{ flexGrow: Math.max(allMinor - paidMinor, allMinor ? 0 : 1) }" />
      </div>
    </header>

    <section v-if="trial" class="trial" aria-label="Trial ending">
      <ServiceTile :name="trial.name" :color="trial.category_color" :size="34" trial />
      <div class="grow">
        <strong>{{ trial.name }} trial ends {{ relativeDay(trial.trial_ends!, t) }}</strong>
        <span class="meta">Then {{ formatMoney(shareMinor(trial), trial.currency) }}/{{ cycle(trial) }}</span>
      </div>
      <a v-if="trial.cancel_url" :href="trial.cancel_url" @click.prevent="openUrl(trial.cancel_url)">Cancel</a>
    </section>

    <h2 class="caption heading-pad">Next up</h2>
    <div class="list">
      <button v-for="n in nextUp" :key="n.sub.id" class="row" @click="open(n.sub.id)">
        <ServiceTile :name="n.sub.name" :color="n.sub.category_color" :size="34" />
        <span class="grow">
          <strong>{{ n.sub.name }}</strong>
          <span class="meta">{{ when(n.date) }}{{ n.sub.share_count > 1 ? ' · your share' : '' }}</span>
        </span>
        <strong>{{ formatMoney(shareMinor(n.sub), n.sub.currency) }}</strong>
      </button>
      <p v-if="store.ready && !nextUp.length" class="meta empty">{{ store.subscriptions.length ? 'Nothing coming up.' : 'Add your first subscription in Subbrook.' }}</p>
    </div>

    <footer class="foot">
      <button class="link" @click="open()">Open Subbrook</button>
      <button class="link quiet push" @click="quit">Quit</button>
    </footer>
  </div>
</template>

<style scoped>
.tray { height: 100vh; display: flex; flex-direction: column; overflow: hidden; background: var(--paper); }
.top { padding: 22px 22px 16px; display: flex; flex-direction: column; gap: 8px; }
.caption-row { display: flex; justify-content: space-between; }
.figure { font-size: 40px; line-height: 1; font-weight: 300; letter-spacing: -0.04em; }
.bar { display: flex; gap: 3px; height: 6px; margin-top: 6px; }
.bar .paid { background: var(--mint); border-radius: 3px; }
.bar .rest { border: 1.5px solid var(--line-strong); border-radius: 3px; }
.trial { margin: 0 14px; padding: 14px; border-radius: var(--radius-md); background: var(--trial-soft); display: flex; align-items: center; gap: 12px; }
.trial strong { font-size: 13px; }
.trial a { font-size: 12px; font-weight: 700; color: var(--trial); }
.grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.grow strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { font-size: 12px; }
.heading-pad { margin: 0; padding: 18px 22px 6px; }
.list { flex: 1; overflow: auto; padding: 0 8px; }
.row { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; }
.row:hover, .row:focus-visible { background: var(--sunken); }
.empty { padding: 9px 14px; margin: 0; }
.foot { padding: 12px 20px 14px; border-top: 1px solid var(--line); display: flex; align-items: center; }
.link { border: 0; background: transparent; padding: 0; font-size: 12px; font-weight: 700; color: var(--brand); cursor: pointer; }
.link.quiet { color: var(--ink-3); }
.push { margin-left: auto; }
</style>
