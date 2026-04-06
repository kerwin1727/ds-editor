<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

type CatMode = "roam" | "jump" | "perch" | "sleep";
type CatPose = "run" | "jump" | "sleep";
type MoodLevel = 0 | 1 | 2 | 3;

const cards = [
  {
    path: "/md",
    title: "MD 模式",
    summary: "适合快速写作与结构化内容生产。",
    points: [
      "文本输入高效，适配技术写作",
      "支持样式模板与导出发布链路",
      "适合长文、教程、信息密集型内容",
    ],
  },
  {
    path: "/html",
    title: "HTML 模式",
    summary: "适合排版细调与可视化内容编辑。",
    points: [
      "可视化编辑，所见即所得",
      "图片处理与样式控制更直观",
      "适合营销图文与复杂组件排版",
    ],
  },
] as const;

const weatherMap: Record<number, string> = {
  0: "晴朗",
  1: "少云",
  2: "多云",
  3: "阴天",
  45: "有雾",
  48: "雾凇",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "强毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "阵雨",
  81: "较强阵雨",
  82: "强阵雨",
  95: "雷暴",
};

const ambientSpeech: Record<MoodLevel, string[]> = {
  0: ["喵，我在巡逻，你继续写", "今天也是创作进度拉满的一天"],
  1: ["排版进度不错，继续", "我还在旁边，可以随时投喂"],
  2: ["我仍在跑，但开始无语", "这个页面终于让我有点累了"],
  3: ["……", "今天少说话，默默陪你"],
};

const feedSpeech: Record<MoodLevel, string[]> = {
  0: ["喜欢！再来一点～", "喵！今天心情棒极了", "投喂成功，喜悦 +1"],
  1: ["嗯…还可以，已记下", "谢谢，我先存着", "我吃得还行，你继续忙吧"],
  2: ["你真的很执着…", "好的，又是我。", "我在想，你是不是太闲了"],
  3: ["……", "我现在已经只剩下无语", "还投喂？你开心就好"],
};

const clickSpeech = ["喵喵喵！", "突然点我？那我就三连喵", "喵喵喵，听到了吗？"];

const catSize = 76;
const cardNodes = ref<HTMLElement[]>([]);
const now = ref(new Date());
const locationText = ref("定位中...");
const weatherText = ref("天气获取中...");
const weatherError = ref("");

const themeCyber = ref(false);
const catAwakened = ref(false);
const catMode = ref<CatMode>("sleep");
const catPose = ref<CatPose>("sleep");
const catStyle = ref({
  left: "0px",
  top: "0px",
  transform: "translate3d(0px, 0px, 0) scaleX(1)",
});
const speechStyle = ref({ left: "0px", top: "0px" });
const manualSpeech = ref("");
const feedHint = ref("按住粮 2 秒，可把猫拖回猫窝");
const feedCount = ref(0);
const isFeedPanelOpen = ref(false);

const isCatHovering = ref(false);
const isFoodDragging = ref(false);
const isFoodPressing = ref(false);
const suppressFeedClick = ref(false);

let catX = 0;
let catY = 0;
let velocityX = 140;
let velocityY = 90;
let jumpTarget: { x: number; y: number } | null = null;
let perchUntil = 0;
let headingChangeAt = 0;
let nextActionAt = 0;
let nextAmbientAt = 0;
let forcedNestUntil = 0;
let hoverResumeAt = 0;
let lastFrameTime = 0;

let animationId = 0;
let clockTimer: number | undefined;
let wakeupTimer: number | undefined;
let speechTimer: number | undefined;
let holdTimer: number | undefined;
let audioCtx: AudioContext | null = null;

const timeText = computed(() =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now.value)
);

const dateText = computed(() =>
  new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
  }).format(now.value)
);

const moodLevel = computed<MoodLevel>(() => {
  const count = feedCount.value;
  if (count >= 10) return 3;
  if (count >= 6) return 2;
  if (count >= 3) return 1;
  return 0;
});

const moodText = computed(() => ["开心", "还行", "有点无语", "很无语"][moodLevel.value]);

const moodClass = computed(() => `mood-${moodLevel.value}`);

