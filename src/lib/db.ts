import Database from '@tauri-apps/plugin-sql'
import type { Category, FxRate, Payment, PaymentMethod, PaymentMethodKind, PaymentStatus, ReminderKind, Subscription, SubscriptionDraft, Tag } from './types'

// Plain SQL against the single local file. Migrations run on the Rust side at startup.
let dbPromise: Promise<Database> | null = null

function db(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load('sqlite:subbrook.db').then(async (d) => {
      await d.execute('PRAGMA foreign_keys = ON')
      return d
    })
  }
  return dbPromise
}

export async function listCategories(): Promise<Category[]> {
  return (await db()).select<Category[]>('SELECT id, name, color, position FROM categories ORDER BY position, name')
}

export async function createCategory(name: string, color: string): Promise<number> {
  const res = await (await db()).execute(
    'INSERT INTO categories (name, color, position) VALUES ($1, $2, (SELECT COALESCE(MAX(position), 0) + 1 FROM categories))',
    [name, color])
  return Number(res.lastInsertId)
}

export async function updateCategory(id: number, name: string, color: string): Promise<void> {
  await (await db()).execute('UPDATE categories SET name = $1, color = $2 WHERE id = $3', [name, color, id])
}

export async function deleteCategory(id: number): Promise<void> {
  await (await db()).execute('DELETE FROM categories WHERE id = $1', [id])
}

export async function listSubscriptions(): Promise<Subscription[]> {
  const rows = await (await db()).select<(Omit<Subscription, 'tags'> & { tags_json: string })[]>(
    `SELECT s.*, c.name AS category_name, c.color AS category_color, pm.name AS payment_method_name,
            (SELECT json_group_array(json_object('id', t.id, 'name', t.name))
               FROM subscription_tags st JOIN tags t ON t.id = st.tag_id
              WHERE st.subscription_id = s.id) AS tags_json
       FROM subscriptions s
       LEFT JOIN categories c ON c.id = s.category_id
       LEFT JOIN payment_methods pm ON pm.id = s.payment_method_id
      WHERE s.status != 'archived'
      ORDER BY s.next_due, s.name`,
  )
  return rows.map(({ tags_json, ...s }) => ({
    ...s,
    tags: (JSON.parse(tags_json) as Tag[]).sort((a, b) => a.name.localeCompare(b.name)),
  }))
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  return (await db()).select<PaymentMethod[]>(
    `SELECT pm.id, pm.name, pm.kind, COUNT(s.id) AS used_by
       FROM payment_methods pm
       LEFT JOIN subscriptions s ON s.payment_method_id = pm.id AND s.status != 'archived'
      GROUP BY pm.id
      ORDER BY pm.name`,
  )
}

export async function createPaymentMethod(name: string, kind: PaymentMethodKind): Promise<number> {
  const res = await (await db()).execute('INSERT INTO payment_methods (name, kind) VALUES ($1, $2)', [name, kind])
  return Number(res.lastInsertId)
}

export async function updatePaymentMethod(id: number, name: string, kind: PaymentMethodKind): Promise<void> {
  await (await db()).execute('UPDATE payment_methods SET name = $1, kind = $2 WHERE id = $3', [name, kind, id])
}

