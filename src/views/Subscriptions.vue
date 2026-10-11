<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import { addTag, markPayment, paymentFor, removeTag, setStatus, store } from '../lib/store'
import { listPriceChanges, type PriceChange } from '../lib/db'
import { addInterval, daysBetween, fromISO, nextChargeOnOrAfter, relativeDay, today } from '../lib/dates'
import { formatMoney, monthlyMinor, shareMinor } from '../lib/money'
import { convert } from '../lib/fx'
import ServiceTile from '../components/ServiceTile.vue'
import type { PaymentStatus, Subscription } from '../lib/types'

const selected = defineModel<number | null>('selected', { default: null })
const emit = defineEmits<{ add: []; import: []; edit: [sub: Subscription] }>()

const t = today()
const STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'paid', label: 'Paid' }, { value: 'skipped', label: 'Skipped' }, { value: 'refunded', label: 'Refunded' },
]
const query = ref('')
const filter = ref<'all' | 'trials' | 'shared' | 'paused'>('all')
const tab = ref<'overview' | 'payments' | 'notes'>('overview')
const methodFilter = ref<number | null>(null)
const tagFilter = ref<number | null>(null)

watch(() => store.paymentMethods, (list) => {
  if (methodFilter.value !== null && !list.some((m) => m.id === methodFilter.value)) methodFilter.value = null
})
watch(() => store.tags, (list) => {
  if (tagFilter.value !== null && !list.some((t) => t.id === tagFilter.value)) tagFilter.value = null
})

const filtered = computed(() => !!query.value.trim() || filter.value !== 'all' || methodFilter.value !== null || tagFilter.value !== null)

function clearFilters(): void {
  query.value = ''
  filter.value = 'all'
  methodFilter.value = null
  tagFilter.value = null
}

function matches(s: Subscription, q: string): boolean {
  return [s.name, s.category_name ?? '', ...s.tags.map((t) => t.name)].some((v) => v.toLocaleLowerCase().includes(q))
}

const list = computed(() => {
  const q = query.value.trim().toLocaleLowerCase().replace(/^#/, '')
  return store.subscriptions.filter((s) => {
    if (q && !matches(s, q)) return false
    if (methodFilter.value !== null && s.payment_method_id !== methodFilter.value) return false
    if (tagFilter.value !== null && !s.tags.some((t) => t.id === tagFilter.value)) return false
    if (filter.value === 'trials') return !!s.trial_ends && s.trial_ends >= t
    if (filter.value === 'shared') return s.share_count > 1
    if (filter.value === 'paused') return s.status === 'paused'
    return s.status !== 'cancelled'
  })
})

const current = computed(() => store.subscriptions.find((s) => s.id === selected.value) ?? list.value[0] ?? null)
const addingTag = ref(false)
const tagText = ref('')
const tagInput = ref<HTMLInputElement | null>(null)
watch(current, () => { tab.value = 'overview'; addingTag.value = false })
const suggestions = computed(() => store.tags.filter((t) => !current.value?.tags.some((x) => x.id === t.id)))

async function startTag(): Promise<void> {
  tagText.value = ''
  addingTag.value = true
  await nextTick()
  tagInput.value?.focus()
}

async function commitTag(): Promise<void> {
  const text = tagText.value
  tagText.value = ''
  if (current.value && text.trim()) await addTag(current.value.id, text)
}

function cancelTag(): void {
  tagText.value = ''
  addingTag.value = false
}

async function blurTag(): Promise<void> {
  await commitTag()
  addingTag.value = false
}

function cycleLabel(s: Subscription): string {
  const unit = s.interval_unit
  if (s.interval_count === 1) return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[unit]
  return `Every ${s.interval_count} ${unit}s`
}

const next = computed(() => (current.value ? nextChargeOnOrAfter(current.value, t) : t))
const nextThree = computed(() => {
  if (!current.value) return []
  const s = current.value
  const out = [next.value]
  while (out.length < 3) out.push(addInterval(out[out.length - 1], s.interval_unit, s.interval_count))
  return out
})

const history = computed(() => (current.value ? store.payments.filter((p) => p.subscription_id === current.value!.id).slice(0, 24) : []))

const prices = ref<PriceChange[]>([])
watch(() => current.value?.id, async (id) => {
  prices.value = id ? await listPriceChanges(id).catch(() => []) : []
}, { immediate: true })

const facts = computed(() => {
  const s = current.value
  if (!s) return []
  const months = Math.max(0, Math.floor(daysBetween(s.start_date, t) / 30.4375))
  return [
    ['Billing', cycleLabel(s)],
    ['Next payment', fromISO(next.value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })],
    ['Started', fromISO(s.start_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })],
    ['Per month', perMonth(s)],
    ['Shared by', s.share_count > 1 ? `${s.share_count} people` : 'Just you'],
    ['Pays with', s.payment_method_name ?? '—'],
    ['Reminder', `${s.reminder_days} days before · ${s.reminder_time}`],
    ['Website', s.website || '—'],
    ['Active for', months ? `${months} months` : 'less than a month'],
  ]
})