const catSpeech = computed(() => {
  if (manualSpeech.value) return manualSpeech.value;
  if (!catAwakened.value) return "先等我十秒出窝";
  if (catMode.value === "sleep") return "呼…Zz";
  return ambientSpeech[moodLevel.value][0];
});

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function setSpeech(text: string, ms = 2000) {
  manualSpeech.value = text;
  if (speechTimer) window.clearTimeout(speechTimer);
  speechTimer = window.setTimeout(() => {
    manualSpeech.value = "";
  }, ms);
}

function getNestPos() {
  return {
    x: Math.max(0, window.innerWidth - 154),
    y: Math.max(8, window.innerHeight - 142),
  };
}

function updateCards() {
  cardNodes.value = Array.from(document.querySelectorAll<HTMLElement>(".mode-card"));
}

function clampCat() {
  const maxX = Math.max(0, window.innerWidth - catSize);
  const maxY = Math.max(0, window.innerHeight - catSize - 10);
  catX = Math.max(0, Math.min(maxX, catX));
  catY = Math.max(6, Math.min(maxY, catY));
}

function syncCat() {
  catStyle.value = {
    left: "0px",
    top: "0px",
    transform: `translate3d(${Math.round(catX)}px, ${Math.round(catY)}px, 0) scaleX(${
      velocityX >= 0 ? 1 : -1
    })`,
  };
  speechStyle.value = {
    left: `${Math.round(catX + catSize * 0.5)}px`,
    top: `${Math.max(14, Math.round(catY - 12))}px`,
  };
}

function glideToNest(rate = 0.12) {
  const nest = getNestPos();
  catX += (nest.x - catX) * rate;
  catY += (nest.y - catY) * rate;
  velocityX = velocityX >= 0 ? 1 : -1;
  velocityY = 0;
}

function setRandomDirection(forceDown = false) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 120 + Math.random() * 110;
  velocityX = Math.cos(angle) * speed;
  velocityY = Math.sin(angle) * speed;
  if (forceDown && velocityY < 20) velocityY = Math.abs(velocityY) + 70;
}

function startJump(ts: number) {
  if (!cardNodes.value.length) return false;
  const card = pickRandom(cardNodes.value);
  const rect = card.getBoundingClientRect();
  jumpTarget = {
    x: Math.max(0, Math.min(window.innerWidth - catSize, rect.left + rect.width * 0.5 - catSize * 0.5)),
    y: Math.max(6, Math.min(window.innerHeight - catSize - 10, rect.top - catSize * 0.56)),
  };
  catMode.value = "jump";
  catPose.value = "jump";
  nextActionAt = ts + 1300;
  return true;
}

function activateCyber() {
  if (themeCyber.value) return;
  themeCyber.value = true;
  catAwakened.value = true;
  catMode.value = "roam";
  catPose.value = "run";
  setRandomDirection(true);
  const ts = performance.now();
  headingChangeAt = ts + 800;
  nextActionAt = ts + 1200;
  nextAmbientAt = ts + 2200;
  setSpeech("喵，赛博巡逻模式启动！", 2400);
}

function scheduleWakeup(delay = 10000) {
  if (wakeupTimer) window.clearTimeout(wakeupTimer);
  wakeupTimer = window.setTimeout(() => {
    activateCyber();
  }, delay);
}

function resetToSimpleTheme() {
  themeCyber.value = false;
  catAwakened.value = false;
  isFeedPanelOpen.value = false;
  scheduleWakeup(10000);
}

