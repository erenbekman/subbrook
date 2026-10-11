import { reactive } from 'vue'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { saveSetting, store } from './store'

const DAY_MS = 24 * 60 * 60 * 1000

export const updater = reactive({
  version: '',
  ready: false,
  checking: false,
  installing: false,
  dismissed: false,
  lastError: '',
})

let pending: Update | null = null

export async function checkForUpdate(manual: boolean): Promise<string> {
  if (updater.ready) return `Version ${updater.version} is ready.`
  if (updater.checking) return ''
  if (!manual) {
    if (!store.settings.auto_update || !store.settings.onboarded) return ''
    const last = Date.parse(store.settings.update_checked_at)
    if (last && Date.now() - last < DAY_MS) return ''
  }
  updater.checking = true
  try {
    const update = await check()
    await saveSetting('update_checked_at', new Date().toISOString())
    updater.lastError = ''
    if (!update) return "You're on the latest version."
    await update.download()
    pending = update
    updater.version = update.version
    updater.ready = true
    updater.dismissed = false
    return `Version ${update.version} is ready.`
  } finally {
    updater.checking = false
  }
}

export function checkInBackground(): void {
  checkForUpdate(false).catch((e) => { updater.lastError = String(e) })
}

export async function installAndRestart(): Promise<void> {
  if (!pending) return
  updater.installing = true
  try {
    await pending.install()
    await relaunch()
  } finally {
    updater.installing = false
  }
}
