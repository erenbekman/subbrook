import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import * as repo from './db'
import { saveSetting, store } from './store'
import { addInterval, fromISO, nextChargeOnOrAfter, relativeDay, today } from './dates'
import { formatMoney, shareMinor } from './money'
import type { ReminderKind, Subscription } from './types'

export async function notificationsAllowed(ask: boolean): Promise<boolean> {
  if (await isPermissionGranted()) return true
  if (!ask) return false
  return (await requestPermission()) === 'granted'
}

function remindAt(sub: Subscription, date: string): Date {
  const at = fromISO(addInterval(date, 'day', -sub.reminder_days))
  const [h, m] = sub.reminder_time.split(':').map(Number)
  at.setHours(h, m, 0, 0)
  return at
}

function message(sub: Subscription, date: string, kind: ReminderKind): { title: string; body: string } {
  const amount = formatMoney(shareMinor(sub), sub.currency)
  const day = fromISO(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  if (kind === 'trial') {
    return { title: `${sub.name} trial ends ${relativeDay(date)}`, body: `It becomes ${amount} on ${day}. Cancel before then to pay nothing.` }
  }
  return { title: `${sub.name} renews ${relativeDay(date)}`, body: `${amount} on ${day}.` }
}

let checking = false

export async function checkReminders(): Promise<void> {
  if (checking || !store.settings.notifications || !store.settings.onboarded) return
  checking = true
  try {
    const firstAsk = !store.settings.notifications_asked
    if (firstAsk) await saveSetting('notifications_asked', true)
    if (!(await notificationsAllowed(firstAsk))) return

    const now = new Date()
    const t = today()
    for (const sub of store.subscriptions) {
      if (sub.status !== 'active') continue
      const due = nextChargeOnOrAfter(sub, t)
      const trial = sub.trial_ends && sub.trial_ends >= t ? sub.trial_ends : null
      const reminders: { date: string; kind: ReminderKind }[] = []
      if (trial) reminders.push({ date: trial, kind: 'trial' })
      if (trial !== due) reminders.push({ date: due, kind: 'renewal' })

      for (const r of reminders) {
        const at = remindAt(sub, r.date)
        if (now < at) continue
        if (!(await repo.claimNotification(sub.id, r.date, r.kind))) continue
        if (at < new Date(`${sub.created_at.replace(' ', 'T')}Z`)) continue
        sendNotification(message(sub, r.date, r.kind))
      }
    }
  } finally {
    checking = false
  }
}