function tick(ts: number) {
  if (!lastFrameTime) lastFrameTime = ts;
  const dt = Math.min(0.05, (ts - lastFrameTime) / 1000);
  lastFrameTime = ts;

  if (!catAwakened.value) {
    catMode.value = "sleep";
    catPose.value = "sleep";
    glideToNest(0.16);
    clampCat();
    syncCat();
    animationId = window.requestAnimationFrame(tick);
    return;
  }

  if (isFoodDragging.value) {
    catMode.value = "roam";
    catPose.value = "run";
    clampCat();
    syncCat();
    animationId = window.requestAnimationFrame(tick);
    return;
  }

  if (ts < forcedNestUntil) {
    catMode.value = "sleep";
    catPose.value = "sleep";
    glideToNest(0.12);
    clampCat();
    syncCat();
    animationId = window.requestAnimationFrame(tick);
    return;
  }

  if (catMode.value === "sleep") {
    catMode.value = "roam";
    catPose.value = "run";
    setRandomDirection(true);
    headingChangeAt = ts + 900;
    nextActionAt = ts + 1400;
  }

  if (isCatHovering.value || ts < hoverResumeAt) {
    syncCat();
    animationId = window.requestAnimationFrame(tick);
    return;
  }

  if (catMode.value === "jump" && jumpTarget) {
    const dx = jumpTarget.x - catX;
    const dy = jumpTarget.y - catY;
    const distance = Math.hypot(dx, dy);
    if (distance < 8) {
      catX = jumpTarget.x;
      catY = jumpTarget.y;
      jumpTarget = null;
      catMode.value = "perch";
      catPose.value = "run";
      perchUntil = ts + 600 + Math.random() * 1000;
      velocityX = Math.random() > 0.5 ? 130 : -130;
      velocityY = 70;
    } else {
      const speed = 310;
      velocityX = (dx / distance) * speed;
      velocityY = (dy / distance) * speed;
      catX += velocityX * dt;
      catY += velocityY * dt;
    }
    clampCat();
    syncCat();
    animationId = window.requestAnimationFrame(tick);
    return;
  }

  if (catMode.value === "perch") {
    if (ts >= perchUntil) {
      catMode.value = "roam";
      setRandomDirection(true);
      headingChangeAt = ts + 900 + Math.random() * 1200;
      nextActionAt = ts + 1200 + Math.random() * 1800;
    } else {
      catY += Math.sin(ts / 100) * 0.2;
      syncCat();
      animationId = window.requestAnimationFrame(tick);
      return;
    }
  }

  if (ts >= headingChangeAt) {
    setRandomDirection();
    headingChangeAt = ts + 900 + Math.random() * 2200;
  }

  if (ts >= nextActionAt) {
    if (!startJump(ts)) nextActionAt = ts + 1300 + Math.random() * 2200;
  }

  if (ts >= nextAmbientAt && !manualSpeech.value) {
    setSpeech(pickRandom(ambientSpeech[moodLevel.value]), 1700);
    nextAmbientAt = ts + 5000 + Math.random() * 3200;
  }

  catX += velocityX * dt;
  catY += velocityY * dt;

  const maxX = Math.max(0, window.innerWidth - catSize);
  const maxY = Math.max(0, window.innerHeight - catSize - 10);
  if (catX <= 0) {
    catX = 0;
    velocityX = Math.abs(velocityX);
  } else if (catX >= maxX) {
    catX = maxX;
    velocityX = -Math.abs(velocityX);
  }
  if (catY <= 6) {
    catY = 6;
    velocityY = Math.abs(velocityY) + 12;
  } else if (catY >= maxY) {
    catY = maxY;
    velocityY = -Math.abs(velocityY) * 0.86;
  }

  clampCat();
  syncCat();
  animationId = window.requestAnimationFrame(tick);
}

function ensureAudio() {
  const Ctx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function playOneMeow(offset = 0, gainPeak = 0.12) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const start = ctx.currentTime + offset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(640, start);
  osc.frequency.exponentialRampToValueAtTime(1020, start + 0.11);
  osc.frequency.exponentialRampToValueAtTime(760, start + 0.24);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.26);
}

function playTrioMeow() {
  playOneMeow(0.01, 0.13);
  playOneMeow(0.19, 0.11);
  playOneMeow(0.38, 0.11);
}

function onCatEnter() {
  isCatHovering.value = true;
  hoverResumeAt = 0;
}

function onCatLeave() {
  isCatHovering.value = false;
  hoverResumeAt = performance.now() + 1000;
}

function onCatClick() {
  setSpeech(pickRandom(clickSpeech), 1600);
  playTrioMeow();
}

function toggleFeedPanel() {
  isFeedPanelOpen.value = !isFeedPanelOpen.value;
}

function closeFeedPanel() {
  isFeedPanelOpen.value = false;
}

function onFeedClick() {
  if (suppressFeedClick.value) {
    suppressFeedClick.value = false;
    return;
  }
  if (!catAwakened.value) {
    setSpeech("先等我十秒出窝", 1400);
    return;
  }
  feedCount.value += 1;
  setSpeech(pickRandom(feedSpeech[moodLevel.value]), 2100);
  if (moodLevel.value <= 1) playOneMeow(0.01, 0.1);
}

