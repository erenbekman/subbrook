export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'subbrook.theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): ThemeChoice {
  const value = localStorage.getItem(KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function applyTheme(): void {
  const choice = getTheme()
  document.documentElement.dataset.theme = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice
}

export function setTheme(choice: ThemeChoice): void {
  if (choice === 'system') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, choice)
  applyTheme()
}

media.addEventListener('change', applyTheme)
