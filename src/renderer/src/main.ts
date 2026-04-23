import { createApp } from "vue";
import { createPinia } from "pinia";
import { PiniaColada } from "@pinia/colada";
import App from "./App.vue";
import "./assets/main.css";

document.documentElement.classList.add("dark");

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(PiniaColada);
app.mount("#app");
