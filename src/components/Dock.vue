<script setup lang="ts">
export type View = 'overview' | 'calendar' | 'subscriptions' | 'categories' | 'settings' | 'import'

const view = defineModel<View>({ required: true })
defineEmits<{ add: []; search: [] }>()

const items: { id: View; label: string; key: string }[] = [
  { id: 'overview', label: 'Overview', key: '⌘1' },
  { id: 'calendar', label: 'Calendar', key: '⌘2' },
  { id: 'subscriptions', label: 'Subscriptions', key: '⌘3' },
  { id: 'categories', label: 'Categories', key: '⌘4' },
]
</script>

<template>
  <nav class="dock" aria-label="Main">
    <button
      v-for="item in items"
      :key="item.id"
      class="item"
      :aria-current="view === item.id ? 'page' : undefined"
      :title="`${item.label} (${item.key})`"
      @click="view = item.id"
    >
      <span v-if="view === item.id" class="dot" aria-hidden="true" />{{ item.label }}
    </button>
    <span class="sep" aria-hidden="true" />
    <button class="item search" aria-label="Search (⌘K)" title="Search (⌘K)" @click="$emit('search')">⌘K</button>
    <button class="add" aria-label="Add subscription (⌘N)" title="Add subscription (⌘N)" @click="$emit('add')">+</button>
    <button
      class="item gear" aria-label="Settings (⌘,)" title="Settings (⌘,)"
      :aria-current="view === 'settings' ? 'page' : undefined" @click="view = 'settings'"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  </nav>
</template>

<style scoped>
.dock {
  display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px;
  background: var(--dock); border-radius: var(--radius-pill); box-shadow: var(--shadow-dock);
}
.item {
  display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px;
  border: 0; border-radius: var(--radius-pill); background: transparent;
  color: var(--on-dock-2); font-size: 13px; font-weight: 600; cursor: pointer;
}
.item:hover { color: var(--on-dock); }
.item[aria-current='page'] { background: rgba(223, 244, 235, 0.12); color: var(--on-dock); }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--leaf); }
.sep { width: 1px; height: 20px; background: rgba(223, 244, 235, 0.16); margin: 0 4px; }
.search { padding: 0 12px; font-size: 12px; font-weight: 700; }
.gear { width: 36px; padding: 0; justify-content: center; }
.add {
  width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer;
  background: #B0E4CC; color: #091413; font-size: 18px; font-weight: 600;
}
</style>
