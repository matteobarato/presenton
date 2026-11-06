import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { setUnauthorizedHandler } from './api/client'
import { installQuery } from './api/query'
import { installGuards, installUnauthorizedRedirect, router } from './router'
import './styles/base.css'

const app = createApp(App)
app.use(createPinia())
installQuery(app)
installGuards(router)
setUnauthorizedHandler(installUnauthorizedRedirect(router))
app.use(router)
app.mount('#app')
