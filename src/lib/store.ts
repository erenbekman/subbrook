import { reactive } from 'vue'
import * as repo from './db'
import { chargesBefore, today } from './dates'
import type { Candidate } from './recurring'
import type { Category, FxRate, Payment, PaymentMethod, PaymentMethodKind, PaymentStatus, Settings, Subscription, SubscriptionDraft, Tag } from './types'

/** The one shared state object. Views read it; mutations go through these functions. */
export const store = reactive({
  ready: false,
  error: '' as string,
  categories: [] as Category[],
  subscriptions: [] as Subscription[],
  paymentMethods: [] as PaymentMethod[],
  tags: [] as Tag[],
  payments: [] as Payment[],
  settings: {
    currency: 'TRY', reminder_days: 3, reminder_time: '09:00', onboarded: false,
    notifications: true, notifications_asked: false, fx_checked_at: '', auto_update: true, update_checked_at: '',
  } as Settings,
  rates: [] as FxRate[],
})

let rolledOn = ''
let rolling: Promise<void> | null = null

function rollForward(): Promise<void> {
  const t = today()
  if (rolledOn === t) return Promise.resolve()
  rolling ??= (async () => {
    for (const s of await repo.listSubscriptions()) {
      if (s.status !== 'active' || s.next_due >= t) continue
      const { dates, next } = chargesBefore(s, t)
      const charged = dates.filter((d) => !s.trial_ends || d >= s.trial_ends)
      if (charged.length) await repo.recordCharges(s.id, charged, s.amount_minor, s.currency)
      await repo.setNextDue(s.id, next)
    }
    rolledOn = t
  })().finally(() => { rolling = null })
  return rolling
}

export async function load(): Promise<void> {
  try {
    await rollForward()
    const [categories, subscriptions, paymentMethods, tags, payments, settings, rates] = await Promise.all([
      repo.listCategories(), repo.listSubscriptions(), repo.listPaymentMethods(), repo.listTags(), repo.listPayments(),
      repo.getSettings(), repo.listRates(),
    ])
    store.rates = rates
    store.settings = {
      currency: settings.currency ?? store.settings.currency,
      reminder_days: Number(settings.reminder_days ?? store.settings.reminder_days),
      reminder_time: settings.reminder_time ?? store.settings.reminder_time,
      onboarded: settings.onboarded === 'true',
      notifications: settings.notifications !== 'false',
      notifications_asked: settings.notifications_asked === 'true',
      fx_checked_at: settings.fx_checked_at ?? '',
      auto_update: settings.auto_update !== 'false',
      update_checked_at: settings.update_checked_at ?? '',
    }
    if (subscriptions.length && !store.settings.onboarded) {
      await repo.setSetting('onboarded', 'true')
      store.settings.onboarded = true
    }
    store.categories = categories
    store.subscriptions = subscriptions
    store.paymentMethods = paymentMethods
    store.tags = tags
    store.payments = payments
    store.error = ''
  } catch (e) {
    store.error = String(e)
  } finally {
    store.ready = true
  }
}

export async function save(draft: SubscriptionDraft): Promise<number> {
  const id = await repo.saveSubscription(draft)
  await load()
  return id
}

export async function remove(id: number): Promise<void> {
  await repo.deleteSubscription(id)
  await load()
}

export async function setStatus(id: number, status: Subscription['status']): Promise<void> {
  const sub = store.subscriptions.find((s) => s.id === id)
  if (status === 'active' && sub && sub.status !== 'active') await repo.setNextDue(id, chargesBefore(sub, today()).next)
  await repo.setStatus(id, status)
  await load()
}

export async function markPayment(sub: Subscription, dueDate: string, status: PaymentStatus): Promise<void> {
  await repo.markPayment(sub.id, dueDate, sub.amount_minor, sub.currency, status)
  await load()
}

export async function importCandidates(candidates: Candidate[]): Promise<number[]> {
  const ids: number[] = []
  for (const c of candidates) {
    const category = store.categories.find((cat) => cat.name.toLowerCase() === c.category?.toLowerCase())
    const id = await repo.saveSubscription({
      name: c.name, category_id: category?.id ?? null, payment_method_id: null,
      amount_minor: c.amountMinor, currency: c.currency, interval_unit: c.unit, interval_count: c.intervalCount,
      start_date: c.startDate, next_due: c.nextDue, trial_ends: null, status: 'active', share_count: 1,
      usage_per_month: null, website: null, account: null, cancel_url: null, commitment_ends: null, notes: null,
      reminder_days: store.settings.reminder_days, reminder_time: store.settings.reminder_time,
    })
    for (let i = 0; i < c.dates.length; i++) await repo.recordPayment(id, c.dates[i], c.amounts[i], c.currency)
    ids.push(id)
  }
  if (ids.length && !store.settings.onboarded) await saveSetting('onboarded', true)
  await load()
  return ids
}

export function paymentFor(subscriptionId: number, dueDate: string): Payment | undefined {
  return store.payments.find((p) => p.subscription_id === subscriptionId && p.due_date === dueDate)
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await repo.setSetting(key, String(value))
  store.settings[key] = value
}

export function categoryById(id: number | null): Category | undefined {
  return store.categories.find((c) => c.id === id)
}

function isDuplicate(e: unknown): boolean {
  return String(e).includes('UNIQUE constraint failed')
}

export async function createPaymentMethod(name: string, kind: PaymentMethodKind): Promise<number> {
  try {
    const id = await repo.createPaymentMethod(name.trim(), kind)
    await load()
    return id
  } catch (e) {
    throw isDuplicate(e) ? new Error(`“${name.trim()}” already exists.`) : e
  }
}

export async function updatePaymentMethod(id: number, name: string, kind: PaymentMethodKind): Promise<void> {
  try {
    await repo.updatePaymentMethod(id, name.trim(), kind)
    await load()
  } catch (e) {
    throw isDuplicate(e) ? new Error(`“${name.trim()}” already exists.`) : e
  }
}

export const CATEGORY_COLORS = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6']

export function nextCategoryColor(): string {
  return CATEGORY_COLORS[store.categories.length % CATEGORY_COLORS.length]
}

export async function createCategory(name: string, color = nextCategoryColor()): Promise<number> {
  try {
    const id = await repo.createCategory(name.trim(), color)
    await load()
    return id
  } catch (e) {
    throw isDuplicate(e) ? new Error(`“${name.trim()}” already exists.`) : e
  }
}

export async function updateCategory(id: number, name: string, color: string): Promise<void> {
  try {
    await repo.updateCategory(id, name.trim(), color)
    await load()
  } catch (e) {
    throw isDuplicate(e) ? new Error(`“${name.trim()}” already exists.`) : e
  }
}

export async function deleteCategory(id: number): Promise<void> {
  await repo.deleteCategory(id)
  await load()
}

export async function deletePaymentMethod(id: number): Promise<void> {
  await repo.deletePaymentMethod(id)
  await load()
}

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim().toLocaleLowerCase().replace(/\s+/g, '-')
}

export async function addTag(subscriptionId: number, raw: string): Promise<void> {
  const name = normalizeTag(raw)
  if (!name) return
  await repo.addTag(subscriptionId, name)
  await load()
}

export async function removeTag(subscriptionId: number, tagId: number): Promise<void> {
  await repo.removeTag(subscriptionId, tagId)
  await load()
}
