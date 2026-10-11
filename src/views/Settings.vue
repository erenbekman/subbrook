<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { saveSetting, store } from '../lib/store'
import { CURRENCIES } from '../lib/money'
import { fromISO } from '../lib/dates'
import { latestRates, refreshRates } from '../lib/fx'
import { notificationsAllowed } from '../lib/notify'
import { exportFile } from '../lib/export'
import { getTheme, setTheme, type ThemeChoice } from '../lib/theme'

const emit = defineEmits<{ import: [] }>()

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
]

const theme = ref<ThemeChoice>(getTheme())
const days = ref(store.settings.reminder_days)
const time = ref(store.settings.reminder_time)
const error = ref('')

watch(() => store.settings, (s) => {
  days.value = s.reminder_days
  time.value = s.reminder_time
})

function pickTheme(choice: ThemeChoice): void {
  setTheme(choice)
  theme.value = choice
}

async function commit(action: () => Promise<void>): Promise<void> {
  error.value = ''
  try {
    await action()
  } catch (e) {
    error.value = String(e)
  }
}

function saveCurrency(e: Event): void {
  commit(() => saveSetting('currency', (e.target as HTMLSelectElement).value))
}

function saveDays(): void {
  const n = Math.round(Number(days.value))
  if (!Number.isFinite(n)) { days.value = store.settings.reminder_days; return }
  days.value = Math.min(30, Math.max(0, n))
  commit(() => saveSetting('reminder_days', days.value))
}

