import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useEvolutionStore } from "../../../src/renderer/src/stores/evolution";

describe("useEvolutionStore", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("starts in idle", () => {
    const store = useEvolutionStore();
    expect(store.stage).toBe("idle");
  });

  it("setStage updates stage", () => {
    const store = useEvolutionStore();
    store.setStage("discuss");
    expect(store.stage).toBe("discuss");
  });

  it("setStage clears completed state when not idle", () => {
    const store = useEvolutionStore();
    store.setCompleted("tag", "summary");
    store.setStage("discuss");
    expect(store.completedTag).toBeNull();
  });

  it("setCompleted stores tag and summary", () => {
    const store = useEvolutionStore();
    store.setCompleted("egg-v0.1-dev.1", "did stuff");
    expect(store.completedTag).toBe("egg-v0.1-dev.1");
    expect(store.completedSummary).toBe("did stuff");
  });

  it("reset clears everything including rollback state", () => {
    const store = useEvolutionStore();
    store.setStage("coding");
    store.setCompleted("tag", "summary");
    store.rollbackInProgress = true;
    store.rollbackTag = "some-tag";
    store.reset();
    expect(store.stage).toBe("idle");
    expect(store.completedTag).toBeNull();
    expect(store.rollbackInProgress).toBe(false);
    expect(store.rollbackTag).toBeNull();
  });

  it("has rollback state refs", () => {
    const store = useEvolutionStore();
    expect(store.rollbackInProgress).toBe(false);
    expect(store.rollbackTag).toBeNull();
  });
});
