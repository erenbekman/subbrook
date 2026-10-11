<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { createPaymentMethod, deletePaymentMethod, remove, save, store, updatePaymentMethod } from '../lib/store'
import { CURRENCIES, formatMoney, parseAmount } from '../lib/money'
import { today } from '../lib/dates'
import type { IntervalUnit, PaymentMethodKind, Subscription, SubscriptionDraft } from '../lib/types'

const props = defineProps<{ subscription: Subscription | null }>()
const emit = defineEmits<{ close: []; saved: [id: number] }>()

const UNITS: { value: IntervalUnit; label: string }[] = [
  { value: 'week', label: 'week' }, { value: 'month', label: 'month' }, { value: 'year', label: 'year' }, { value: 'day', label: 'day' },
]
const KINDS: PaymentMethodKind[] = ['card', 'wallet', 'bank', 'other']
const NEW_METHOD = -1

const s = props.subscription
const draft = reactive<SubscriptionDraft>({
  id: s?.id,
  name: s?.name ?? '',
  category_id: s?.category_id ?? store.categories[0]?.id ?? null,
  payment_method_id: s?.payment_method_id ?? null,
  amount_minor: s?.amount_minor ?? 0,
  currency: s?.currency ?? store.settings.currency,
  interval_unit: s?.interval_unit ?? 'month',
  interval_count: s?.interval_count ?? 1,
  start_date: s?.start_date ?? today(),
  next_due: s?.next_due ?? today(),
  trial_ends: s?.trial_ends ?? null,
  status: s?.status ?? 'active',
  share_count: s?.share_count ?? 1,
  usage_per_month: s?.usage_per_month ?? null,
  website: s?.website ?? null,
  account: s?.account ?? null,
  cancel_url: s?.cancel_url ?? null,
  commitment_ends: s?.commitment_ends ?? null,
  notes: s?.notes ?? null,
  reminder_days: s?.reminder_days ?? store.settings.reminder_days,
  reminder_time: s?.reminder_time ?? store.settings.reminder_time,
})

// The amount field is free text so "1.350,00" and "1350.00" both work.
const amountText = ref(s ? (s.amount_minor / 100).toFixed(2) : '')
const isTrial = ref(!!s?.trial_ends)
const busy = ref(false)
const error = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

const preview = computed(() => {
  const minor = parseAmount(amountText.value || '0')
  return minor ? formatMoney(minor, draft.currency) : ''
})

const methodChoice = ref<number | null>(draft.payment_method_id)
const newMethod = reactive({ name: '', kind: 'card' as PaymentMethodKind })
const methodError = ref('')
const managing = ref(false)
const edits = reactive<Record<number, { name: string; kind: PaymentMethodKind }>>({})
const armedMethod = ref<number | null>(null)

watch(() => store.paymentMethods, (list) => {
  for (const m of list) edits[m.id] ??= { name: m.name, kind: m.kind }
}, { immediate: true })

async function addMethod(): Promise<void> {
  methodError.value = ''
  if (!newMethod.name.trim()) { methodError.value = 'Name the payment method.'; return }
  try {
    methodChoice.value = await createPaymentMethod(newMethod.name, newMethod.kind)
    newMethod.name = ''
  } catch (e) {
    methodError.value = e instanceof Error ? e.message : String(e)
  }
}

function cancelNewMethod(): void {
  methodChoice.value = draft.payment_method_id
  methodError.value = ''
}

async function renameMethod(id: number): Promise<void> {
  methodError.value = ''
  const edit = edits[id]
  if (!edit.name.trim()) { methodError.value = 'Name the payment method.'; return }
  try {
    await updatePaymentMethod(id, edit.name, edit.kind)
  } catch (e) {
    methodError.value = e instanceof Error ? e.message : String(e)
  }
}

async function destroyMethod(id: number): Promise<void> {
  if (armedMethod.value !== id) { armedMethod.value = id; return }
  armedMethod.value = null
  await deletePaymentMethod(id)
  delete edits[id]
  if (methodChoice.value === id) methodChoice.value = null
  if (draft.payment_method_id === id) draft.payment_method_id = null
}

