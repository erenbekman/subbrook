<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { store } from '../lib/store'
import { useMonth } from '../lib/month'
import { convert } from '../lib/fx'
import { fromISO, today } from '../lib/dates'
import { formatMoney, monthlyMinor, splitDecimals } from '../lib/money'
import { drawPoster, drawReceipt, type ShareData, type ShareItem } from '../lib/share'

const emit = defineEmits<{ close: [] }>()

const t = today()
const now = fromISO(t)
const { occurrences, totals } = useMonth(ref(now.getFullYear()), ref(now.getMonth()))

const kind = ref<'poster' | 'receipt'>('poster')
const hideAmounts = ref(false)
const preview = ref('')
const status = ref('')
const busy = ref(false)
let canvas: HTMLCanvasElement | null = null

const data = computed<ShareData>(() => {
  const primary = store.settings.currency
  const rows = store.subscriptions
    .filter((s) => s.status === 'active')
    .map((s) => ({ s, own: monthlyMinor(s), conv: convert(monthlyMinor(s), s.currency, primary) }))
  const converted = rows.every((r) => r.conv !== null)
  const weight = (r: (typeof rows)[number]) => (converted ? r.conv! : r.own)
  const total = rows.reduce((a, r) => a + weight(r), 0) || 1
  rows.sort((a, b) => weight(b) - weight(a))

  const byCurrency: Record<string, number> = {}
  for (const r of rows) byCurrency[r.s.currency] = (byCurrency[r.s.currency] ?? 0) + r.own
  const separate = Object.entries(byCurrency).map(([c, v]) => formatMoney(v, c)).join(' + ')

  const items: ShareItem[] = rows.map(({ s, own, conv }) => {
    const notes: string[] = []
    if (s.share_count > 1) notes.push(`split ×${s.share_count}, your share`)
    if (s.trial_ends && s.trial_ends >= t) notes.push(`trial ends ${fromISO(s.trial_ends).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`)
    if (s.currency !== primary && converted) notes.push(`${formatMoney(own, s.currency)} ≈`)
    return {
      name: s.name, color: s.category_color || 'cat-1',
      value: converted ? formatMoney(conv!, primary) : formatMoney(own, s.currency),
      share: weight({ s, own, conv }) / total, note: notes.join(' · '),
    }
  })

  const cats = new Map<string, { name: string; color: string; value: number }>()
  for (const r of rows) {
    const name = r.s.category_name ?? 'Other'
    const c = cats.get(name) ?? { name, color: r.s.category_color || 'cat-1', value: 0 }
    c.value += weight(r)
    cats.set(name, c)
  }

  const counted = occurrences.value.filter((o) => o.status !== 'skipped' && o.status !== 'refunded')
  const conv = totals.value.converted
  const toCome = conv
    ? formatMoney(conv.all.minor - conv.paid.minor, primary)
    : formatMoney((totals.value.all[primary] ?? 0) - (totals.value.paid[primary] ?? 0), primary)

  return {
    month: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    hero: converted ? splitDecimals(formatMoney(total, primary)) : [separate, ''],
    perMonth: converted ? formatMoney(total, primary) : separate,
    perYear: converted ? formatMoney(total * 12, primary) : null,
    approx: converted && rows.some((r) => r.s.currency !== primary),
    items,
    categories: [...cats.values()].sort((a, b) => b.value - a.value).map((c) => ({ name: c.name, color: c.color, share: c.value / total })),
    paid: counted.filter((o) => o.status === 'paid').length,
    charges: counted.length,
    toCome,
  }
})

async function render(): Promise<void> {
  canvas = await (kind.value === 'poster' ? drawPoster : drawReceipt)(data.value, hideAmounts.value)
  preview.value = canvas.toDataURL('image/png')
}

async function savePng(): Promise<void> {
  if (!canvas) return
  busy.value = true
  status.value = ''
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas!.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error("Couldn't create the image.")
    const saved = await invoke<boolean>('save_binary', new Uint8Array(await blob.arrayBuffer()), {
      headers: { 'x-file-name': `subbrook-${kind.value}-${t}.png` },
    })
    if (saved) status.value = 'Image saved.'
  } catch (e) {
    status.value = String(e)
  } finally {
    busy.value = false
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

watch([kind, hideAmounts, data], render)
onMounted(render)
</script>

<template>
  <div class="backdrop" @click.self="emit('close')" @keydown="onKey">
    <section class="sheet card" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div class="head">
        <h2 id="share-title" class="title">Share as image</h2>
        <div class="segmented" role="radiogroup" aria-label="Style">
          <button role="radio" :aria-checked="kind === 'poster'" @click="kind = 'poster'">Poster</button>
          <button role="radio" :aria-checked="kind === 'receipt'" @click="kind = 'receipt'">Receipt</button>
        </div>
      </div>
      <div class="preview">
        <img v-if="preview" :src="preview" :alt="`Preview of the ${kind}`" />
      </div>
      <p class="meta">Made on this computer and saved where you choose. Nothing is posted anywhere.</p>
      <p v-if="status" class="meta" role="status">{{ status }}</p>
      <div class="actions">
        <label class="check"><input v-model="hideAmounts" type="checkbox" /> Hide amounts</label>
        <span class="spacer" />
        <button class="btn" @click="emit('close')">Close</button>
        <button class="btn btn-primary" :disabled="busy || !preview" @click="savePng">Save PNG</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 50; background: rgba(9, 20, 19, 0.28); display: flex; align-items: flex-start; justify-content: center; padding: 72px 16px 16px; overflow: auto; }
.sheet { width: min(640px, 100%); display: flex; flex-direction: column; gap: 16px; padding: 28px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.preview { display: flex; justify-content: center; padding: 16px; border-radius: var(--radius-md); background: var(--sunken); }
.preview img { max-width: 100%; max-height: 56vh; border-radius: var(--radius-sm); box-shadow: var(--shadow-card); }
.meta { margin: 0; }
.actions { display: flex; align-items: center; gap: 8px; }
.check { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.spacer { flex: 1; }
</style>
