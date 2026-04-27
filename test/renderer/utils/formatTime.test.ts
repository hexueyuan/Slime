import { describe, it, expect, vi, afterEach } from "vitest";
import { formatMessageTime } from "@/utils/formatTime";

describe("formatMessageTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows HH:mm for today", () => {
    vi.setSystemTime(new Date(2026, 3, 27, 14, 0, 0));
    const today = new Date(2026, 3, 27, 9, 32).getTime();
    expect(formatMessageTime(today)).toBe("09:32");
  });

  it("shows 昨天 HH:mm for yesterday", () => {
    vi.setSystemTime(new Date(2026, 3, 27, 14, 0, 0));
    const yesterday = new Date(2026, 3, 26, 15, 45).getTime();
    expect(formatMessageTime(yesterday)).toBe("昨天 15:45");
  });

  it("shows MM-DD HH:mm for this year", () => {
    vi.setSystemTime(new Date(2026, 3, 27, 14, 0, 0));
    const thisYear = new Date(2026, 0, 15, 10, 30).getTime();
    expect(formatMessageTime(thisYear)).toBe("01-15 10:30");
  });

  it("shows YYYY-MM-DD HH:mm for older dates", () => {
    vi.setSystemTime(new Date(2026, 3, 27, 14, 0, 0));
    const older = new Date(2025, 5, 10, 8, 5).getTime();
    expect(formatMessageTime(older)).toBe("2025-06-10 08:05");
  });
});
