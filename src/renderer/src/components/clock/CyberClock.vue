<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const digits = ref(["0", "0", "0", "0", "0", "0"]);
const dateStr = ref("");
const weekdayStr = ref("");
const flipping = ref([false, false, false, false, false, false]);
let prevDigits = ["", "", "", "", "", ""];
let timer: ReturnType<typeof setInterval> | null = null;

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const current = [h[0], h[1], m[0], m[1], s[0], s[1]];

  current.forEach((d, i) => {
    if (d !== prevDigits[i]) {
      flipping.value[i] = true;
      setTimeout(() => {
        flipping.value[i] = false;
      }, 400);
    }
  });

  digits.value = current;
  prevDigits = [...current];

  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const da = String(now.getDate()).padStart(2, "0");
  dateStr.value = `${y}-${mo}-${da}`;
  weekdayStr.value = weekdays[now.getDay()];
}

onMounted(() => {
  updateClock();
  timer = setInterval(updateClock, 200);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div data-testid="cyber-clock" class="cyber-clock">
    <div class="clock-container">
      <!-- 扫描线 -->
      <div class="scanline" />

      <!-- 背景光晕 -->
      <div class="glow glow-cyan" />
      <div class="glow glow-purple" />

      <!-- 时间行 -->
      <div class="time-row">
        <div class="digit-box">
          <span class="digit" :class="{ flip: flipping[0] }">{{ digits[0] }}</span>
        </div>
        <div class="digit-box">
          <span class="digit" :class="{ flip: flipping[1] }">{{ digits[1] }}</span>
        </div>
        <span class="colon">:</span>
        <div class="digit-box">
          <span class="digit" :class="{ flip: flipping[2] }">{{ digits[2] }}</span>
        </div>
        <div class="digit-box">
          <span class="digit" :class="{ flip: flipping[3] }">{{ digits[3] }}</span>
        </div>
        <span class="colon">:</span>
        <div class="digit-box">
          <span class="digit" :class="{ flip: flipping[4] }">{{ digits[4] }}</span>
        </div>
        <div class="digit-box">
          <span class="digit" :class="{ flip: flipping[5] }">{{ digits[5] }}</span>
        </div>
      </div>

      <!-- 日期和星期 -->
      <div class="info-row">
        <span class="date-text">{{ dateStr }}</span>
        <span class="dot-sep" />
        <span class="weekday-text">{{ weekdayStr }}</span>
      </div>

      <!-- 底部装饰线 -->
      <div class="bottom-line" />
    </div>
  </div>
</template>

<style scoped>
.cyber-clock {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: hsl(var(--background));
  font-family: "Courier New", monospace;
  overflow: hidden;
}

.clock-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px 64px;
}

/* 扫描线 */
.scanline {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, #06b6d4, #a855f7, transparent);
  animation: scanline-move 3s ease-in-out infinite;
  opacity: 0.7;
  filter: blur(1px);
  box-shadow:
    0 0 15px #06b6d4,
    0 0 30px rgb(168 85 247 / 50%);
  pointer-events: none;
}

@keyframes scanline-move {
  0%,
  100% {
    top: 0;
  }
  50% {
    top: 100%;
  }
}

/* 时间行 */
.time-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.digit-box {
  position: relative;
  width: 56px;
  height: 78px;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow:
    0 0 12px rgb(6 182 212 / 12%),
    inset 0 0 20px rgb(0 0 0 / 50%);
}

.digit-box::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: hsl(var(--background));
  box-shadow: 0 0 4px hsl(var(--background));
  z-index: 2;
}

.digit {
  font-size: 48px;
  font-weight: bold;
  background: linear-gradient(180deg, #06b6d4, #a855f7);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 8px rgb(6 182 212 / 50%));
}

.digit.flip {
  animation: digit-flip 0.4s ease-in-out;
}

@keyframes digit-flip {
  0% {
    transform: scaleY(1);
    opacity: 1;
  }
  50% {
    transform: scaleY(0);
    opacity: 0.5;
  }
  100% {
    transform: scaleY(1);
    opacity: 1;
  }
}

.colon {
  font-size: 42px;
  background: linear-gradient(180deg, #06b6d4, #a855f7);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: colon-blink 1s ease-in-out infinite;
  margin: 0 2px;
}

@keyframes colon-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.2;
  }
}

/* 日期和星期 */
.info-row {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 8px;
}

.date-text {
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  letter-spacing: 4px;
  text-transform: uppercase;
}

.weekday-text {
  font-size: 14px;
  color: #a855f7;
  letter-spacing: 4px;
  text-shadow: 0 0 10px rgb(168 85 247 / 50%);
}

.dot-sep {
  width: 4px;
  height: 4px;
  background: #06b6d4;
  border-radius: 50%;
  box-shadow: 0 0 6px #06b6d4;
}

/* 底部装饰线 */
.bottom-line {
  width: 200px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(168 85 247 / 25%), transparent);
  margin-top: 12px;
}

/* 背景光晕 */
.glow {
  position: absolute;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.12;
  pointer-events: none;
}

.glow-cyan {
  background: #06b6d4;
  top: -50px;
  left: -50px;
}

.glow-purple {
  background: #a855f7;
  bottom: -50px;
  right: -50px;
}
</style>
