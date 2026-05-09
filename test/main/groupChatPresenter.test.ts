import { describe, it, expect } from "vitest";
import { trimToRecentRounds } from "../../src/main/presenter/groupChatPresenter";
import type { GroupChatMessageRecord } from "../../src/shared/types/groupChat";

function makeMsg(
  id: string,
  senderAgentId: string | null,
  hidden = false,
  orderSeq = 0,
): GroupChatMessageRecord {
  return {
    id,
    sessionId: "sess",
    orderSeq,
    senderAgentId,
    role: senderAgentId === null ? "user" : "assistant",
    content: "msg",
    hidden,
    createdAt: Date.now(),
  };
}

describe("trimToRecentRounds", () => {
  it("returns all messages when rounds <= maxRounds", () => {
    const msgs = [
      makeMsg("u1", null), // round 1
      makeMsg("a1", "agent-1"),
      makeMsg("u2", null), // round 2
      makeMsg("a2", "agent-1"),
    ];
    expect(trimToRecentRounds(msgs, 15)).toEqual(msgs);
  });

  it("keeps only the most recent maxRounds rounds", () => {
    // 构造 16 轮，每轮 1 user + 1 agent
    const msgs: GroupChatMessageRecord[] = [];
    for (let i = 1; i <= 16; i++) {
      msgs.push(makeMsg(`u${i}`, null, false, i * 2 - 1));
      msgs.push(makeMsg(`a${i}`, "agent-1", false, i * 2));
    }
    const result = trimToRecentRounds(msgs, 15);
    // 应保留第 2~16 轮，共 30 条
    expect(result).toHaveLength(30);
    expect(result[0].id).toBe("u2");
  });

  it("hidden messages follow their round", () => {
    const msgs = [
      makeMsg("u1", null), // round 1
      makeMsg("h1", null, true), // hidden, belongs to round 1
      makeMsg("a1", "agent-1"),
      makeMsg("u2", null), // round 2
    ];
    // maxRounds=1, 保留最近 1 轮（round 2 起之后的内容）
    const result = trimToRecentRounds(msgs, 1);
    expect(result.map((m) => m.id)).toEqual(["u2"]);
  });

  it("returns empty array for empty input", () => {
    expect(trimToRecentRounds([], 15)).toEqual([]);
  });
});
