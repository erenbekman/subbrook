<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Dock, { type View } from './components/Dock.vue'
import SubscriptionSheet from './components/SubscriptionSheet.vue'
import CommandPalette, { type Command } from './components/CommandPalette.vue'
import ShareSheet from './components/ShareSheet.vue'
import Overview from './views/Overview.vue'
import CalendarView from './views/CalendarView.vue'
import Subscriptions from './views/Subscriptions.vue'
import Categories from './views/Categories.vue'
import Settings from './views/Settings.vue'
import Onboarding from './views/Onboarding.vue'
import Import from './views/Import.vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { load, saveSetting, store } from './lib/store'
import { refreshRates } from './lib/fx'
import { exportFile } from './lib/export'
import { checkReminders } from './lib/notify'
import { today } from './lib/dates'
import type { Subscription } from './lib/types'

const view = ref<View>('overview')
const sheetOpen = ref(false)
const editing = ref<Subscription | null>(null)
const selectedId = ref<number | null>(null)
const onboarding = computed(() => store.ready && !store.error && !store.settings.onboarded && store.subscriptions.length === 0)

function openNew(): void {
  editing.value = null
  sheetOpen.value = true
}
function openEdit(sub: Subscription): void {
  editing.value = sub
  sheetOpen.value = true
}
function showSubscription(id: number): void {
  selectedId.value = id
  view.value = 'subscriptions'
}
function onSaved(id: number): void {
  sheetOpen.value = false
  selectedId.value = id
  if (!store.settings.onboarded) saveSetting('onboarded', true)
}

const views: View[] = ['overview', 'calendar', 'subscriptions', 'categories']
const VIEW_LABELS: Record<View, string> = { overview: 'Overview', calendar: 'Calendar', subscriptions: 'Subscriptions', categories: 'Categories', settings: 'Settings', import: 'Import' }
const paletteOpen = ref(false)
const shareOpen = ref(false)

const commands = computed<Command[]>(() => [
  { id: 'new', label: 'New subscription', hint: '⌘N', run: openNew },
  ...views.map((v, i) => ({ id: `view-${v}`, label: `Go to ${VIEW_LABELS[v]}`, hint: `⌘${i + 1}`, run: () => { view.value = v } })),
  { id: 'view-settings', label: 'Open Settings', hint: '⌘,', run: () => { view.value = 'settings' } },
  { id: 'import', label: 'Import bank statement', hint: 'CSV, Excel, PDF', run: () => { view.value = 'import' } },
  { id: 'share', label: 'Share as image', hint: 'Poster or receipt', run: () => { shareOpen.value = true } },
  { id: 'export-csv', label: 'Export subscriptions as CSV', hint: 'Export', run: () => { exportFile('csv') } },
  { id: 'export-ics', label: 'Export calendar (.ics)', hint: 'Export', run: () => { exportFile('ics') } },
  ...store.subscriptions.map((s) => ({ id: `sub-${s.id}`, label: s.name, hint: s.category_name ?? 'Subscription', run: () => showSubscription(s.id) })),
])

function onKey(e: KeyboardEvent): void {
  if (!(e.metaKey || e.ctrlKey) || sheetOpen.value || shareOpen.value || onboarding.value) return
  if (e.key === 'k') { paletteOpen.value = !paletteOpen.value; e.preventDefault(); return }
  if (paletteOpen.value) return
  const n = Number(e.key)
  if (n >= 1 && n <= 4) { view.value = views[n - 1]; e.preventDefault() }
  if (e.key === 'n') { openNew(); e.preventDefault() }
  if (e.key === ',') { view.value = 'settings'; e.preventDefault() }
}

const day = ref(today())
let timer = 0
let unlisten: UnlistenFn | null = null

async function refresh(): Promise<void> {
  await load()
  day.value = today()
  refreshRates()
  checkReminders()
}

function tick(): void {
  if (today() !== day.value) { refresh(); return }
  refreshRates()
  checkReminders()
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('focus', refresh)
  timer = window.setInterval(tick, 60_000)
  refresh()
  unlisten = await listen<number>('open-subscription', (e) => showSubscription(e.payload))
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('focus', refresh)
  window.clearInterval(timer)
  unlisten?.()
})
</script>

<template>
  <div class="app">
    <header class="titlebar" data-tauri-drag-region>
      <Dock v-if="!onboarding" v-model="view" @add="openNew" @search="paletteOpen = true" />
    </header>

    <p v-if="store.error" class="error" role="alert">Subbrook couldn't open its database: {{ store.error }}</p>

    <div v-if="store.ready" :key="day" class="views">
      <Onboarding v-if="onboarding" @add="openNew" @done="view = 'overview'" />
      <Overview v-else-if="view === 'overview'" @add="openNew" @import="view = 'import'" @share="shareOpen = true" @open="showSubscription" />
      <CalendarView v-else-if="view === 'calendar'" @add="openNew" @open="showSubscription" />
      <Subscriptions v-else-if="view === 'subscriptions'" v-model:selected="selectedId" @add="openNew" @import="view = 'import'" @edit="openEdit" />
      <Categories v-else-if="view === 'categories'" @add="openNew" @open="showSubscription" />
      <Import v-else-if="view === 'import'" @done="view = 'subscriptions'" />
      <Settings v-else @import="view = 'import'" />
    </div>

    <ShareSheet v-if="shareOpen" @close="shareOpen = false" />
    <CommandPalette v-if="paletteOpen" :commands="commands" @close="paletteOpen = false" />
    <SubscriptionSheet v-if="sheetOpen" :subscription="editing" @close="sheetOpen = false" @saved="onSaved" />
  </div>
</template>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; }
.titlebar { display: flex; justify-content: center; min-height: 62px; padding: 14px 24px 0; position: sticky; top: 0; z-index: 10; }
.views { display: contents; }
.error { margin: 24px auto 0; max-width: 720px; padding: 12px 16px; border-radius: var(--radius-md); background: var(--rise-soft); color: var(--rise); font-weight: 600; }
</style>
