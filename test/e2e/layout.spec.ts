import { expect, test, type Page } from "@playwright/test";

type MockOptions = {
  onboarded: boolean;
};

const navItems = [
  { testId: "sidebar-chatroom", title: "对齐第二张图 UI" },
  { testId: "sidebar-groupchat", title: "群聊" },
  { testId: "sidebar-gateway", title: "Gateway" },
  { testId: "sidebar-schedule", title: "自动化" },
  { testId: "sidebar-agents", title: "Agents" },
] as const;

async function installMockIpc(page: Page, options: MockOptions) {
  await page.addInitScript(({ onboarded }) => {
    const stats = {
      requests: 12,
      inputTokens: 1200,
      outputTokens: 800,
      cacheReadTokens: 240,
      cacheWriteTokens: 120,
      cost: 0.42,
      avgLatencyMs: 680,
    };

    const presenterMock = (presenter: string, method: string) => {
      if (presenter === "configPresenter" && method === "get") {
        return onboarded;
      }
      if (presenter === "agentConfigPresenter" && method === "listAgents") return [];
      if (presenter === "agentChatPresenter" && method === "getSessions") return [];
      if (presenter === "agentChatPresenter" && method === "getMessages") return [];
      if (presenter === "groupChatPresenter" && method === "getSessions") return [];
      if (presenter === "groupChatPresenter" && method === "getMessages") return [];
      if (presenter === "gatewayPresenter" && method === "listChannels") return [];
      if (presenter === "gatewayPresenter" && method === "listGroups") return [];
      if (presenter === "gatewayPresenter" && method === "listApiKeys") return [];
      if (presenter === "gatewayPresenter" && method === "getStatsRange") return stats;
      if (presenter === "gatewayPresenter" && method === "getChannelRanking") return [];
      if (presenter === "gatewayPresenter" && method === "getModelRanking") return [];
      if (presenter === "gatewayPresenter" && method === "getLatencyPercentiles") {
        return { p50: 320, p95: 960, ttftP50: 180 };
      }
      if (
        presenter === "gatewayPresenter" &&
        (method === "getStatsHourlyTrend" || method === "getStatsDailyTrend")
      ) {
        return [
          {
            time: "10:00",
            requests: 3,
            cost: 0.1,
            inputTokens: 320,
            outputTokens: 210,
          },
          {
            time: "11:00",
            requests: 9,
            cost: 0.32,
            inputTokens: 880,
            outputTokens: 590,
          },
        ];
      }
      return null;
    };

    const taskMock = (channel: string) => {
      if (channel === "task:getTasks") return [];
      if (channel === "task:getTimeline") return [];
      if (channel === "task:getNotes") return [];
      return null;
    };

    window.electron = {
      ipcRenderer: {
        invoke: async (channel: string, ...args: unknown[]) => {
          if (channel === "presenter:call") {
            const [presenter, method] = args as [string, string];
            return presenterMock(presenter, method);
          }
          return taskMock(channel);
        },
        on: () => () => {},
        removeAllListeners: () => {},
        send: () => {},
      },
    };
  }, options);
}

async function emulateScreenSize(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(
    ({ screenWidth, screenHeight }) => {
      Object.defineProperty(window.screen, "width", {
        configurable: true,
        value: screenWidth,
      });
      Object.defineProperty(window.screen, "height", {
        configurable: true,
        value: screenHeight,
      });
      Object.defineProperty(window.screen, "availWidth", {
        configurable: true,
        value: screenWidth,
      });
      Object.defineProperty(window.screen, "availHeight", {
        configurable: true,
        value: screenHeight,
      });
    },
    { screenWidth: width, screenHeight: height },
  );
}

async function emulateWindowInsideScreen(
  page: Page,
  viewportWidth: number,
  viewportHeight: number,
  screenWidth: number,
  screenHeight: number,
) {
  await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
  await page.addInitScript(
    ({ availableWidth, availableHeight }) => {
      Object.defineProperty(window.screen, "width", {
        configurable: true,
        value: availableWidth,
      });
      Object.defineProperty(window.screen, "height", {
        configurable: true,
        value: availableHeight,
      });
      Object.defineProperty(window.screen, "availWidth", {
        configurable: true,
        value: availableWidth,
      });
      Object.defineProperty(window.screen, "availHeight", {
        configurable: true,
        value: availableHeight,
      });
    },
    { availableWidth: screenWidth, availableHeight: screenHeight },
  );
}

async function openApp(page: Page, options: MockOptions = { onboarded: true }) {
  await installMockIpc(page, options);
  await page.goto("/");
}

