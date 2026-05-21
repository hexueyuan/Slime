import { ref, watch, onUnmounted, getCurrentInstance, type Ref } from "vue";

interface UseSplitPaneOptions {
  containerRef: Ref<HTMLElement | null>;
  defaultRatio?: number;
  defaultRightPx?: number; // 若设置，初始右侧宽度固定为此值（优先于 defaultRatio）
  minLeftPx?: number;
  minRightPx?: number;
  storageKey?: string;
}

export function useSplitPane(options: UseSplitPaneOptions) {
  const {
    containerRef,
    defaultRatio = 0.35,
    defaultRightPx,
    minLeftPx = 0,
    minRightPx = 0,
    storageKey,
  } = options;

  // 用 rightWidth 代替 leftWidth，右侧固定宽，左侧 flex-1，避免初始值为 0 导致右侧抢占空间
  const rightWidth = ref(readStoredWidth(storageKey) ?? defaultRightPx ?? minRightPx);
  const isDragging = ref(false);

  function clamp(value: number): number {
    const containerWidth = containerRef.value?.clientWidth ?? 0;
    if (containerWidth === 0) return value;
    const minRight = minRightPx;
    const maxRight = containerWidth - minLeftPx;
    return Math.min(Math.max(value, minRight), maxRight);
  }

  function defaultWidth(containerWidth: number): number {
    return defaultRightPx !== undefined ? defaultRightPx : containerWidth * (1 - defaultRatio);
  }

  function recalc(persist = false) {
    const containerWidth = containerRef.value?.clientWidth ?? 0;
    if (containerWidth === 0) return;
    rightWidth.value = clamp(defaultWidth(containerWidth));
    if (persist) writeStoredWidth(storageKey, rightWidth.value);
  }

  function initializeWidth() {
    const containerWidth = containerRef.value?.clientWidth ?? 0;
    if (containerWidth === 0) return;
    const stored = readStoredWidth(storageKey);
    rightWidth.value = clamp(stored ?? defaultWidth(containerWidth));
  }

  // Use ResizeObserver to recalc when container gets actual size
  let resizeObserver: ResizeObserver | null = null;
  let initialized = false;

  watch(
    containerRef,
    (el, oldEl) => {
      if (oldEl && resizeObserver) {
        resizeObserver.unobserve(oldEl);
      }
      if (el) {
        if (!resizeObserver) {
          resizeObserver = new ResizeObserver(() => {
            if (!initialized) {
              const w = containerRef.value?.clientWidth ?? 0;
              if (w > 0) {
                initialized = true;
                initializeWidth();
              }
            } else {
              onResize();
            }
          });
        }
        resizeObserver.observe(el);
        // Try immediate calc in case already laid out
        const w = el.clientWidth;
        if (w > 0) {
          initialized = true;
          initializeWidth();
        }
      }
    },
    { immediate: true },
  );

  let startX = 0;
  let startRightWidth = 0;

  function onMouseMove(e: MouseEvent) {
    const delta = startX - e.clientX; // 向左拖 = 右侧变宽
    rightWidth.value = clamp(startRightWidth + delta);
  }

  function onMouseUp() {
    isDragging.value = false;
    writeStoredWidth(storageKey, rightWidth.value);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function onMouseDown(e: MouseEvent) {
    startX = e.clientX;
    startRightWidth = rightWidth.value;
    isDragging.value = true;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function resetToDefault() {
    recalc(true);
  }

  function onResize() {
    rightWidth.value = clamp(rightWidth.value);
  }

  const cleanup = () => {
    resizeObserver?.disconnect();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };

  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }

  return { rightWidth, isDragging, onMouseDown, resetToDefault };
}

function readStoredWidth(storageKey: string | undefined): number | null {
  if (!storageKey || typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  const width = Number(raw);
  return Number.isFinite(width) && width > 0 ? width : null;
}

function writeStoredWidth(storageKey: string | undefined, width: number): void {
  if (!storageKey || typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, String(Math.round(width)));
}
