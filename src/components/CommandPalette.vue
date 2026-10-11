<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface Command {
  id: string
  label: string
  hint: string
  run: () => void
}

const props = defineProps<{ commands: Command[] }>()
const emit = defineEmits<{ close: [] }>()

const query = ref('')
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLUListElement | null>(null)
let previousFocus: HTMLElement | null = null

function score(label: string, q: string): number {
  const text = label.toLocaleLowerCase()
  if (text.startsWith(q)) return 3
  if (text.split(/\s+/).some((w) => w.startsWith(q))) return 2
  if (text.includes(q)) return 1
  let i = 0
  for (const ch of text) if (ch === q[i]) i++
  return i === q.length ? 0.5 : 0
}

const results = computed(() => {
  const q = query.value.trim().toLocaleLowerCase()
  if (!q) return props.commands
  return props.commands
    .map((c) => ({ c, s: score(c.label, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c)
})

watch(query, () => { active.value = 0 })
watch(active, async () => {
  await nextTick()
  list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
})

function run(command: Command | undefined): void {
  if (!command) return
  emit('close')
  command.run()
}

function onKey(e: KeyboardEvent): void {
  const n = results.value.length
  if (e.key === 'ArrowDown' && n) { active.value = (active.value + 1) % n; e.preventDefault() }
  else if (e.key === 'ArrowUp' && n) { active.value = (active.value - 1 + n) % n; e.preventDefault() }
  else if (e.key === 'Enter') { run(results.value[active.value]); e.preventDefault() }
  else if (e.key === 'Escape') { emit('close'); e.preventDefault() }
}

onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null
  input.value?.focus()
})
onBeforeUnmount(() => previousFocus?.focus())
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="palette card" role="dialog" aria-modal="true" aria-label="Command palette">
      <input
        ref="input" v-model="query" class="search" placeholder="Search subscriptions and commands"
        role="combobox" aria-expanded="true" aria-controls="palette-list" autocomplete="off"
        :aria-activedescendant="results[active] ? `cmd-${results[active].id}` : undefined" @keydown="onKey"
      />
      <ul id="palette-list" ref="list" class="list" role="listbox" aria-label="Results">
        <li
          v-for="(c, i) in results" :id="`cmd-${c.id}`" :key="c.id" role="option" :aria-selected="i === active"
          class="option" @mousemove="active = i" @click="run(c)"
        >
          <span class="label">{{ c.label }}</span>
          <span class="hint">{{ c.hint }}</span>
        </li>
      </ul>
      <p v-if="!results.length" class="meta empty">No matches for “{{ query }}”.</p>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(9, 20, 19, 0.28); display: flex; align-items: flex-start; justify-content: center; padding: 96px 16px 16px; }
.palette { width: min(560px, 100%); padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.search { height: 48px; padding: 0 14px; border: 0; border-bottom: 1px solid var(--line); background: transparent; font-size: 16px; font-weight: 600; outline: none; }
.list { margin: 0; padding: 4px 0; list-style: none; max-height: 360px; overflow: auto; }
.option { display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 12px; border-radius: var(--radius-sm); cursor: pointer; }
.option[aria-selected='true'] { background: var(--sunken); }
.label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.hint { flex: none; font-size: 12px; color: var(--ink-3); }
.empty { margin: 0; padding: 12px; }
</style>