const fxBusy = ref(false)
const fxStatus = ref('')
const ratesLabel = computed(() => {
  const fmt = (d: string | null) => (d ? fromISO(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'never')
  return `TCMB ${fmt(latestRates.value.tcmb)} · ECB ${fmt(latestRates.value.ecb)}`
})

async function updateRates(): Promise<void> {
  fxBusy.value = true
  fxStatus.value = ''
  try {
    fxStatus.value = (await refreshRates(true)) ?? 'Rates are up to date.'
  } catch (e) {
    fxStatus.value = String(e)
  } finally {
    fxBusy.value = false
  }
}

const exportStatus = ref('')

async function saveExport(kind: 'csv' | 'ics'): Promise<void> {
  exportStatus.value = ''
  try {
    if (await exportFile(kind)) exportStatus.value = kind === 'csv' ? 'CSV saved.' : 'Calendar file saved. Open it to add the events to your calendar.'
  } catch (e) {
    exportStatus.value = String(e)
  }
}

const notifyStatus = ref('')
const launchAtLogin = ref(false)

async function toggleNotifications(e: Event): Promise<void> {
  const on = (e.target as HTMLInputElement).checked
  notifyStatus.value = ''
  await commit(() => saveSetting('notifications', on))
  if (on && !(await notificationsAllowed(true))) {
    notifyStatus.value = 'Notifications are turned off for Subbrook in System Settings › Notifications.'
  }
}

async function toggleLaunch(e: Event): Promise<void> {
  const on = (e.target as HTMLInputElement).checked
  await commit(async () => { await (on ? enable() : disable()) })
  launchAtLogin.value = await isEnabled()
}

onMounted(async () => {
  launchAtLogin.value = await isEnabled()
  if (store.settings.notifications && !(await notificationsAllowed(false))) {
    notifyStatus.value = 'Not allowed yet. Subbrook will ask the first time a reminder is due.'
  }
})

function saveTime(): void {
  if (!/^\d{2}:\d{2}$/.test(time.value)) { time.value = store.settings.reminder_time; return }
  commit(() => saveSetting('reminder_time', time.value))
}
</script>

<template>
  <main class="page">
    <h1 class="title">Settings</h1>

    <section class="row" aria-labelledby="set-theme">
      <div class="label">
        <h2 id="set-theme" class="heading">Appearance</h2>
        <span class="meta">Follow the system, or keep one look.</span>
      </div>
      <div class="segmented" role="radiogroup" aria-labelledby="set-theme">
        <button v-for="o in THEMES" :key="o.value" role="radio" :aria-checked="theme === o.value" @click="pickTheme(o.value)">{{ o.label }}</button>
      </div>
    </section>

    <section class="row" aria-labelledby="set-currency">
      <div class="label">
        <h2 id="set-currency" class="heading">Primary currency</h2>
        <span class="meta">Leads your totals and is the default for new subscriptions. Other currencies are listed beside it, not converted.</span>
      </div>
      <select class="input" :value="store.settings.currency" aria-labelledby="set-currency" @change="saveCurrency">
        <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
      </select>
    </section>

    <section class="row" aria-labelledby="set-reminders">
      <div class="label">
        <h2 id="set-reminders" class="heading">Reminders</h2>
        <span class="meta">Default for new subscriptions. Each subscription keeps its own.</span>
      </div>
      <div class="reminder">
        <input v-model.number="days" class="input days" type="number" min="0" max="30" aria-label="Days before the charge" @change="saveDays" />
        <span class="meta">days before, at</span>
        <input v-model="time" class="input" type="time" aria-label="Reminder time" @change="saveTime" />
      </div>
    </section>

    <section class="row" aria-labelledby="set-notify">
      <div class="label">
        <h2 id="set-notify" class="heading">Notifications</h2>
        <span class="meta">A reminder before each renewal and trial end. Subbrook keeps running in the menu bar so they arrive on time.</span>
        <span v-if="notifyStatus" class="meta warn">{{ notifyStatus }}</span>
      </div>
      <label class="check"><input type="checkbox" :checked="store.settings.notifications" @change="toggleNotifications" /> Remind me</label>
    </section>

    <section class="row" aria-labelledby="set-login">
      <div class="label">
        <h2 id="set-login" class="heading">Open at login</h2>
        <span class="meta">Starts quietly in the menu bar, so reminders work after a restart.</span>
      </div>
      <label class="check"><input type="checkbox" :checked="launchAtLogin" @change="toggleLaunch" /> Open at login</label>
    </section>

    <section class="row" aria-labelledby="set-fx">
      <div class="label">
        <h2 id="set-fx" class="heading">Exchange rates</h2>
        <span class="meta">Totals in other currencies are converted with TCMB rates for lira, ECB otherwise. Subbrook only goes online for this, and only when you track more than one currency.</span>
        <span class="meta quiet">Last rates: {{ ratesLabel }}</span>
        <span v-if="fxStatus" class="meta" role="status">{{ fxStatus }}</span>
      </div>
      <button class="btn" :disabled="fxBusy" @click="updateRates">{{ fxBusy ? 'Updating…' : 'Update now' }}</button>
    </section>

    <section class="row" aria-labelledby="set-data">
      <div class="label">
        <h2 id="set-data" class="heading">Your data</h2>
        <span class="meta">Import a bank statement, or take your subscriptions elsewhere. The calendar file is a one-time snapshot — export it again after changes.</span>
        <span v-if="exportStatus" class="meta" role="status">{{ exportStatus }}</span>
      </div>
      <div class="data-actions">
        <button class="btn" @click="emit('import')">Import statement</button>
        <button class="btn" @click="saveExport('csv')">Export CSV</button>
        <button class="btn" @click="saveExport('ics')">Export calendar</button>
      </div>
    </section>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </main>
</template>

<style scoped>
.page { width: 100%; max-width: 880px; margin: 0 auto; padding: 48px 48px 64px; display: flex; flex-direction: column; gap: 28px; }
.row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px 32px; padding: 22px 0; border-top: 1px solid var(--line); }
.label { flex: 1 1 320px; display: flex; flex-direction: column; gap: 4px; }
.reminder { display: flex; align-items: center; gap: 10px; }
.days { width: 72px; }
.error { margin: 0; color: var(--rise); font-weight: 600; }
.data-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.check { display: flex; align-items: center; gap: 8px; font-weight: 600; white-space: nowrap; }
.warn { color: var(--rise); }
</style>