function clearHoldTimer() {
  if (holdTimer) {
    window.clearTimeout(holdTimer);
    holdTimer = undefined;
  }
}

function removeFoodListeners() {
  window.removeEventListener("pointermove", onFoodMove);
  window.removeEventListener("pointerup", onFoodUp);
  window.removeEventListener("pointercancel", onFoodUp);
}

function onFoodMove(e: PointerEvent) {
  if (!isFoodDragging.value) return;
  catX = e.clientX - catSize * 0.5;
  catY = e.clientY - catSize * 0.62;
  if (Math.abs(e.movementX) > 0.2) velocityX = e.movementX > 0 ? 140 : -140;
  clampCat();
  syncCat();
}

function onFoodUp() {
  clearHoldTimer();
  const dragging = isFoodDragging.value;
  isFoodDragging.value = false;
  isFoodPressing.value = false;
  feedHint.value = "按住粮 2 秒，可把猫拖回猫窝";
  removeFoodListeners();

  if (!dragging) return;

  const nest = getNestPos();
  const d = Math.hypot(catX - nest.x, catY - nest.y);
  if (d <= 120) {
    catX = nest.x;
    catY = nest.y;
    catMode.value = "sleep";
    catPose.value = "sleep";
    forcedNestUntil = performance.now() + 7000;
    resetToSimpleTheme();
    setSpeech("好吧，已经被拖回窝里了", 2200);
    syncCat();
  } else {
    catMode.value = "roam";
    catPose.value = "run";
    setSpeech("差一点，再往猫窝拖一点", 1800);
  }
}

function onFoodDown(e: PointerEvent) {
  if (e.button !== 0) return;
  if (!catAwakened.value) {
    setSpeech("先等我十秒出窝", 1400);
    return;
  }
  e.preventDefault();
  isFoodPressing.value = true;
  feedHint.value = "继续按住，2 秒后可拖动";
  clearHoldTimer();
  holdTimer = window.setTimeout(() => {
    if (!isFoodPressing.value) return;
    isFoodDragging.value = true;
    suppressFeedClick.value = true;
    feedHint.value = "正在用粮引导，拖它回猫窝";
    setSpeech("好吧，我跟着粮走…", 1800);
  }, 2000);

  window.addEventListener("pointermove", onFoodMove);
  window.addEventListener("pointerup", onFoodUp);
  window.addEventListener("pointercancel", onFoodUp);
}