export async function deletePaymentMethod(id: number): Promise<void> {
  await (await db()).execute('DELETE FROM payment_methods WHERE id = $1', [id])
}

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await (await db()).select<{ key: string; value: string }[]>('SELECT key, value FROM settings')
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function setSetting(key: string, value: string): Promise<void> {
  await (await db()).execute(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
}

export async function listPayments(): Promise<Payment[]> {
  return (await db()).select<Payment[]>(
    'SELECT id, subscription_id, due_date, amount_minor, currency, status FROM payments ORDER BY due_date DESC, id DESC')
}

export async function recordCharges(subscriptionId: number, dates: string[], amountMinor: number, currency: string): Promise<void> {
  const d = await db()
  for (let i = 0; i < dates.length; i += 200) {
    const chunk = dates.slice(i, i + 200)
    const rows = chunk.map((_, j) => `($1, $2, $3, $${j + 4})`).join(', ')
    await d.execute(
      `INSERT OR IGNORE INTO payments (subscription_id, amount_minor, currency, due_date) VALUES ${rows}`,
      [subscriptionId, amountMinor, currency, ...chunk])
  }
}

export async function recordPayment(subscriptionId: number, dueDate: string, amountMinor: number, currency: string): Promise<void> {
  await (await db()).execute(
    'INSERT OR IGNORE INTO payments (subscription_id, due_date, amount_minor, currency) VALUES ($1, $2, $3, $4)',
    [subscriptionId, dueDate, amountMinor, currency])
}

export async function setNextDue(id: number, nextDue: string): Promise<void> {
  await (await db()).execute('UPDATE subscriptions SET next_due = $1 WHERE id = $2', [nextDue, id])
}

export async function markPayment(
  subscriptionId: number, dueDate: string, amountMinor: number, currency: string, status: PaymentStatus,
): Promise<void> {
  await (await db()).execute(
    `INSERT INTO payments (subscription_id, due_date, amount_minor, currency, status) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(subscription_id, due_date) DO UPDATE SET status = excluded.status, recorded_at = datetime('now')`,
    [subscriptionId, dueDate, amountMinor, currency, status])
}

export async function listRates(): Promise<FxRate[]> {
  return (await db()).select<FxRate[]>('SELECT source, rate_date, currency, rate FROM fx_rates ORDER BY rate_date')
}

export async function saveRates(rates: FxRate[]): Promise<void> {
  const d = await db()
  for (let i = 0; i < rates.length; i += 200) {
    const chunk = rates.slice(i, i + 200)
    const rows = chunk.map((_, j) => `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`).join(', ')
    await d.execute(
      `INSERT OR REPLACE INTO fx_rates (source, rate_date, currency, rate) VALUES ${rows}`,
      chunk.flatMap((r) => [r.source, r.rate_date, r.currency, r.rate]))
  }
}

export async function claimNotification(subscriptionId: number, dueDate: string, kind: ReminderKind): Promise<boolean> {
  const res = await (await db()).execute(
    'INSERT OR IGNORE INTO notifications_sent (subscription_id, due_date, kind) VALUES ($1, $2, $3)',
    [subscriptionId, dueDate, kind])
  return res.rowsAffected > 0
}

export async function listTags(): Promise<Tag[]> {
  return (await db()).select<Tag[]>('SELECT id, name FROM tags ORDER BY name')
}

export async function addTag(subscriptionId: number, name: string): Promise<void> {
  const d = await db()
  await d.execute('INSERT INTO tags (name) VALUES ($1) ON CONFLICT(name) DO NOTHING', [name])
  await d.execute(
    'INSERT OR IGNORE INTO subscription_tags (subscription_id, tag_id) SELECT $1, id FROM tags WHERE name = $2',
    [subscriptionId, name])
}

export async function removeTag(subscriptionId: number, tagId: number): Promise<void> {
  const d = await db()
  await d.execute('DELETE FROM subscription_tags WHERE subscription_id = $1 AND tag_id = $2', [subscriptionId, tagId])
  await d.execute('DELETE FROM tags WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM subscription_tags WHERE tag_id = $1)', [tagId])
}

const COLUMNS = [
  'name', 'category_id', 'payment_method_id', 'amount_minor', 'currency', 'interval_unit', 'interval_count',
  'start_date', 'next_due', 'trial_ends', 'status', 'share_count', 'usage_per_month', 'website', 'account',
  'cancel_url', 'commitment_ends', 'notes', 'reminder_days', 'reminder_time',
] as const

export async function saveSubscription(draft: SubscriptionDraft): Promise<number> {
  const d = await db()
  const values = COLUMNS.map((c) => draft[c] ?? null)
  if (draft.id) {
    const sets = COLUMNS.map((c, i) => `${c} = $${i + 1}`).join(', ')
    const before = await d.select<{ amount_minor: number; currency: string }[]>(
      'SELECT amount_minor, currency FROM subscriptions WHERE id = $1', [draft.id])
    await d.execute(`UPDATE subscriptions SET ${sets}, updated_at = datetime('now') WHERE id = $${COLUMNS.length + 1}`, [...values, draft.id])
    // keep a price history row whenever the price or currency changes
    const old = before[0]
    if (old && (old.amount_minor !== draft.amount_minor || old.currency !== draft.currency)) {
      await d.execute(
        `INSERT INTO price_changes (subscription_id, amount_minor, currency, effective_date) VALUES ($1, $2, $3, date('now'))`,
        [draft.id, draft.amount_minor, draft.currency])
    }
    return draft.id
  }
  const placeholders = COLUMNS.map((_, i) => `$${i + 1}`).join(', ')
  const res = await d.execute(`INSERT INTO subscriptions (${COLUMNS.join(', ')}) VALUES (${placeholders})`, values)
  const id = Number(res.lastInsertId)
  await d.execute(
    `INSERT INTO price_changes (subscription_id, amount_minor, currency, effective_date) VALUES ($1, $2, $3, $4)`,
    [id, draft.amount_minor, draft.currency, draft.start_date])
  return id
}

export interface PriceChange { amount_minor: number; currency: string; effective_date: string }

export async function listPriceChanges(subscriptionId: number): Promise<PriceChange[]> {
  return (await db()).select<PriceChange[]>(
    'SELECT amount_minor, currency, effective_date FROM price_changes WHERE subscription_id = $1 ORDER BY effective_date DESC, id DESC',
    [subscriptionId])
}

export async function deleteSubscription(id: number): Promise<void> {
  const d = await db()
  await d.execute('DELETE FROM subscriptions WHERE id = $1', [id])
  await d.execute('DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM subscription_tags WHERE tag_id = tags.id)')
}

export async function setStatus(id: number, status: Subscription['status']): Promise<void> {
  await (await db()).execute(`UPDATE subscriptions SET status = $1, updated_at = datetime('now') WHERE id = $2`, [status, id])
}
