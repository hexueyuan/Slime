import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useEvolutionStore } from "../../../src/renderer/src/stores/evolution";

describe("useEvolutionStore", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("setStage updates stage", () => {
    const store = useEvolutionStore();
    store.setStage("discuss");
    expect(store.stage).toBe("discuss");
  });
});
