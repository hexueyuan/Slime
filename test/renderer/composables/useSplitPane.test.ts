import { describe, it, expect } from "vitest";
import { ref, nextTick } from "vue";
import { useSplitPane } from "@/composables/useSplitPane";

function createMockContainer(width: number) {
  return ref({
    clientWidth: width,
  } as unknown as HTMLElement);
}

describe("useSplitPane", () => {
  it("should initialize leftWidth based on defaultRatio", () => {
    const container = createMockContainer(1000);
    const { rightWidth } = useSplitPane({ containerRef: container, defaultRatio: 0.35 });
    expect(rightWidth.value).toBe(650);
  });

  it("should return 0 when container is null", () => {
    const container = ref(null);
    const { rightWidth } = useSplitPane({ containerRef: container, defaultRatio: 0.35 });
    expect(rightWidth.value).toBe(0);
  });

  it("should clamp to minLeftPx", () => {
    const container = createMockContainer(500);
    const { rightWidth } = useSplitPane({
      containerRef: container,
      defaultRatio: 0.1,
      minLeftPx: 280,
    });
    expect(rightWidth.value).toBe(220);
  });

  it("should clamp to respect minRightPx", () => {
    const container = createMockContainer(500);
    const { rightWidth } = useSplitPane({
      containerRef: container,
      defaultRatio: 0.9,
      minRightPx: 320,
    });
    expect(rightWidth.value).toBe(320);
  });

  it("should not be dragging initially", () => {
    const container = createMockContainer(1000);
    const { isDragging } = useSplitPane({ containerRef: container });
    expect(isDragging.value).toBe(false);
  });

  it("should update leftWidth on mouse drag", async () => {
    const container = createMockContainer(1000);
    const { rightWidth, isDragging, onMouseDown } = useSplitPane({
      containerRef: container,
      defaultRatio: 0.35,
      minLeftPx: 280,
      minRightPx: 320,
    });
    expect(rightWidth.value).toBe(650);

    // Start drag
    onMouseDown(new MouseEvent("mousedown", { clientX: 350 }));
    expect(isDragging.value).toBe(true);

    // Move mouse to x=400 (right pane shrinks by 50)
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 400 }));
    await nextTick();
    expect(rightWidth.value).toBe(600);

    // Release
    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(isDragging.value).toBe(false);
  });

  it("should clamp during drag", async () => {
    const container = createMockContainer(1000);
    const { rightWidth, onMouseDown } = useSplitPane({
      containerRef: container,
      defaultRatio: 0.35,
      minLeftPx: 280,
      minRightPx: 320,
    });

    onMouseDown(new MouseEvent("mousedown", { clientX: 350 }));

    // Drag far left — right pane grows until left pane keeps minLeftPx
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100 }));
    await nextTick();
    expect(rightWidth.value).toBe(720);

    // Drag far right — right pane keeps minRightPx
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 900 }));
    await nextTick();
    expect(rightWidth.value).toBe(320);

    document.dispatchEvent(new MouseEvent("mouseup"));
  });

  it("should reset to default ratio", () => {
    const container = createMockContainer(1000);
    const { rightWidth, onMouseDown, resetToDefault } = useSplitPane({
      containerRef: container,
      defaultRatio: 0.35,
      minLeftPx: 280,
      minRightPx: 320,
    });

    // Simulate drag to change width
    onMouseDown(new MouseEvent("mousedown", { clientX: 350 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500 }));
    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(rightWidth.value).toBe(500);

    // Reset
    resetToDefault();
    expect(rightWidth.value).toBe(650);
  });
});
