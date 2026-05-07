import { ref, watch, onUnmounted, type Ref } from "vue";

interface UseSplitPaneOptions {
  containerRef: Ref<HTMLElement | null>;
  defaultRatio?: number;
  minLeftPx?: number;
  minRightPx?: number;
}

export function useSplitPane(options: UseSplitPaneOptions) {
  const { containerRef, defaultRatio = 0.35, minLeftPx = 0, minRightPx = 0 } = options;

  const leftWidth = ref(0);
  const isDragging = ref(false);

  function clamp(value: number): number {
    const containerWidth = containerRef.value?.clientWidth ?? 0;
    if (containerWidth === 0) return 0;
    const max = containerWidth - minRightPx;
    return Math.min(Math.max(value, minLeftPx), max);
  }

  function recalc() {
    const containerWidth = containerRef.value?.clientWidth ?? 0;
    if (containerWidth === 0) {
      leftWidth.value = 0;
      return;
    }
    leftWidth.value = clamp(containerWidth * defaultRatio);
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
                recalc();
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
          recalc();
        }
      }
    },
    { immediate: true },
  );

  let startX = 0;
  let startWidth = 0;

  function onMouseMove(e: MouseEvent) {
    const delta = e.clientX - startX;
    leftWidth.value = clamp(startWidth + delta);
  }

  function onMouseUp() {
    isDragging.value = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function onMouseDown(e: MouseEvent) {
    startX = e.clientX;
    startWidth = leftWidth.value;
    isDragging.value = true;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function resetToDefault() {
    recalc();
  }

  function onResize() {
    leftWidth.value = clamp(leftWidth.value);
  }

  onUnmounted(() => {
    resizeObserver?.disconnect();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  });

  return { leftWidth, isDragging, onMouseDown, resetToDefault };
}
