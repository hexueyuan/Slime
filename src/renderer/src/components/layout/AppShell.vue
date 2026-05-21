<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const SIDEBAR_STORAGE_KEY = "slime.layout.sidebarWidth";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "slime.layout.sidebarCollapsed";
const DEFAULT_SIDEBAR_WIDTH = 330;
const MIN_SIDEBAR_WIDTH = 260;
const MAX_SIDEBAR_WIDTH = 460;
const MIN_CANVAS_WIDTH = 720;
const COLLAPSED_SIDEBAR_WIDTH = 58;

const shellRef = ref<HTMLElement | null>(null);
const sidebarWidth = ref(readStoredWidth() ?? DEFAULT_SIDEBAR_WIDTH);
const isSidebarCollapsed = ref(readStoredCollapsed() ?? false);
const isDraggingSidebar = ref(false);
const isFullscreenLike = ref(false);

let startX = 0;
let startWidth = 0;
let resizeObserver: ResizeObserver | null = null;

const currentSidebarWidth = computed(() =>
  isSidebarCollapsed.value ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth.value,
);

const sidebarStyle = computed(() => ({
  width: `${currentSidebarWidth.value}px`,
}));

const sidebarResizeHandleStyle = computed(() => ({
  left: `${currentSidebarWidth.value}px`,
}));

function clampSidebarWidth(value: number): number {
  const shellWidth = shellRef.value?.clientWidth ?? 0;
  const viewportMax = shellWidth > 0 ? shellWidth - MIN_CANVAS_WIDTH : MAX_SIDEBAR_WIDTH;
  const max = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, viewportMax));
  return Math.min(Math.max(value, MIN_SIDEBAR_WIDTH), max);
}

function setSidebarWidth(value: number, persist = false) {
  sidebarWidth.value = clampSidebarWidth(value);
  if (persist) writeStoredWidth(sidebarWidth.value);
}

function onSidebarMouseMove(event: MouseEvent) {
  if (isSidebarCollapsed.value) return;
  setSidebarWidth(startWidth + event.clientX - startX);
}

function onSidebarMouseUp() {
  isDraggingSidebar.value = false;
  writeStoredWidth(sidebarWidth.value);
  document.removeEventListener("mousemove", onSidebarMouseMove);
  document.removeEventListener("mouseup", onSidebarMouseUp);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

function onSidebarMouseDown(event: MouseEvent) {
  if (isSidebarCollapsed.value) return;
  startX = event.clientX;
  startWidth = sidebarWidth.value;
  isDraggingSidebar.value = true;
  document.addEventListener("mousemove", onSidebarMouseMove);
  document.addEventListener("mouseup", onSidebarMouseUp);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function resetSidebarWidth() {
  setSidebarWidth(DEFAULT_SIDEBAR_WIDTH, true);
}

function setSidebarCollapsed(collapsed: boolean) {
  isSidebarCollapsed.value = collapsed;
  writeStoredCollapsed(collapsed);
}

function toggleSidebar() {
  setSidebarCollapsed(!isSidebarCollapsed.value);
}

function updateFullscreenLikeState() {
  const screenWidth = window.screen?.width ?? 0;
  const screenHeight = window.screen?.height ?? 0;
  const availableWidth = window.screen?.availWidth ?? 0;
  const availableHeight = window.screen?.availHeight ?? 0;

  const matchesScreen =
    screenWidth > 0 &&
    screenHeight > 0 &&
    Math.abs(window.innerWidth - screenWidth) <= 2 &&
    Math.abs(window.innerHeight - screenHeight) <= 2;
  const matchesAvailableScreen =
    availableWidth > 0 &&
    availableHeight > 0 &&
    Math.abs(window.innerWidth - availableWidth) <= 2 &&
    Math.abs(window.innerHeight - availableHeight) <= 2;

  isFullscreenLike.value = matchesScreen || matchesAvailableScreen;
}

onMounted(() => {
  updateFullscreenLikeState();
  window.addEventListener("resize", updateFullscreenLikeState);
  window.visualViewport?.addEventListener("resize", updateFullscreenLikeState);
  setSidebarWidth(sidebarWidth.value);
  if (shellRef.value) {
    resizeObserver = new ResizeObserver(() => {
      setSidebarWidth(sidebarWidth.value);
      updateFullscreenLikeState();
    });
    resizeObserver.observe(shellRef.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("resize", updateFullscreenLikeState);
  window.visualViewport?.removeEventListener("resize", updateFullscreenLikeState);
  document.removeEventListener("mousemove", onSidebarMouseMove);
  document.removeEventListener("mouseup", onSidebarMouseUp);
});

function readStoredWidth(): number | null {
  const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (!raw) return null;
  const width = Number(raw);
  return Number.isFinite(width) && width > 0 ? width : null;
}

function writeStoredWidth(width: number) {
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(Math.round(width)));
}

function readStoredCollapsed(): boolean | null {
  const raw = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function writeStoredCollapsed(collapsed: boolean) {
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
}
</script>

<template>
  <div
    :data-fullscreen-like="isFullscreenLike"
    :class="[
      'relative h-screen w-screen overflow-hidden bg-[var(--color-app-sidebar)] text-[var(--color-text-primary)]',
      isFullscreenLike
        ? 'rounded-none border-0'
        : 'rounded-[18px] border border-[var(--color-border-strong)]',
    ]"
  >
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_55%_8%,rgba(255,255,255,0.055),transparent_28%),radial-gradient(circle_at_14%_52%,rgba(255,255,255,0.028),transparent_34%)]"
    />
    <div
      ref="shellRef"
      class="relative flex h-full w-full bg-[var(--color-app-sidebar)] backdrop-blur-2xl"
    >
      <aside
        data-testid="app-sidebar"
        :data-collapsed="isSidebarCollapsed"
        class="relative h-full min-w-0 shrink-0 overflow-hidden bg-transparent transition-[width] duration-150 ease-out"
        :style="sidebarStyle"
      >
        <slot
          name="sidebar"
          :collapsed="isSidebarCollapsed"
          :fullscreen-like="isFullscreenLike"
          :toggle="toggleSidebar"
        />
      </aside>
      <div
        v-if="!isSidebarCollapsed"
        data-testid="sidebar-resize-handle"
        class="group absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-col-resize bg-transparent"
        :style="sidebarResizeHandleStyle"
        title="调整侧边栏宽度"
        @mousedown="onSidebarMouseDown"
        @dblclick="resetSidebarWidth"
      >
        <div
          class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-[var(--color-border-strong)]"
          :class="isDraggingSidebar ? '!bg-[var(--color-border-strong)]' : ''"
        />
      </div>
      <main
        class="min-w-0 flex-1 overflow-hidden rounded-l-[15px] border-y border-l bg-[var(--color-app-canvas)] shadow-[inset_1px_0_0_rgba(255,255,255,0.13)]"
        style="
          border-color: color-mix(
            in srgb,
            var(--color-border-strong) 72%,
            rgba(255, 255, 255, 0.18)
          );
        "
      >
        <slot />
      </main>
    </div>
  </div>
</template>
