<script setup lang="ts">
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import ServiceTile from '../components/ServiceTile.vue'
import { importCandidates, save, store } from '../lib/store'
import { decodeText, guessColumns, parseCsv, toTransactions, type ColumnMap, type Transaction } from '../lib/statement'
import { detectRecurring, type Candidate } from '../lib/recurring'
import { pdfRows } from '../lib/pdf'
import { sumInPrimary } from '../lib/fx'
import { CURRENCIES, formatMoney, monthlyMinor } from '../lib/money'
import { daysBetween, fromISO, today } from '../lib/dates'
import type { Subscription } from '../lib/types'

const emit = defineEmits<{ done: [] }>()

const step = ref<1 | 2 | 3>(1)
const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const rows = ref<string[][]>([])
const map = ref<ColumnMap | null>(null)
const currency = ref(store.settings.currency)
const busy = ref(false)
const error = ref('')
const adjusting = ref(false)
const candidates = ref<Candidate[]>([])
const selected = ref(new Set<string>())
const added = ref(0)

const transactions = computed<Transaction[]>(() => (map.value ? toTransactions(rows.value, map.value) : []))
const headers = computed(() => {
  const width = Math.max(0, ...rows.value.map((r) => r.length))
  const head = map.value && map.value.headerRow >= 0 ? rows.value[map.value.headerRow] : []
  return Array.from({ length: width }, (_, i) => head[i] || `Column ${i + 1}`)
})
const range = computed(() => {
  const dates = transactions.value.map((t) => t.date).sort()
  if (!dates.length) return ''
  const fmt = (d: string) => fromISO(d).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  return `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`
})
const months = computed(() => {
  const dates = transactions.value.map((t) => t.date).sort()
  return dates.length ? Math.max(1, Math.round(daysBetween(dates[0], dates[dates.length - 1]) / 30.4)) : 0
})
const fresh = computed(() => candidates.value.filter((c) => !c.trackedId))
const tracked = computed(() => candidates.value.filter((c) => c.trackedId))
const chosen = computed(() => fresh.value.filter((c) => selected.value.has(c.key)))

function asSubscription(c: Candidate): Subscription {
  return { amount_minor: c.amountMinor, currency: c.currency, interval_unit: c.unit, interval_count: c.intervalCount, share_count: 1 } as Subscription
}
const addsPerMonth = computed(() => {
  const items = chosen.value.map((c) => ({ minor: monthlyMinor(asSubscription(c)), currency: c.currency }))
  const converted = sumInPrimary(items)
  if (converted) return `${converted.approx ? '≈ ' : ''}${formatMoney(converted.minor, store.settings.currency)}`
  const byCurrency: Record<string, number> = {}
  for (const i of items) byCurrency[i.currency] = (byCurrency[i.currency] ?? 0) + i.minor
  return Object.entries(byCurrency).map(([c, v]) => formatMoney(v, c)).join(' + ') || formatMoney(0, store.settings.currency)
})

async function readRows(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer()
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'ods') return invoke<string[][]>('read_spreadsheet', new Uint8Array(buffer))
  if (ext === 'pdf') return pdfRows(buffer)
  return parseCsv(decodeText(buffer))
}

