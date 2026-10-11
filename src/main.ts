import { createApp } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App.vue'
import TrayApp from './TrayApp.vue'
import { applyTheme } from './lib/theme'
import './styles/tokens.css'
import './styles/base.css'

applyTheme()

createApp(getCurrentWindow().label === 'tray' ? TrayApp : App).mount('#app')
