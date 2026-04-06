import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '@/views/HomePage.vue'
import CodemirrorEditor from '@/views/CodemirrorEditor.vue'
import HtmlModeEditor from '@/views/HtmlModeEditor.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: `/`,
      name: `home`,
      component: HomePage,
    },
    {
      path: `/md`,
      alias: [`/md/`],
      name: `md-editor`,
      component: CodemirrorEditor,
    },
    {
      path: `/html`,
      alias: [`/html/`],
      name: `html-editor`,
      component: HtmlModeEditor,
    },
    {
      path: `/:pathMatch(.*)*`,
      redirect: `/`,
    },
  ],
})

export default router
