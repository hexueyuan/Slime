import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), `slime-session-test-${Date.now()}`);
vi.mock("@/utils/paths", () => ({
  paths: { dataDir: testDir },
}));

const { SessionPresenter } = await import("@/presenter/sessionPresenter");

describe("SessionPresenter", () => {
  let presenter: InstanceType<typeof SessionPresenter>;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    presenter = new SessionPresenter();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should return empty sessions initially", async () => {
    const sessions = await presenter.getSessions();
    expect(sessions).toEqual([]);
  });

  it("should create a session", async () => {
    const session = await presenter.createSession("test chat");
    expect(session.id).toBeDefined();
    expect(session.title).toBe("test chat");
    expect(session.createdAt).toBeGreaterThan(0);
  });

  it("should create session with default title", async () => {
    const session = await presenter.createSession();
    expect(session.title).toBe("新对话");
  });

  it("should list created sessions", async () => {
    await presenter.createSession("first");
    await presenter.createSession("second");
    const sessions = await presenter.getSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].title).toBe("first");
  });

  it("should delete a session", async () => {
    const session = await presenter.createSession("to delete");
    const result = await presenter.deleteSession(session.id);
    expect(result).toBe(true);
    const sessions = await presenter.getSessions();
    expect(sessions).toHaveLength(0);
  });

  it("should return false when deleting non-existent session", async () => {
    const result = await presenter.deleteSession("non-existent-id");
    expect(result).toBe(false);
  });

  it("should return empty messages for new session", async () => {
    const session = await presenter.createSession("test");
    const messages = await presenter.getMessages(session.id);
    expect(messages).toEqual([]);
  });

  it("should save and load a message", async () => {
    const session = await presenter.createSession("test");
    const msg = {
      id: "msg-1",
      sessionId: session.id,
      role: "user" as const,
      content: JSON.stringify({ text: "hello", files: [] }),
      status: "sent" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await presenter.saveMessage(msg);
    const messages = await presenter.getMessages(session.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("msg-1");
  });
});