function perMonth(s: Subscription): string {
  const own = formatMoney(monthlyMinor(s), s.currency)
  if (s.currency === store.settings.currency) return own
  const converted = convert(monthlyMinor(s), s.currency, store.settings.currency)
  return converted === null ? own : `${own} · ≈ ${formatMoney(converted, store.settings.currency)}`
}

const perUse = computed(() => {
  const s = current.value
  if (!s?.usage_per_month) return null
  return formatMoney(Math.round(monthlyMinor(s) / s.usage_per_month), s.currency)
})
</script>

<template>
  <div class="layout">
    <main class="page">
      <section class="list-col" aria-labelledby="subs-title">
        <div class="head">
          <h1 id="subs-title" class="title">Subscriptions</h1>
          <span class="quiet">{{ store.subscriptions.filter((s) => s.status === 'active').length }} active</span>
          <button class="btn push" @click="emit('import')">Import</button>
          <button class="btn btn-primary" @click="emit('add')">Add</button>
        </div>
        <template v-if="store.subscriptions.length">
          <label class="sr-only" for="q">Search subscriptions</label>
          <input id="q" v-model="query" class="input" placeholder="Search" />
          <div class="filters">
            <button v-for="f in (['all', 'trials', 'shared', 'paused'] as const)" :key="f" class="pill" :class="{ on: filter === f }" @click="filter = f">
              {{ f[0].toUpperCase() + f.slice(1) }}
            </button>
            <label v-if="store.paymentMethods.length" class="pill select-pill" :class="{ on: methodFilter !== null }">
              <span class="sr-only">Filter by payment method</span>
              <select v-model="methodFilter">
                <option :value="null">Payment method</option>
                <option v-for="m in store.paymentMethods" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
            </label>
            <label v-if="store.tags.length" class="pill select-pill" :class="{ on: tagFilter !== null }">
              <span class="sr-only">Filter by tag</span>
              <select v-model="tagFilter">
                <option :value="null">Tag</option>
                <option v-for="tg in store.tags" :key="tg.id" :value="tg.id">#{{ tg.name }}</option>
              </select>
            </label>
          </div>
        </template>
        <div>
          <button v-for="s in list" :key="s.id" class="item" :class="{ on: current?.id === s.id }" @click="selected = s.id">
            <ServiceTile :name="s.name" :color="s.category_color" :trial="!!s.trial_ends && s.trial_ends >= t" />
            <span class="who">
              <strong>{{ s.name }}</strong>
              <span class="meta">{{ s.status === 'paused' ? 'Paused' : cycleLabel(s) }} · {{ relativeDay(nextChargeOnOrAfter(s, t)) }}</span>
            </span>
            <strong>{{ formatMoney(s.amount_minor, s.currency) }}</strong>
          </button>
          <div v-if="!store.subscriptions.length" class="empty-note">
            <strong>No subscriptions yet</strong>
            <span class="meta">Add one and it shows up here with its next charge, price history and notes.</span>
          </div>
          <p v-else-if="!list.length && filtered" class="meta">Nothing matches. <button class="text-btn" @click="clearFilters">Clear filters</button></p>
          <p v-else-if="!list.length" class="meta">No active subscriptions.</p>
        </div>
      </section>

      <article v-if="current" class="card detail" aria-labelledby="detail-title">
        <div class="d-head">
          <ServiceTile :name="current.name" :color="current.category_color" :size="56" :trial="!!current.trial_ends && current.trial_ends >= t" />
          <div class="grow">
            <div class="title-row">
              <h2 id="detail-title" class="title">{{ current.name }}</h2>
              <span class="badge" :class="current.status === 'paused' ? 'badge-muted' : current.trial_ends && current.trial_ends >= t ? 'badge-trial' : 'badge-paid'">
                {{ current.status === 'paused' ? 'Paused' : current.trial_ends && current.trial_ends >= t ? 'Trial' : 'Active' }}
              </span>
            </div>
            <span class="meta">{{ current.category_name ?? 'Uncategorized' }} · since {{ fromISO(current.start_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) }}</span>
          </div>
          <div class="actions">
            <button class="btn" @click="emit('edit', current)">Edit</button>
            <button class="btn" @click="setStatus(current.id, current.status === 'paused' ? 'active' : 'paused')">{{ current.status === 'paused' ? 'Resume' : 'Pause' }}</button>
          </div>
        </div>

        <div class="price-row">
          <span class="figure-xl price">{{ formatMoney(current.amount_minor, current.currency) }}</span>
          <span class="meta">{{ cycleLabel(current).toLowerCase() }}{{ current.share_count > 1 ? ` · you pay ${formatMoney(shareMinor(current), current.currency)}` : '' }}</span>
          <span class="meta push">Next <strong>{{ relativeDay(next) }}</strong></span>
        </div>

        <div class="tabs" role="tablist">
          <button v-for="x in (['overview', 'payments', 'notes'] as const)" :key="x" role="tab" :aria-selected="tab === x" @click="tab = x">
            {{ { overview: 'Overview', payments: 'Payments', notes: 'Notes' }[x] }}
          </button>
        </div>

        <div v-if="tab === 'overview'" class="overview">
          <dl class="facts">
            <div v-for="[k, v] in facts" :key="k" class="fact"><dt>{{ k }}</dt><dd>{{ v }}</dd></div>
            <div v-if="perUse" class="fact"><dt>Per use</dt><dd>{{ perUse }}</dd></div>
          </dl>
          <div class="tags">
            <span v-for="tg in current.tags" :key="tg.id" class="tag">
              <button class="tag-name" :aria-pressed="tagFilter === tg.id" :title="`Show only #${tg.name}`" @click="tagFilter = tg.id">#{{ tg.name }}</button>
              <button class="tag-x" :aria-label="`Remove tag ${tg.name}`" @click="removeTag(current.id, tg.id)">×</button>
            </span>
            <input
              v-if="addingTag" ref="tagInput" v-model="tagText" class="tag-input" list="tag-suggestions"
              placeholder="tag" aria-label="New tag" autocomplete="off"
              @keydown.enter.prevent="commitTag" @keydown.esc="cancelTag" @blur="blurTag"
            />
            <button v-else class="tag-add" @click="startTag">+ tag</button>
            <datalist id="tag-suggestions"><option v-for="tg in suggestions" :key="tg.id" :value="tg.name" /></datalist>
          </div>
        </div>

        <div v-else-if="tab === 'payments'" class="payments">
          <span class="caption">Next charges</span>
          <div v-for="d in nextThree" :key="d" class="line-row">
            <span class="grow">{{ fromISO(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
            <div v-if="d <= t" class="segmented" role="radiogroup" :aria-label="`Status of ${d} payment`">
              <button v-for="st in STATUSES" :key="st.value" role="radio" :aria-checked="paymentFor(current.id, d)?.status === st.value" @click="markPayment(current, d, st.value)">{{ st.label }}</button>
            </div>
            <span v-else class="badge badge-muted">Due</span>
            <strong class="amt">{{ formatMoney(shareMinor(current), current.currency) }}</strong>
          </div>
          <span class="caption">History</span>
          <div v-for="p in history" :key="p.id" class="line-row">
            <span class="grow">{{ fromISO(p.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
            <div class="segmented" role="radiogroup" :aria-label="`Status of ${p.due_date} payment`">
              <button v-for="st in STATUSES" :key="st.value" role="radio" :aria-checked="p.status === st.value" @click="markPayment(current, p.due_date, st.value)">{{ st.label }}</button>
            </div>
            <strong class="amt" :class="{ struck: p.status !== 'paid' }">{{ formatMoney(Math.round(p.amount_minor / current.share_count), p.currency) }}</strong>
          </div>
          <p v-if="!history.length" class="meta">No charges recorded yet.</p>
          <span class="caption">Price history</span>
          <div v-for="p in prices" :key="p.effective_date + p.amount_minor" class="line-row">
            <span class="grow">From {{ fromISO(p.effective_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
            <strong class="amt">{{ formatMoney(p.amount_minor, p.currency) }}</strong>
          </div>
          <p v-if="!prices.length" class="meta">No price changes recorded.</p>
        </div>

        <div v-else class="notes">
          <p v-if="current.notes" class="note">{{ current.notes }}</p>
          <p v-else class="meta">No notes. Add some from Edit.</p>
        </div>

        <div class="foot">
          <a v-if="current.cancel_url" :href="current.cancel_url" @click.prevent="openUrl(current.cancel_url)">Open cancel page →</a>
          <button class="btn push" @click="setStatus(current.id, 'cancelled')">Mark as cancelled</button>
        </div>
      </article>
    </main>
  </div>
</template>

<style scoped>
.layout { flex: 1; display: flex; flex-direction: column; }
.page { width: 100%; max-width: 1300px; margin: 0 auto; padding: 40px 40px 48px; display: flex; flex-wrap: wrap; gap: 36px; align-items: flex-start; }
.list-col { flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.head { display: flex; align-items: baseline; gap: 12px; }
.push { margin-left: auto; }
.filters { display: flex; flex-wrap: wrap; gap: 6px; }
.pill { height: 32px; padding: 0 12px; border-radius: var(--radius-pill); border: 1px solid var(--line-strong); background: transparent; color: var(--ink-2); font-size: 13px; font-weight: 600; cursor: pointer; }
.pill.on { border-color: var(--ink); background: var(--ink); color: var(--paper); }
.empty-note { display: flex; flex-direction: column; gap: 4px; padding: 12px 0; }
.text-btn { border: 0; background: transparent; padding: 0; color: var(--brand); font-size: 13px; font-weight: 700; cursor: pointer; }
.text-btn:hover { color: var(--ink); }
.select-pill { position: relative; display: inline-flex; align-items: center; padding: 0; }
.select-pill select { appearance: none; height: 100%; padding: 0 28px 0 12px; border: 0; border-radius: var(--radius-pill); background: transparent; color: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.select-pill::after { content: '▾'; position: absolute; right: 12px; pointer-events: none; }
.item { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 16px; }
.item.on { background: var(--surface); box-shadow: 0 1px 2px rgba(9, 20, 19, 0.06); }
.who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.detail { flex: 1.4 1 520px; min-width: 0; padding: 32px; display: flex; flex-direction: column; gap: 24px; }
.d-head { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.grow { flex: 1; min-width: 0; }
.title-row { display: flex; align-items: center; gap: 10px; }
.actions { display: flex; gap: 8px; }
.price-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.price { font-size: 60px; }
.price-row .meta { padding-bottom: 8px; }
.tabs { display: flex; gap: 24px; border-bottom: 1px solid var(--line); }
.tabs button { all: unset; cursor: pointer; padding-bottom: 12px; margin-bottom: -1px; font-weight: 700; color: var(--ink-3); border-bottom: 2px solid transparent; }
.tabs button[aria-selected='true'] { color: var(--ink); border-bottom-color: var(--brand); }
.overview { display: flex; flex-direction: column; gap: 20px; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.tag { display: inline-flex; align-items: center; border-radius: var(--radius-pill); background: var(--sunken); color: var(--ink-2); font-size: 12px; font-weight: 700; }
.tag button { border: 0; background: transparent; color: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.tag-name { padding: 4px 4px 4px 10px; }
.tag-name[aria-pressed='true'] { color: var(--ink); }
.tag-x { padding: 4px 9px 4px 4px; color: var(--ink-3); }
.tag-x:hover { color: var(--rise); }
.tag-add { padding: 3px 10px; border: 1px dashed var(--line-strong); border-radius: var(--radius-pill); background: transparent; color: var(--ink-3); font-size: 12px; font-weight: 700; cursor: pointer; }
.tag-input { width: 140px; height: 26px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: var(--surface); font-size: 12px; font-weight: 700; }
.facts { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 32px; }
.fact { display: flex; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); }
.fact dt { color: var(--ink-3); font-weight: 600; }
.fact dd { margin: 0; font-weight: 700; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.payments { display: flex; flex-direction: column; gap: 6px; }
.payments .caption { margin-top: 10px; }
.line-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.amt { width: 100px; text-align: right; }
.struck { color: var(--ink-3); text-decoration: line-through; }
.note { margin: 0; line-height: 1.6; white-space: pre-wrap; }
.foot { display: flex; align-items: center; gap: 8px; padding-top: 16px; border-top: 1px solid var(--line); }
</style>
