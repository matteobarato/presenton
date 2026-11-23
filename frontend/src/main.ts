import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { setUnauthorizedHandler } from './api/client'
import { installQuery } from './api/query'
import { installGuards, installUnauthorizedRedirect, router } from './router'
import { initTheme } from './composables/useTheme'
import { i18n, setUiLocale } from './i18n'
import './styles/base.css'

initTheme()
setUiLocale(i18n.global.locale.value as 'en' | 'it')

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
installQuery(app)
installGuards(router)
setUnauthorizedHandler(installUnauthorizedRedirect(router))
app.use(router)
app.mount('#app')