test.describe("main layout", () => {
  test("enters the main shell when onboarding is complete", async ({ page }) => {
    await openApp(page);

    await expect(page.getByTestId("app-sidebar")).toBeVisible();
    await expect(page.getByTestId("workspace-canvas")).toBeVisible();
    await expect(page.getByTestId("workspace-title")).toHaveText("对齐第二张图 UI");
    await expect(page.getByTestId("welcome-step")).toHaveCount(0);
  });

  test("shows onboarding before the main shell when onboarding is incomplete", async ({ page }) => {
    await openApp(page, { onboarded: false });

    await expect(page.getByTestId("welcome-step")).toBeVisible();
    await expect(page.getByTestId("app-sidebar")).toHaveCount(0);
  });

  test("switches each primary navigation item into the matching workspace", async ({ page }) => {
    await openApp(page);

    for (const item of navItems) {
      await page.getByTestId(item.testId).click();
      await expect(page.getByTestId("workspace-title")).toHaveText(item.title);
      await expect(page.getByTestId("workspace-canvas")).toBeVisible();
    }
  });

  test("toggles the chatroom inspector panel", async ({ page }) => {
    await openApp(page);

    await expect(page.getByTestId("split-right-pane")).toHaveAttribute("data-open", "false");

    await page.getByTestId("inspector-toggle").click();
    await expect(page.getByTestId("split-right-pane")).toHaveAttribute("data-open", "true");

    await page.getByTestId("inspector-toggle").click();
    await expect(page.getByTestId("split-right-pane")).toHaveAttribute("data-open", "false");
  });

  test("closes and disables the inspector outside chatroom", async ({ page }) => {
    await openApp(page);

    await page.getByTestId("inspector-toggle").click();
    await expect(page.getByTestId("split-right-pane")).toHaveAttribute("data-open", "true");

    await page.getByTestId("sidebar-gateway").click();

    await expect(page.getByTestId("workspace-title")).toHaveText("Gateway");
    await expect(page.getByTestId("split-right-pane")).toHaveCount(0);
    await expect(page.getByTestId("inspector-toggle")).toBeDisabled();
  });

  test("keeps every primary workspace within the viewport width", async ({ page }) => {
    await openApp(page);

    for (const item of navItems) {
      await page.getByTestId(item.testId).click();
      await expect(page.getByTestId("workspace-title")).toHaveText(item.title);

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(hasHorizontalOverflow).toBe(false);
    }
  });

  test("stacks the rounded workspace canvas directly on the sidebar background", async ({
    page,
  }) => {
    await openApp(page);

    const sidebar = await page.getByTestId("app-sidebar").boundingBox();
    const main = await page.locator("main").boundingBox();
    const canvas = await page.getByTestId("workspace-canvas").boundingBox();
    const resizeHandle = await page.getByTestId("sidebar-resize-handle").boundingBox();
    const chrome = await page.evaluate(() => {
      const appRoot = document.querySelector("#app > div");
      const sidebarElement = document.querySelector('[data-testid="app-sidebar"]');
      const mainElement = document.querySelector("main");
      if (
        !(appRoot instanceof HTMLElement) ||
        !(sidebarElement instanceof HTMLElement) ||
        !(mainElement instanceof HTMLElement)
      ) {
        return null;
      }
      const rootStyles = getComputedStyle(appRoot);
      const sidebarStyles = getComputedStyle(sidebarElement);
      const mainStyles = getComputedStyle(mainElement);
      return {
        mainBorderLeftWidth: mainStyles.borderLeftWidth,
        mainBottomLeftRadius: mainStyles.borderBottomLeftRadius,
        mainTopLeftRadius: mainStyles.borderTopLeftRadius,
        rootBackground: rootStyles.backgroundColor,
        sidebarBackground: sidebarStyles.backgroundColor,
        sidebarToken: getComputedStyle(document.documentElement)
          .getPropertyValue("--color-app-sidebar")
          .trim(),
      };
    });

    expect(sidebar).not.toBeNull();
    expect(main).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(resizeHandle).not.toBeNull();
    expect(chrome).not.toBeNull();
    const sidebarRight = sidebar!.x + sidebar!.width;
    expect(Math.abs(main!.x - sidebarRight)).toBeLessThanOrEqual(0.5);
    expect(resizeHandle!.x).toBeLessThan(sidebarRight);
    expect(resizeHandle!.x + resizeHandle!.width).toBeGreaterThan(sidebarRight);
    expect(sidebarRight).toBeLessThanOrEqual(canvas!.x + 1);
    expect(canvas!.width).toBeGreaterThan(800);
    expect(chrome).toEqual({
      mainBorderLeftWidth: "1px",
      mainBottomLeftRadius: "15px",
      mainTopLeftRadius: "15px",
      rootBackground: chrome!.sidebarToken,
      sidebarBackground: "rgba(0, 0, 0, 0)",
      sidebarToken: chrome!.sidebarToken,
    });
  });

  test("shows the mac traffic-light spacer in standard desktop windows", async ({ page }) => {
    await emulateWindowInsideScreen(page, 1280, 720, 1440, 900);
    await openApp(page);

    const spacer = page.getByTestId("sidebar-traffic-spacer");
    await expect(spacer).toBeVisible();

    const spacerBox = await spacer.boundingBox();
    const toggleBox = await page.getByTestId("sidebar-toggle").boundingBox();

    expect(spacerBox).not.toBeNull();
    expect(toggleBox).not.toBeNull();
    expect(spacerBox!.width).toBeGreaterThan(80);
    expect(spacerBox!.x + spacerBox!.width).toBeLessThanOrEqual(toggleBox!.x + 1);
  });

  test("uses square outer shell edges, hides traffic-light space, and preserves inner canvas rounding", async ({
    page,
  }) => {
    await emulateScreenSize(page, 1440, 900);
    await openApp(page);

    const shell = page.locator("[data-fullscreen-like]").first();
    await expect(shell).toHaveAttribute("data-fullscreen-like", "true");
    await expect(page.getByTestId("sidebar-traffic-spacer")).toHaveCount(0);
    await expect(page.getByTestId("sidebar-toggle")).toBeVisible();

    const shellChrome = await shell.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        borderTopWidth: styles.borderTopWidth,
        borderTopLeftRadius: styles.borderTopLeftRadius,
      };
    });
    const canvasChrome = await page.locator("main").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        borderBottomWidth: styles.borderBottomWidth,
        borderTopWidth: styles.borderTopWidth,
        borderBottomLeftRadius: styles.borderBottomLeftRadius,
        borderTopLeftRadius: styles.borderTopLeftRadius,
      };
    });

    expect(shellChrome).toEqual({
      borderTopWidth: "0px",
      borderTopLeftRadius: "0px",
    });
    expect(canvasChrome).toEqual({
      borderBottomWidth: "1px",
      borderTopWidth: "1px",
      borderBottomLeftRadius: "15px",
      borderTopLeftRadius: "15px",
    });
  });

  test("uses the sidebar color behind the rounded desktop shell", async ({ page }) => {
    await openApp(page);

    const backingColor = await page.evaluate(() => {
      const appRoot = document.querySelector("#app > div");
      if (!(appRoot instanceof HTMLElement)) return null;
      return {
        rootBackground: getComputedStyle(appRoot).backgroundColor,
        sidebarToken: getComputedStyle(document.documentElement)
          .getPropertyValue("--color-app-sidebar")
          .trim(),
      };
    });

    expect(backingColor).toEqual({
      rootBackground: "rgba(38, 38, 39, 0.78)",
      sidebarToken: "rgba(38, 38, 39, 0.78)",
    });
  });

  test("collapses and expands the app sidebar from the sidebar control", async ({ page }) => {
    await openApp(page);

    const sidebarBefore = await page.getByTestId("app-sidebar").boundingBox();
    expect(sidebarBefore).not.toBeNull();
    expect(sidebarBefore!.width).toBeGreaterThan(300);

    await page.getByTestId("sidebar-toggle").click();
    await expect(page.getByTestId("app-sidebar")).toHaveAttribute("data-collapsed", "true");

    await expect
      .poll(async () => {
        const sidebarCollapsed = await page.getByTestId("app-sidebar").boundingBox();
        return sidebarCollapsed?.width ?? 0;
      })
      .toBeLessThan(80);

    await page.getByTestId("sidebar-gateway").click();
    await expect(page.getByTestId("workspace-title")).toHaveText("Gateway");

    await page.getByTestId("sidebar-toggle").click();
    await expect(page.getByTestId("app-sidebar")).toHaveAttribute("data-collapsed", "false");

    await expect
      .poll(async () => {
        const sidebarExpanded = await page.getByTestId("app-sidebar").boundingBox();
        return sidebarExpanded?.width ?? 0;
      })
      .toBeGreaterThan(300);
  });

  test("keeps the shell stable at the minimum PC window size", async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 640 });
    await openApp(page);

    const hasDocumentHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    const hasDocumentVerticalOverflow = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1,
    );

    expect(hasDocumentHorizontalOverflow).toBe(false);
    expect(hasDocumentVerticalOverflow).toBe(false);
    await expect(page.getByTestId("app-sidebar")).toHaveAttribute("data-collapsed", "false");
    await expect(page.getByTestId("workspace-canvas")).toBeVisible();
  });

  test("keeps top sidebar actions fixed while project and conversation history scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1040, height: 640 });
    await openApp(page);

    const topAction = page.getByTestId("sidebar-chatroom");
    const scrollArea = page.getByTestId("sidebar-scroll-area");
    const footerAction = page.getByTestId("sidebar-status");
    const firstProjectConversation = scrollArea.getByRole("button", {
      name: /对齐第二张图 UI/,
    });

    const topBefore = await topAction.boundingBox();
    const scrollBefore = await scrollArea.boundingBox();
    const footerBefore = await footerAction.boundingBox();
    const firstConversationBefore = await firstProjectConversation.boundingBox();
    const scrollMetrics = await scrollArea.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        clientHeight: element.clientHeight,
        overflowY: styles.overflowY,
        scrollbarWidth: styles.scrollbarWidth,
        scrollHeight: element.scrollHeight,
      };
    });

    expect(topBefore).not.toBeNull();
    expect(scrollBefore).not.toBeNull();
    expect(footerBefore).not.toBeNull();
    expect(firstConversationBefore).not.toBeNull();
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
    expect(scrollMetrics.overflowY).toBe("auto");
    expect(scrollMetrics.scrollbarWidth).toBe("none");
    expect(topBefore!.y + topBefore!.height).toBeLessThan(scrollBefore!.y);
    expect(scrollBefore!.y + scrollBefore!.height).toBeLessThanOrEqual(footerBefore!.y + 1);

    await scrollArea.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    await expect
      .poll(async () => scrollArea.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    const topAfter = await topAction.boundingBox();
    const scrollAfter = await scrollArea.boundingBox();
    const footerAfter = await footerAction.boundingBox();
    const firstConversationAfter = await firstProjectConversation.boundingBox();

    expect(topAfter).not.toBeNull();
    expect(scrollAfter).not.toBeNull();
    expect(footerAfter).not.toBeNull();
    expect(firstConversationAfter).not.toBeNull();
    expect(Math.abs(topAfter!.y - topBefore!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(scrollAfter!.y - scrollBefore!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(footerAfter!.y - footerBefore!.y)).toBeLessThanOrEqual(1);
    expect(firstConversationAfter!.y).toBeLessThan(scrollAfter!.y);
  });

  test("resizes and persists the app sidebar width", async ({ page }) => {
    await openApp(page);

    const sidebarBefore = await page.getByTestId("app-sidebar").boundingBox();
    const handle = await page.getByTestId("sidebar-resize-handle").boundingBox();

    expect(sidebarBefore).not.toBeNull();
    expect(handle).not.toBeNull();

    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + 96, handle!.y + handle!.height / 2, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const sidebarAfter = await page.getByTestId("app-sidebar").boundingBox();
        return sidebarAfter?.width ?? 0;
      })
      .toBeGreaterThan(sidebarBefore!.width + 80);

    const sidebarAfter = await page.getByTestId("app-sidebar").boundingBox();
    expect(sidebarAfter).not.toBeNull();

    await page.reload();
    await expect(page.getByTestId("workspace-title")).toHaveText("对齐第二张图 UI");

    const sidebarReloaded = await page.getByTestId("app-sidebar").boundingBox();
    expect(sidebarReloaded).not.toBeNull();
    expect(Math.abs(sidebarReloaded!.width - sidebarAfter!.width)).toBeLessThanOrEqual(2);
  });

  test("resizes and persists the chatroom inspector width", async ({ page }) => {
    await openApp(page);

    await page.getByTestId("inspector-toggle").click();
    await expect(page.getByTestId("split-right-pane")).toHaveAttribute("data-open", "true");

    const inspectorBefore = await page.getByTestId("split-right-pane").boundingBox();
    const handle = await page.getByTestId("split-resize-handle").boundingBox();

    expect(inspectorBefore).not.toBeNull();
    expect(handle).not.toBeNull();

    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x - 90, handle!.y + handle!.height / 2);
    await page.mouse.up();

    const inspectorAfter = await page.getByTestId("split-right-pane").boundingBox();
    expect(inspectorAfter).not.toBeNull();
    expect(inspectorAfter!.width).toBeGreaterThan(inspectorBefore!.width + 64);

    await page.reload();
    await expect(page.getByTestId("workspace-title")).toHaveText("对齐第二张图 UI");
    await page.getByTestId("inspector-toggle").click();

    await expect
      .poll(async () => {
        const inspectorReloaded = await page.getByTestId("split-right-pane").boundingBox();
        return inspectorReloaded?.width ?? 0;
      })
      .toBeGreaterThan(inspectorAfter!.width - 2);
  });
});