function isEdited(id: number): boolean {
  const m = store.paymentMethods.find((x) => x.id === id)
  return !!m && (m.name !== edits[id].name.trim() || m.kind !== edits[id].kind)
}

async function submit(): Promise<void> {
  error.value = ''
  draft.amount_minor = parseAmount(amountText.value || '0')
  draft.payment_method_id = methodChoice.value === NEW_METHOD ? draft.payment_method_id : methodChoice.value
  if (!draft.name.trim()) { error.value = 'Give it a name.'; nameInput.value?.focus(); return }
  if (!draft.amount_minor) { error.value = 'Enter a price.'; return }
  draft.name = draft.name.trim()
  draft.trial_ends = isTrial.value ? (draft.trial_ends || draft.next_due) : null
  busy.value = true
  try {
    const id = await save({ ...draft })
    emit('saved', id)
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = false
  }
}

// Two-step delete (no native confirm dialog in the webview): first click arms, second deletes.
const armed = ref(false)
async function destroy(): Promise<void> {
  if (!s) return
  if (!armed.value) { armed.value = true; return }
  await remove(s.id)
  emit('close')
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => nameInput.value?.focus())
</script>

<template>
  <div class="backdrop" @click.self="emit('close')" @keydown="onKey">
    <form class="sheet card" role="dialog" aria-modal="true" aria-labelledby="sheet-title" @submit.prevent="submit">
      <h2 id="sheet-title" class="title">{{ s ? `Edit ${s.name}` : 'New subscription' }}</h2>

      <div class="field">
        <label for="f-name">Name</label>
        <input id="f-name" ref="nameInput" v-model="draft.name" class="input" placeholder="Netflix" autocomplete="off" />
      </div>

      <div class="row">
        <div class="field grow">
          <label for="f-amount">Price</label>
          <input id="f-amount" v-model="amountText" class="input" inputmode="decimal" placeholder="299,99" />
        </div>
        <div class="field">
          <label for="f-cur">Currency</label>
          <select id="f-cur" v-model="draft.currency" class="input">
            <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="field">
          <label for="f-every">Every</label>
          <div class="every">
            <input id="f-every" v-model.number="draft.interval_count" class="input count" type="number" min="1" />
            <select v-model="draft.interval_unit" class="input" aria-label="Interval unit">
              <option v-for="u in UNITS" :key="u.value" :value="u.value">{{ u.label }}{{ draft.interval_count > 1 ? 's' : '' }}</option>
            </select>
          </div>
        </div>
      </div>
      <p v-if="preview" class="meta">{{ preview }} every {{ draft.interval_count > 1 ? draft.interval_count + ' ' : '' }}{{ draft.interval_unit }}{{ draft.interval_count > 1 ? 's' : '' }}</p>

      <div class="row">
        <div class="field grow">
          <label for="f-next">Next payment</label>
          <input id="f-next" v-model="draft.next_due" class="input" type="date" />
        </div>
        <div class="field grow">
          <label for="f-start">Started</label>
          <input id="f-start" v-model="draft.start_date" class="input" type="date" />
        </div>
        <div class="field grow">
          <label for="f-cat">Category</label>
          <select id="f-cat" v-model="draft.category_id" class="input">
            <option :value="null">None</option>
            <option v-for="c in store.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="f-pm">Pays with</label>
          <button type="button" class="text-btn" :aria-expanded="managing" @click="managing = !managing; armedMethod = null">{{ managing ? 'Done' : 'Manage' }}</button>
        </div>
        <select id="f-pm" v-model="methodChoice" class="input">
          <option :value="null">None</option>
          <option v-for="m in store.paymentMethods" :key="m.id" :value="m.id">{{ m.name }}</option>
          <option :value="NEW_METHOD">New payment method…</option>
        </select>
        <div v-if="methodChoice === NEW_METHOD" class="row">
          <input v-model="newMethod.name" class="input grow" placeholder="Card ending 4417" aria-label="New payment method name" autocomplete="off" @keydown.enter.prevent="addMethod" />
          <select v-model="newMethod.kind" class="input" aria-label="Kind">
            <option v-for="k in KINDS" :key="k" :value="k">{{ k }}</option>
          </select>
          <button type="button" class="btn" @click="addMethod">Add</button>
          <button type="button" class="btn" @click="cancelNewMethod">Cancel</button>
        </div>
        <div v-if="managing" class="manage">
          <p v-if="!store.paymentMethods.length" class="meta">No payment methods yet.</p>
          <div v-for="m in store.paymentMethods" :key="m.id" class="manage-row">
            <input v-model="edits[m.id].name" class="input grow" :aria-label="`Name of ${m.name}`" autocomplete="off" @keydown.enter.prevent="renameMethod(m.id)" />
            <select v-model="edits[m.id].kind" class="input" :aria-label="`Kind of ${m.name}`">
              <option v-for="k in KINDS" :key="k" :value="k">{{ k }}</option>
            </select>
            <button type="button" class="btn" :disabled="!isEdited(m.id)" @click="renameMethod(m.id)">Save</button>
            <button type="button" class="btn btn-danger" @click="destroyMethod(m.id)">
              {{ armedMethod !== m.id ? 'Delete' : m.used_by ? `Used by ${m.used_by} — click again` : 'Click again to delete' }}
            </button>
          </div>
        </div>
        <p v-if="methodError" class="error" role="alert">{{ methodError }}</p>
      </div>

      <div class="row">
        <label class="check"><input v-model="isTrial" type="checkbox" /> Free trial</label>
        <div v-if="isTrial" class="field grow">
          <label for="f-trial">Trial ends</label>
          <input id="f-trial" v-model="draft.trial_ends" class="input" type="date" />
        </div>
        <div class="field">
          <label for="f-share">Shared by</label>
          <input id="f-share" v-model.number="draft.share_count" class="input count" type="number" min="1" />
        </div>
      </div>

      <div class="row">
        <div class="field grow">
          <label for="f-web">Website</label>
          <input id="f-web" v-model="draft.website" class="input" placeholder="netflix.com" />
        </div>
        <div class="field grow">
          <label for="f-cancel">Cancel page</label>
          <input id="f-cancel" v-model="draft.cancel_url" class="input" placeholder="https://…" />
        </div>
      </div>

      <div class="field">
        <label for="f-notes">Notes</label>
        <textarea id="f-notes" v-model="draft.notes" class="input" rows="2" />
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div class="actions">
        <button v-if="s" type="button" class="btn btn-danger" @click="destroy">{{ armed ? 'Click again to delete' : 'Delete…' }}</button>
        <span class="spacer" />
        <button type="button" class="btn" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="busy">{{ s ? 'Save' : 'Add subscription' }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 50; background: rgba(9, 20, 19, 0.28); display: flex; align-items: flex-start; justify-content: center; padding: 72px 16px 16px; overflow: auto; }
.sheet { width: min(640px, 100%); display: flex; flex-direction: column; gap: 16px; padding: 28px; }
.row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.grow { flex: 1 1 160px; }
.every { display: flex; gap: 6px; }
.count { width: 64px; }
.check { display: flex; align-items: center; gap: 8px; height: 40px; font-weight: 600; }
.meta { margin: -6px 0 0; }
.error { margin: 0; color: var(--rise); font-weight: 600; }
.label-row { display: flex; align-items: baseline; justify-content: space-between; }
.text-btn { border: 0; background: transparent; padding: 0; color: var(--brand); font-size: 12px; font-weight: 700; cursor: pointer; }
.text-btn:hover { color: var(--ink); }
.manage { display: flex; flex-direction: column; border-top: 1px solid var(--line); }
.manage-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); }
.actions { display: flex; gap: 8px; align-items: center; padding-top: 8px; }
.spacer { flex: 1; }
</style>
