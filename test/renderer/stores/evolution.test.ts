import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useEvolutionStore } from "@/stores/evolution";

describe("evolutionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should start idle", () => {
    const store = useEvolutionStore();
    expect(store.stage).toBe("idle");
    expect(store.progress).toBe(0);
    expect(store.context).toBeNull();
  });

  it("should set stage", () => {
    const store = useEvolutionStore();
    store.setStage("discuss");
    expect(store.stage).toBe("discuss");
  });

  it("should clamp progress 0-100", () => {
    const store = useEvolutionStore();
    store.setProgress(150);
    expect(store.progress).toBe(100);
    store.setProgress(-10);
    expect(store.progress).toBe(0);
  });

  it("should reset to initial state", () => {
    const store = useEvolutionStore();
    store.setStage("coding");
    store.setProgress(50);
    store.reset();
    expect(store.stage).toBe("idle");
    expect(store.progress).toBe(0);
    expect(store.context).toBeNull();
  });
});