async function choose(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  error.value = ''
  busy.value = true
  try {
    rows.value = await readRows(file)
    map.value = guessColumns(rows.value)
    fileName.value = file.name
    adjusting.value = !transactions.value.length
    if (!transactions.value.length) error.value = "Couldn't find dated charges automatically. Pick the columns below."
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function findSubscriptions(): void {
  candidates.value = detectRecurring(transactions.value, store.subscriptions, currency.value, today())
  selected.value = new Set(candidates.value.filter((c) => !c.trackedId && c.confidence === 'sure').map((c) => c.key))
  rows.value = []
  step.value = 2
}

function toggle(key: string): void {
  const next = new Set(selected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selected.value = next
}

async function add(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    added.value = (await importCandidates(chosen.value)).length
    candidates.value = []
    step.value = 3
  } catch (err) {
    error.value = String(err)
  } finally {
    busy.value = false
  }
}

async function updatePrice(c: Candidate): Promise<void> {
  const sub = store.subscriptions.find((s) => s.id === c.trackedId)
  if (!sub) return
  await save({ ...sub, amount_minor: c.amountMinor })
  candidates.value = candidates.value.map((x) => (x.key === c.key ? { ...x, priceChanged: false } : x))
}

function restart(): void {
  step.value = 1
  fileName.value = ''
  map.value = null
  candidates.value = []
  error.value = ''
}
</script>

<template>
  <main class="page">
    <div class="head">
      <span class="caption">Step {{ step }} of 3 · {{ ['Choose a statement', 'Review', 'Done'][step - 1] }}</span>
      <h1 v-if="step === 1" class="figure-l">Import a bank statement</h1>
      <h1 v-else-if="step === 2" class="figure-l">
        {{ fresh.length ? `We found ${fresh.length} ${fresh.length === 1 ? 'subscription' : 'subscriptions'} you aren't tracking yet` : 'Nothing new to add' }}
      </h1>
      <h1 v-else class="figure-l">Added {{ added }} {{ added === 1 ? 'subscription' : 'subscriptions' }}</h1>
      <p v-if="step === 1" class="meta lead">
        CSV, Excel or PDF exports work. Subbrook looks for charges that repeat on a schedule. The file is read on this computer, never uploaded, and isn't kept.
      </p>
      <p v-else-if="step === 2" class="meta lead">
        From {{ months }} {{ months === 1 ? 'month' : 'months' }} of your statement, these charges repeat on a schedule. Untick anything that isn't a subscription.
      </p>
    </div>

    <input ref="fileInput" type="file" class="sr-only" accept=".csv,.txt,.xlsx,.xls,.xlsm,.ods,.pdf" aria-label="Statement file" @change="choose" />

    <section v-if="step === 1" class="stack">
      <div class="file card">
        <span class="file-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6" /></svg>
        </span>
        <div class="grow">
          <strong>{{ fileName || 'No file yet' }}</strong>
          <span class="meta">{{ fileName ? `${transactions.length} charges · ${range}` : 'Export your card or account statement from online banking.' }}</span>
        </div>
        <button class="btn" :disabled="busy" @click="fileInput?.click()">{{ busy ? 'Reading…' : fileName ? 'Change file' : 'Choose file' }}</button>
      </div>

      <template v-if="map && fileName">
        <button class="text-btn" :aria-expanded="adjusting" @click="adjusting = !adjusting">{{ adjusting ? 'Hide columns' : 'Check columns' }}</button>
        <div v-if="adjusting" class="columns">
          <label class="field">Date
            <select v-model.number="map.date" class="input"><option v-for="(h, i) in headers" :key="i" :value="i">{{ h }}</option></select>
          </label>
          <label class="field">Description
            <select v-model.number="map.description" class="input"><option v-for="(h, i) in headers" :key="i" :value="i">{{ h }}</option></select>
          </label>
          <label class="field">Amount
            <select v-model.number="map.amount" class="input"><option :value="-1">—</option><option v-for="(h, i) in headers" :key="i" :value="i">{{ h }}</option></select>
          </label>
          <label class="field">Debit column
            <select v-model.number="map.debit" class="input"><option :value="-1">None</option><option v-for="(h, i) in headers" :key="i" :value="i">{{ h }}</option></select>
          </label>
          <label class="field">Charges are
            <select v-model="map.chargesNegative" class="input"><option :value="false">positive</option><option :value="true">negative</option></select>
          </label>
          <label class="field">Currency
            <select v-model.number="map.currency" class="input"><option :value="-1">All in…</option><option v-for="(h, i) in headers" :key="i" :value="i">{{ h }}</option></select>
          </label>
          <label v-if="map.currency < 0" class="field">Statement currency
            <select v-model="currency" class="input"><option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option></select>
          </label>
        </div>
        <div v-if="transactions.length" class="preview">
          <span class="caption">First charges</span>
          <div v-for="(t, i) in transactions.slice(0, 5)" :key="i" class="line">
            <span class="quiet date">{{ t.date }}</span>
            <span class="grow ellipsis">{{ t.description }}</span>
            <strong>{{ formatMoney(t.amountMinor, t.currency ?? currency) }}</strong>
          </div>
        </div>
      </template>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button class="btn btn-primary" :disabled="!transactions.length" @click="findSubscriptions">Find subscriptions</button>
      </div>
    </section>

    <section v-else-if="step === 2" class="stack">
      <div>
        <div v-for="c in fresh" :key="c.key" class="row" :class="{ off: !selected.has(c.key) }">
          <button class="box" :aria-pressed="selected.has(c.key)" :aria-label="`${selected.has(c.key) ? 'Exclude' : 'Include'} ${c.name}`" @click="toggle(c.key)">{{ selected.has(c.key) ? '✓' : '' }}</button>
          <ServiceTile :name="c.name" :color="store.categories.find((x) => x.name === c.category)?.color" :size="36" />
          <span class="grow">
            <strong>{{ c.name }}</strong>
            <span class="meta ellipsis">{{ c.raw }} · {{ c.pattern }}</span>
          </span>
          <span class="badge" :class="c.confidence === 'sure' ? 'badge-paid' : 'badge-rise'">{{ c.confidence === 'sure' ? 'Sure' : 'Maybe' }}</span>
          <strong class="amount">{{ formatMoney(c.amountMinor, c.currency) }}</strong>
        </div>
        <p v-if="!fresh.length" class="meta">No repeating charges that you aren't already tracking. Statements with three or more months find more.</p>
      </div>

      <div v-if="tracked.length" class="tracked">
        <span class="caption">Already tracked</span>
        <div v-for="c in tracked" :key="c.key" class="row">
          <ServiceTile :name="c.name" :color="store.categories.find((x) => x.name === c.category)?.color" :size="36" />
          <span class="grow"><strong>{{ c.name }}</strong><span class="meta">{{ c.pattern }}</span></span>
          <template v-if="c.priceChanged">
            <span class="badge badge-rise">Price changed</span>
            <button class="btn" @click="updatePrice(c)">Update to {{ formatMoney(c.amountMinor, c.currency) }}</button>
          </template>
          <span v-else class="badge badge-muted">Up to date</span>
        </div>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button class="btn" @click="restart">Start over</button>
        <span class="meta push">Adds <strong>{{ addsPerMonth }}</strong> per month to your total</span>
        <button class="btn btn-primary" :disabled="!chosen.length || busy" @click="add">Add {{ chosen.length }} {{ chosen.length === 1 ? 'subscription' : 'subscriptions' }}</button>
      </div>
    </section>

    <section v-else class="stack">
      <p class="meta lead">Past charges from the statement are in each subscription's payment history. Check the dates and prices once — statements don't say when a plan renews.</p>
      <div class="actions">
        <button class="btn" @click="restart">Import another</button>
        <button class="btn btn-primary" @click="emit('done')">See subscriptions</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page { width: 100%; max-width: 920px; margin: 0 auto; padding: 48px 48px 64px; display: flex; flex-direction: column; gap: 28px; }
.head { display: flex; flex-direction: column; gap: 10px; }
.head h1 { margin: 0; }
.lead { margin: 0; max-width: 620px; line-height: 1.55; }
.stack { display: flex; flex-direction: column; gap: 18px; }
.file { display: flex; align-items: center; gap: 14px; padding: 14px 18px; flex-wrap: wrap; }
.file-icon { width: 36px; height: 36px; border-radius: 12px; background: var(--sunken); color: var(--ink-2); display: flex; align-items: center; justify-content: center; }
.grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.text-btn { align-self: flex-start; border: 0; background: transparent; padding: 0; color: var(--brand); font-size: 13px; font-weight: 700; cursor: pointer; }
.columns { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.field { font-size: 12px; font-weight: 700; color: var(--ink-2); }
.preview { display: flex; flex-direction: column; }
.line { display: flex; align-items: center; gap: 14px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.line .grow { display: block; }
.date { width: 90px; flex: none; }
.row { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-top: 1px solid var(--line); }
.row.off { opacity: 0.5; }
.box { width: 24px; height: 24px; flex: none; border-radius: 8px; border: 1.5px solid var(--line-strong); background: transparent; color: transparent; font-size: 13px; font-weight: 700; cursor: pointer; padding: 0; }
.box[aria-pressed='true'] { border: 0; background: var(--primary); color: var(--on-primary); }
.amount { width: 110px; text-align: right; }
.tracked { display: flex; flex-direction: column; }
.tracked .caption { padding-bottom: 8px; }
.actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 8px; }
.actions .btn-primary { margin-left: auto; }
.push { margin-left: auto; }
.push + .btn-primary { margin-left: 0; }
.error { margin: 0; color: var(--rise); font-weight: 600; }
</style>
