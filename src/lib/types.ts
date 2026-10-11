export type IntervalUnit = 'day' | 'week' | 'month' | 'year'
export type Status = 'active' | 'paused' | 'cancelled' | 'archived'
export type PaymentMethodKind = 'card' | 'wallet' | 'bank' | 'other'
export type PaymentStatus = 'paid' | 'skipped' | 'refunded'
export type FxSource = 'tcmb' | 'ecb'
export type ReminderKind = 'renewal' | 'trial'

export interface Category {
  id: number
  name: string
  color: string // token key: cat-1 … cat-6
  position: number
}

export interface PaymentMethod {
  id: number
  name: string
  kind: PaymentMethodKind
  used_by: number
}

export interface Settings {
  currency: string
  reminder_days: number
  reminder_time: string
  onboarded: boolean
  notifications: boolean
  notifications_asked: boolean
  fx_checked_at: string
}

export interface FxRate {
  source: FxSource
  rate_date: string
  currency: string
  rate: number
}

export interface Payment {
  id: number
  subscription_id: number
  due_date: string
  amount_minor: number
  currency: string
  status: PaymentStatus
}

export interface Tag {
  id: number
  name: string
}

export interface Subscription {
  id: number
  name: string
  category_id: number | null
  payment_method_id: number | null
  amount_minor: number
  currency: string
  interval_unit: IntervalUnit
  interval_count: number
  start_date: string
  next_due: string
  trial_ends: string | null
  status: Status
  share_count: number
  usage_per_month: number | null
  website: string | null
  account: string | null
  cancel_url: string | null
  commitment_ends: string | null
  notes: string | null
  reminder_days: number
  reminder_time: string
  created_at: string
  // joined
  category_name?: string | null
  category_color?: string | null
  payment_method_name?: string | null
  tags: Tag[]
}

/** Fields the form edits. `id` is absent for a new subscription. */
export type SubscriptionDraft = Omit<Subscription, 'id' | 'created_at' | 'category_name' | 'category_color' | 'payment_method_name' | 'tags'> & { id?: number }

/** One charge on a given day (computed, not stored). */
export interface Occurrence {
  sub: Subscription
  date: string // YYYY-MM-DD
  isTrialEnd: boolean
  status: PaymentStatus | null
}
