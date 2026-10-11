<script setup lang="ts">
import { ref } from 'vue'
import { saveSetting, store } from '../lib/store'
import { CURRENCIES } from '../lib/money'

const emit = defineEmits<{ add: []; done: [] }>()

const step = ref(1)
const error = ref('')

async function pickCurrency(code: string): Promise<void> {
  error.value = ''
  try {
    await saveSetting('currency', code)
  } catch (e) {
    error.value = String(e)
  }
}

async function finish(): Promise<void> {
  error.value = ''
  try {
    await saveSetting('onboarded', true)
    emit('done')
  } catch (e) {
    error.value = String(e)
  }
}
</script>

<template>
  <main class="page">
    <section class="card panel" aria-labelledby="onb-title">
      <div class="progress">
        <span class="caption">Step {{ step }} of 3</span>
        <span class="dots" aria-hidden="true"><span v-for="n in 3" :key="n" class="dot" :class="{ on: n <= step }" /></span>
      </div>

      <template v-if="step === 1">
        <p class="wordmark" aria-label="subbrook"><span class="sub">sub</span>brook</p>
        <h1 id="onb-title" class="title">Every subscription, in one calm stream.</h1>
        <p class="meta">Free and open source. No account, no server — everything stays in one file on this computer.</p>
        <div class="actions">
          <button class="btn btn-primary" @click="step = 2">Get started</button>
        </div>
      </template>

      <template v-else-if="step === 2">
        <h1 id="onb-title" class="title">Which currency do you mostly pay in?</h1>
        <p class="meta">It leads your totals and is the default for new subscriptions. You can change it in Settings.</p>
        <div class="segmented big" role="radiogroup" aria-labelledby="onb-title">
          <button v-for="c in CURRENCIES" :key="c" role="radio" :aria-checked="store.settings.currency === c" @click="pickCurrency(c)">{{ c }}</button>
        </div>
        <div class="actions">
          <button class="btn" @click="step = 1">Back</button>
          <button class="btn btn-primary" @click="step = 3">Continue</button>
        </div>
      </template>

      <template v-else>
        <h1 id="onb-title" class="title">Add your first subscription</h1>
        <p class="meta">Start with the one you most want to keep an eye on — a streaming service, a cloud plan, an AI tool.</p>
        <div class="actions">
          <button class="btn" @click="step = 2">Back</button>
          <button class="btn" @click="finish">I'll do it later</button>
          <button class="btn btn-primary" @click="emit('add')">Add subscription</button>
        </div>
      </template>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button v-if="step < 3" class="skip" @click="finish">Skip setup</button>
    </section>
  </main>
</template>

<style scoped>
.page { flex: 1; display: flex; align-items: flex-start; justify-content: center; padding: 10vh 24px 48px; }
.panel { width: min(520px, 100%); display: flex; flex-direction: column; gap: 18px; padding: 36px; }
.progress { display: flex; align-items: center; justify-content: space-between; }
.dots { display: flex; gap: 6px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
.dot.on { background: var(--leaf); }
.wordmark { margin: 8px 0 0; font-size: 40px; font-weight: 300; letter-spacing: -0.04em; color: var(--ink); }
.sub { color: var(--leaf); }
.title { line-height: 1.25; }
.meta { margin: 0; line-height: 1.55; }
.big button { height: 36px; padding: 0 18px; font-size: 14px; }
.actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; }
.error { margin: 0; color: var(--rise); font-weight: 600; }
.skip { align-self: center; border: 0; background: transparent; padding: 0; color: var(--ink-3); font-size: 12px; font-weight: 700; cursor: pointer; }
.skip:hover { color: var(--ink); }
</style>
