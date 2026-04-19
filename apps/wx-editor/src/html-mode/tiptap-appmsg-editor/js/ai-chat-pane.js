import { createPinia } from "pinia";
import { createApp } from "vue";
import HtmlModeAIChatPane from "../components/HtmlModeAIChatPane.vue";

let aiChatApp = null;

function unmountHtmlModeAIChatPane() {
  if (!aiChatApp) {
    return;
  }

  aiChatApp.unmount();
  aiChatApp = null;
}

function mountHtmlModeAIChatPane() {
  const mountTarget = document.querySelector(".html-mode-ai-chat-root");
  if (!mountTarget) {
    return null;
  }

  unmountHtmlModeAIChatPane();

  aiChatApp = createApp(HtmlModeAIChatPane);
  aiChatApp.use(createPinia());
  aiChatApp.mount(mountTarget);

  return aiChatApp;
}

export { mountHtmlModeAIChatPane, unmountHtmlModeAIChatPane };
