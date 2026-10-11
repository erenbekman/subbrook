<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  name: string
  color?: string | null // cat-1 … cat-6
  size?: number
  trial?: boolean
}>(), { color: 'cat-1', size: 36, trial: false })

const style = computed(() => {
  const c = props.color || 'cat-1'
  const base = {
    width: `${props.size}px`,
    height: `${props.size}px`,
    borderRadius: `${Math.round(props.size / 3)}px`,
    fontSize: `${Math.round(props.size * 0.42)}px`,
  }
  return props.trial
    ? { ...base, border: '1.5px dashed var(--trial)', color: 'var(--trial)' }
    : { ...base, background: `var(--${c}-soft)`, color: `var(--${c})` }
})
</script>

<template>
  <span class="tile" :style="style" aria-hidden="true">{{ name.trim().charAt(0).toUpperCase() || '?' }}</span>
</template>

<style scoped>
.tile { flex: none; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; }
</style>
