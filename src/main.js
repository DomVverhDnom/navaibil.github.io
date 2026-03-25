import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { useAuth } from './composables/useAuth'

async function main() {
  const app = createApp(App)
  app.use(router)
  const { prepareAuth } = useAuth()
  await prepareAuth()
  app.mount('#app')
}

main()