async function initWeather() {
  weatherError.value = "";
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("no-geo"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 300000,
      });
    });
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const [weatherRes, reverseRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`
      ),
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=zh-CN`
      ),
    ]);
    if (!weatherRes.ok || !reverseRes.ok) throw new Error("fetch-failed");
    const weatherJson = await weatherRes.json();
    const reverseJson = await reverseRes.json();
    const c = weatherJson?.current;
    const addr = reverseJson?.address || {};
    locationText.value = addr.city || addr.town || addr.county || addr.state || reverseJson?.name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    weatherText.value = `${weatherMap[c?.weather_code] || "天气变化中"} · ${Math.round(c?.temperature_2m || 0)}°C`;
    return;
  } catch {
    // fallback IP
  }

  try {
    const ipRes = await fetch("https://ipapi.co/json/");
    if (!ipRes.ok) throw new Error("ip-fail");
    const ip = await ipRes.json();
    const lat = Number(ip?.latitude);
    const lon = Number(ip?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("ip-invalid");
    locationText.value = ip?.city || ip?.region || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`
    );
    if (!w.ok) throw new Error("weather-fail");
    const j = await w.json();
    weatherText.value = `${weatherMap[j?.current?.weather_code] || "天气变化中"} · ${Math.round(j?.current?.temperature_2m || 0)}°C`;
  } catch {
    weatherText.value = "天气暂不可用";
    locationText.value = "位置暂不可用";
    weatherError.value = "未能获取实时定位与天气";
  }
}

function onResize() {
  updateCards();
  if (!catAwakened.value || performance.now() < forcedNestUntil) {
    const nest = getNestPos();
    catX = nest.x;
    catY = nest.y;
  }
  clampCat();
  syncCat();
}

onMounted(() => {
  updateCards();
  const nest = getNestPos();
  catX = nest.x;
  catY = nest.y;
  syncCat();
  animationId = window.requestAnimationFrame(tick);

  clockTimer = window.setInterval(() => {
    now.value = new Date();
  }, 1000);

  scheduleWakeup(10000);

  window.addEventListener("resize", onResize);
  void initWeather();
});

onBeforeUnmount(() => {
  if (animationId) window.cancelAnimationFrame(animationId);
  if (clockTimer) window.clearInterval(clockTimer);
  if (wakeupTimer) window.clearTimeout(wakeupTimer);
  if (speechTimer) window.clearTimeout(speechTimer);
  clearHoldTimer();
  removeFoodListeners();
  if (audioCtx && audioCtx.state !== "closed") void audioCtx.close();
  window.removeEventListener("resize", onResize);
});
</script>

<template>
  <main class="home-page" :class="{ cyber: themeCyber }">
    <aside class="time-panel">
      <p class="clock">{{ timeText }}</p>
      <p class="date">{{ dateText }}</p>
      <div class="meta-row">
        <span class="meta-title">位置</span>
        <span class="meta-value">{{ locationText }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-title">天气</span>
        <span class="meta-value">{{ weatherText }}</span>
      </div>
      <p v-if="weatherError" class="meta-error">{{ weatherError }}</p>
    </aside>
    <div class="content-wrap">
      <section class="hero">
        <p class="eyebrow">WX Editor</p>
        <h1>一站式公众号内容编辑</h1>
        <p class="summary">同时提供 Markdown 与可视化 HTML 两种工作流。先专注内容，再精修排版。</p>
        <div class="actions">
          <RouterLink class="entry-btn primary" to="/md">进入 MD 模式</RouterLink>
          <RouterLink class="entry-btn secondary" to="/html">进入 HTML 模式</RouterLink>
        </div>
      </section>

      <section class="cards">
        <article v-for="card in cards" :key="card.path" class="mode-card">
          <h2>{{ card.title }}</h2>
          <p>{{ card.summary }}</p>
          <ul>
            <li v-for="point in card.points" :key="point">{{ point }}</li>
          </ul>
          <RouterLink class="card-link" :to="card.path">立即使用</RouterLink>
        </article>
      </section>
    </div>


    <div class="cat-layer">
      <div class="cat-nest" :class="{ open: isFeedPanelOpen }" @click="toggleFeedPanel">
        <span class="nest-label">猫窝</span>
        <button
          v-if="isFeedPanelOpen"
          class="feed-close"
          type="button"
          aria-label="关闭投喂面板"
          @click.stop="closeFeedPanel"
        >
          ×
        </button>
        <div v-show="isFeedPanelOpen" class="feed-panel" @click.stop>
          <button
            class="feed-btn"
            :class="{ pressing: isFoodPressing }"
            type="button"
            @click.stop="onFeedClick"
            @pointerdown="onFoodDown"
            @contextmenu.prevent
          >
            <span class="feed-icon">+</span>
            <span>投喂</span>
          </button>
          <p class="feed-hint">{{ feedHint }}</p>
          <p class="feed-meta" :class="moodClass">已投喂 {{ feedCount }} 次</p>
          <p class="feed-sub">心情：{{ moodText }}</p>
        </div>
      </div>

      <p class="cat-speech" :style="speechStyle">{{ catSpeech }}</p>

      <div
        class="cyber-cat"
        :class="[`is-${catPose}`, `mode-${catMode}`]"
        :style="catStyle"
        @mouseenter="onCatEnter"
        @mouseleave="onCatLeave"
        @click="onCatClick"
      >
        <span class="cat-ear left"></span>
        <span class="cat-ear right"></span>
        <span class="cat-face">
          <span class="cat-eye left"></span>
          <span class="cat-eye right"></span>
          <span class="cat-mouth"></span>
        </span>
        <span class="cat-tail"></span>
        <span v-if="catMode === 'sleep'" class="sleep-z">Zz</span>
      </div>
    </div>
  </main>
</template>

<style scoped lang="less">
.home-page {
  --text: #152238;
  --sub: #5a6b82;
  --title: #0f1c2e;
  --panel-bg: rgba(255, 255, 255, 0.9);
  --panel-bd: rgba(148, 163, 184, 0.34);
  --panel-shadow: 0 12px 28px rgba(15, 23, 42, 0.1);
  --card-bg: rgba(255, 255, 255, 0.88);
  --card-bd: rgba(148, 163, 184, 0.36);
  --card-shadow: 0 14px 26px rgba(15, 23, 42, 0.09);
  --secondary-text: #24364f;
  --secondary-bg: rgba(255, 255, 255, 0.9);
  --secondary-bd: rgba(148, 163, 184, 0.55);
  --nest-bg: linear-gradient(160deg, rgba(231, 237, 245, 0.92), rgba(212, 223, 238, 0.92));
  --nest-bd: rgba(138, 157, 185, 0.66);
  --nest-label: #3b4f6f;
  --feed-bg: rgba(255, 255, 255, 0.95);
  --feed-bd: rgba(148, 163, 184, 0.44);
  --feed-hint: #607089;
  --speech-bg: rgba(255, 255, 255, 0.96);
  --speech-bd: rgba(14, 165, 233, 0.32);
  --speech-text: #102039;
  --grid-opacity: 0;
  --cyber-opacity: 0;
  position: relative;
  min-height: 100vh;
  padding: 56px 24px 72px;
  overflow: hidden;
  color: var(--text);
  background:
    radial-gradient(1100px 520px at 82% -80px, rgba(14, 165, 233, 0.08), transparent 60%),
    radial-gradient(900px 560px at 12% 120%, rgba(56, 189, 248, 0.08), transparent 60%),
    linear-gradient(180deg, #f7fafc 0%, #edf3f8 100%);
  font-family: "Space Grotesk", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  transition: color 1.2s ease, background-color 1.2s ease;
}

.home-page.cyber {
  --text: #dbe8ff;
  --sub: rgba(208, 226, 255, 0.86);
  --title: #eef6ff;
  --panel-bg: rgba(7, 16, 34, 0.74);
  --panel-bd: rgba(120, 186, 255, 0.38);
  --panel-shadow: 0 14px 28px rgba(3, 7, 18, 0.45);
  --card-bg: rgba(9, 18, 40, 0.72);
  --card-bd: rgba(143, 199, 255, 0.3);
  --card-shadow: 0 14px 28px rgba(2, 8, 22, 0.4);
  --secondary-text: #dbeafe;
  --secondary-bg: rgba(20, 30, 58, 0.66);
  --secondary-bd: rgba(125, 211, 252, 0.42);
  --nest-bg: linear-gradient(160deg, rgba(102, 88, 255, 0.56), rgba(235, 74, 192, 0.56));
  --nest-bd: rgba(255, 182, 228, 0.46);
  --nest-label: rgba(241, 245, 255, 0.92);
  --feed-bg: rgba(8, 18, 38, 0.88);
  --feed-bd: rgba(125, 211, 252, 0.4);
  --feed-hint: rgba(186, 230, 253, 0.75);
  --speech-bg: rgba(7, 16, 34, 0.9);
  --speech-bd: rgba(103, 232, 249, 0.42);
  --speech-text: #e6f8ff;
  --grid-opacity: 0.28;
  --cyber-opacity: 1;
}

.home-page::before,
.home-page::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition: opacity 2.4s ease;
}

.home-page::before {
  opacity: var(--grid-opacity);
  background-image:
    linear-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56, 189, 248, 0.08) 1px, transparent 1px);
  background-size: 26px 26px;
}

.home-page::after {
  opacity: var(--cyber-opacity);
  background:
    radial-gradient(1180px 600px at 82% -110px, rgba(36, 205, 255, 0.2), transparent 60%),
    radial-gradient(900px 520px at 10% 118%, rgba(255, 79, 200, 0.14), transparent 55%),
    linear-gradient(180deg, rgba(7, 16, 34, 0.96) 0%, rgba(10, 23, 48, 0.92) 45%, rgba(7, 16, 34, 0.96) 100%);
}

.time-panel,
.content-wrap {
  position: relative;
  z-index: 4;
}

.time-panel {
  position: fixed;
  top: 18px;
  right: 20px;
  z-index: 26;
  width: min(304px, calc(100vw - 40px));
  padding: 14px 16px 12px;
  border: 1px solid var(--panel-bd);
  border-radius: 15px;
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(7px);
  transition: all 1.2s ease;
}

.time-panel::before {
  content: "";
  position: absolute;
  left: 16px;
  right: 16px;
  top: 44px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(14, 165, 233, 0.35), transparent);
  pointer-events: none;
}

.clock {
  margin: 0;
  color: var(--title);
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.05em;
  font-family: "JetBrains Mono", "Consolas", monospace;
  transition: color 1.2s ease;
}

.date {
  margin: 7px 0 0;
  font-size: 12px;
  color: var(--sub);
}

.meta-row {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.meta-title {
  color: var(--sub);
}

.meta-value {
  max-width: 178px;
  text-align: right;
  color: var(--text);
}

.meta-error {
  margin: 10px 0 0;
  color: #ef4444;
  font-size: 12px;
}

.content-wrap {
  max-width: 1160px;
  margin: 0 auto;
  padding-right: 330px;
}

.hero {
  max-width: 760px;
  margin: 0;
}

.eyebrow {
  margin: 0 0 12px;
  color: #06b6d4;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: var(--title);
  font-size: clamp(34px, 5vw, 52px);
  line-height: 1.08;
  transition: color 1.2s ease;
}

.home-page.cyber h1 {
  text-shadow: 0 8px 20px rgba(9, 28, 70, 0.5);
}

.summary {
  margin: 18px 0 0;
  max-width: 700px;
  color: var(--sub);
  font-size: 16px;
  line-height: 1.8;
}

.actions {
  margin-top: 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.entry-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 180px;
  height: 46px;
  padding: 0 22px;
  border-radius: 999px;
  text-decoration: none;
  font-size: 15px;
  font-weight: 700;
  transition: transform 0.15s ease;
}

.entry-btn:hover {
  transform: translateY(-2px);
}

.entry-btn.primary {
  color: #f8fbff;
  background: linear-gradient(90deg, #0ea5e9 0%, #14b8a6 100%);
  box-shadow: 0 10px 22px rgba(14, 165, 233, 0.3);
}

.entry-btn.secondary {
  color: var(--secondary-text);
  border: 1px solid var(--secondary-bd);
  background: var(--secondary-bg);
}

.cards {
  max-width: 780px;
  margin: 36px 0 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.mode-card {
  padding: 22px 22px 20px;
  border: 1px solid var(--card-bd);
  border-radius: 16px;
  background: var(--card-bg);
  box-shadow: var(--card-shadow);
  transition: all 1.2s ease;
}

.mode-card h2 {
  margin: 0;
  color: var(--title);
  font-size: 20px;
}

.mode-card p {
  margin: 10px 0 0;
  color: var(--sub);
  font-size: 14px;
}

.mode-card ul {
  margin: 12px 0 0;
  padding-left: 18px;
  color: var(--text);
  font-size: 14px;
  line-height: 1.75;
}

.card-link {
  display: inline-flex;
  align-items: center;
  margin-top: 14px;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  color: #67e8f9;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  background: rgba(14, 165, 233, 0.14);
}

.cat-layer {
  position: fixed;
  inset: 0;
  z-index: 18;
  pointer-events: none;
}

.cat-nest {
  position: absolute;
  right: 20px;
  bottom: 18px;
  width: 108px;
  height: 52px;
  border-radius: 50px 50px 42px 42px;
  border: 1px solid var(--nest-bd);
  background: var(--nest-bg);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.18);
  cursor: pointer;
  pointer-events: auto;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.cat-nest:hover {
  transform: translateY(-1px);
}

.cat-nest.open {
  box-shadow:
    0 14px 24px rgba(15, 23, 42, 0.2),
    0 0 0 1px rgba(14, 165, 233, 0.25);
}

.nest-label {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  color: var(--nest-label);
  pointer-events: none;
}

.feed-close {
  position: absolute;
  right: -6px;
  top: -8px;
  width: 20px;
  height: 20px;
  border: 1px solid var(--feed-bd);
  border-radius: 999px;
  color: var(--text);
  font-size: 13px;
  line-height: 1;
  background: var(--feed-bg);
  cursor: pointer;
  pointer-events: auto;
}

.feed-panel {
  position: absolute;
  right: 0;
  bottom: 62px;
  width: 176px;
  padding: 10px 11px;
  border: 1px solid var(--feed-bd);
  border-radius: 12px;
  background: var(--feed-bg);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.16);
  pointer-events: auto;
}

.feed-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(34, 211, 238, 0.48);
  border-radius: 999px;
  color: #ecfeff;
  font-size: 13px;
  font-weight: 700;
  background: linear-gradient(90deg, rgba(14, 165, 233, 0.72), rgba(34, 197, 94, 0.64));
  cursor: pointer;
}

.feed-btn.pressing {
  transform: scale(0.99);
}

.feed-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  color: #0f172a;
  font-weight: 800;
  background: #67e8f9;
}

.feed-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--feed-hint);
  line-height: 1.35;
}

.feed-meta {
  margin: 8px 0 0;
  font-size: 12px;
}

.feed-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--sub);
}

.mood-0 {
  color: #22c55e;
}

.mood-1 {
  color: #06b6d4;
}

.mood-2 {
  color: #f59e0b;
}

.mood-3 {
  color: #ef4444;
}

.cat-speech {
  position: absolute;
  margin: 0;
  padding: 6px 10px;
  border: 1px solid var(--speech-bd);
  border-radius: 10px;
  background: var(--speech-bg);
  color: var(--speech-text);
  font-size: 12px;
  white-space: nowrap;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.16);
  transform: translate(-50%, -100%);
}

.cyber-cat {
  position: absolute;
  width: 76px;
  height: 58px;
  pointer-events: auto;
  cursor: pointer;
  filter: drop-shadow(0 5px 14px rgba(34, 211, 238, 0.35));
}

.cat-face {
  position: absolute;
  inset: 10px 8px 6px;
  border: 1px solid rgba(125, 211, 252, 0.85);
  border-radius: 18px 18px 16px 16px;
  background: linear-gradient(140deg, rgba(12, 27, 56, 0.95), rgba(17, 39, 72, 0.95));
}

.cat-ear {
  position: absolute;
  top: 0;
  width: 18px;
  height: 16px;
  border: 1px solid rgba(125, 211, 252, 0.82);
  background: linear-gradient(160deg, rgba(14, 165, 233, 0.72), rgba(236, 72, 153, 0.72));
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}

.cat-ear.left {
  left: 12px;
}

.cat-ear.right {
  right: 12px;
}

.cat-eye {
  position: absolute;
  top: 18px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #67e8f9;
}

.cat-eye.left {
  left: 18px;
}

.cat-eye.right {
  right: 18px;
}

.cyber-cat.mode-sleep .cat-eye {
  top: 22px;
  height: 2px;
  border-radius: 4px;
}

.cat-mouth {
  position: absolute;
  left: 50%;
  bottom: 10px;
  width: 12px;
  height: 8px;
  border-bottom: 1px solid rgba(186, 230, 253, 0.9);
  border-radius: 0 0 12px 12px;
  transform: translateX(-50%);
}

.cat-tail {
  position: absolute;
  right: -6px;
  top: 28px;
  width: 24px;
  height: 12px;
  border: 1px solid rgba(125, 211, 252, 0.72);
  border-radius: 0 999px 999px 0;
  border-left: none;
}

.cyber-cat.is-run .cat-tail {
  animation: sway 0.32s ease-in-out infinite alternate;
}

.cyber-cat.is-jump .cat-tail {
  animation: sway 0.18s ease-in-out infinite alternate;
}

.sleep-z {
  position: absolute;
  right: -10px;
  top: -12px;
  color: #f9a8d4;
  font-size: 13px;
  font-weight: 700;
}

@keyframes sway {
  from {
    transform: rotate(-7deg);
  }

  to {
    transform: rotate(9deg);
  }
}

@media (max-width: 1120px) {
  .content-wrap {
    padding-right: 0;
    padding-top: 128px;
  }

  .time-panel {
    position: absolute;
    top: 14px;
    left: 14px;
    right: 14px;
    width: auto;
  }
}

@media (max-width: 860px) {
  .home-page {
    padding: 24px 14px 72px;
  }

  .cards {
    grid-template-columns: 1fr;
    max-width: 100%;
  }

  .cat-nest {
    right: 12px;
    bottom: 10px;
    transform: scale(0.9);
    transform-origin: right bottom;
  }

  .feed-panel {
    width: 156px;
  }
}
</style>





