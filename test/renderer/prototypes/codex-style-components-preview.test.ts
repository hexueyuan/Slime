import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const previewPath = resolve("docs/superpowers/prototypes/codex-style-components-preview.html");
const layoutPreviewPath = resolve("docs/superpowers/prototypes/codex-style-layout-preview.html");
const previewEntrypointPath = resolve(
  "docs/superpowers/prototypes/codex-style-components-preview.ts",
);
const previewIndexPath = resolve("docs/superpowers/prototypes/index.html");

describe("codex-style components preview", () => {
  it("serves the component preview from the prototype root", () => {
    const html = readFileSync(previewIndexPath, "utf8");

    expect(html).toContain("codex-style-components-preview.html");
    expect(html).toContain("window.location.replace");
  });

  it("defines PC window presets for component preview", () => {
    const html = readFileSync(previewPath, "utf8");

    expect(html).toContain('data-component-preview-preset="standard"');
    expect(html).toContain('data-width="1280px"');
    expect(html).toContain('data-component-preview-preset="minimum"');
    expect(html).toContain('data-width="1040px"');
    expect(html).toContain('data-component-preview-preset="wide"');
    expect(html).toContain('data-width="1440px"');
    expect(html).not.toContain('data-device="tablet"');
    expect(html).not.toContain('data-device="mobile"');
  });

  it("contains the script that updates preview width and active state", () => {
    const html = readFileSync(previewPath, "utf8");

    expect(html).toContain("function setComponentPreviewWidth(button)");
    expect(html).toContain('previewFrame.style.setProperty("--preview-width", width)');
    expect(html).toContain("deviceLabel.textContent = `${button.textContent?.trim()} · ${width}`");
  });

  it("renders the layout preview inside a PC window-sized frame", () => {
    const html = readFileSync(layoutPreviewPath, "utf8");

    expect(html).toContain('id="layoutPreviewFrame"');
    expect(html).toContain('data-layout-preset="standard"');
    expect(html).toContain('data-width="1280px"');
    expect(html).toContain('data-height="720px"');
    expect(html).toContain('data-layout-preset="minimum"');
    expect(html).toContain('data-width="1040px"');
    expect(html).toContain('data-height="640px"');
    expect(html).toContain('data-layout-preset="wide"');
    expect(html).toContain('data-width="1440px"');
    expect(html).toContain('id="layoutWidthInput"');
    expect(html).toContain('id="layoutHeightInput"');
    expect(html).not.toContain('data-layout-device="tablet"');
    expect(html).not.toContain('data-layout-device="mobile"');
    expect(html).not.toContain("layout-inspector");
    expect(html).not.toContain("整体布局原则");
    expect(html).not.toContain("推荐分区");
    expect(html).not.toContain("适用页面");
  });

  it("contains the layout preview script that updates and clamps PC window size", () => {
    const html = readFileSync(layoutPreviewPath, "utf8");

    expect(html).toContain("const APP_MIN_WIDTH = 1040");
    expect(html).toContain("function setLayoutPreviewSize(");
    expect(html).toContain("widthValue,");
    expect(html).toContain("heightValue,");
    expect(html).toContain("function setLayoutPreviewPreset(button)");
    expect(html).toContain("layoutPreviewFrame.style.width = widthPx");
    expect(html).toContain("layoutPreviewFrame.style.height = heightPx");
    expect(html).toContain("function applyLayoutPreviewFrameSize(widthPx, heightPx)");
    expect(html).toContain('layoutPreviewFrame.style.resize = "none"');
    expect(html).toContain('layoutPreviewFrame.style.resize = "both"');
    expect(html).toContain(
      'layoutPreviewFrame.dataset.preset = activeButton?.dataset.layoutPreset ?? "custom"',
    );
    expect(html).toContain(
      'layoutPreviewFrame.style.setProperty("--layout-preview-width", widthPx)',
    );
    expect(html).toContain(
      'layoutPreviewFrame.style.setProperty("--layout-preview-height", heightPx)',
    );
    expect(html).toContain("Math.max(APP_MIN_WIDTH");
    expect(html).toContain("new ResizeObserver");
    expect(html).toContain("layoutPreviewFrame.getBoundingClientRect()");
    expect(html).toContain('input.addEventListener("input"');
    expect(html).toContain('input.addEventListener("keydown"');
  });

  it("keeps the layout preview sidebar footer in normal flow at minimum height", () => {
    const html = readFileSync(layoutPreviewPath, "utf8");

    expect(html).toContain("display: flex;\n        height: 100%;");
    expect(html).toContain(".sidebar-scroll {");
    expect(html).toContain("overflow-y: auto;");
    expect(html).toContain("scrollbar-width: none;");
    expect(html).toContain(".sidebar-scroll::-webkit-scrollbar");
    expect(html).toContain(".sidebar-footer {\n        display: flex;");
    expect(html).toContain("margin-top: 8px;");
    expect(html).not.toContain(".sidebar-footer {\n        position: absolute;");
  });

  it("uses the sidebar color as the rounded layout shell backing layer", () => {
    const html = readFileSync(layoutPreviewPath, "utf8");

    expect(html).toContain("--sidebar-surface:");
    expect(html).toContain(".layout-preview-frame {");
    expect(html).toContain(".window {");
    expect(html.match(/background: var\(--sidebar-surface\);/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("background: transparent;");
    expect(html).toContain("border-top-left-radius: 15px;");
    expect(html).toContain("border-bottom-left-radius: 15px;");
  });

  it("renders the full-screen layout preset without outer window rounding", () => {
    const html = readFileSync(layoutPreviewPath, "utf8");

    expect(html).toContain('.layout-preview-frame[data-preset="wide"]');
    expect(html).toContain('.layout-preview-frame[data-preset="wide"] .window');
    expect(html).toContain('.layout-preview-frame[data-preset="wide"] .traffic');
    expect(html).toContain("border-radius: 0;");
    expect(html).toContain("display: none;");
    expect(html).not.toContain('.layout-preview-frame[data-preset="wide"] .main');
  });

  it("documents the realtime chart axis labels and value labels", () => {
    const html = readFileSync(previewPath, "utf8");

    expect(html).toContain("chart-point-label");
    expect(html).toContain("chart-axis-label");
    expect(html).toContain("34.0K");
    expect(html).toContain("09:00");
  });

  it("documents the shared resource card pattern for gateway resources", () => {
    const html = readFileSync(previewPath, "utf8");
    const entrypoint = readFileSync(previewEntrypointPath, "utf8");

    expect(html).toContain("SlimeResourceCard");
    expect(html).toContain('id="slime-resource-card-preview"');
    expect(html).toContain('data-preview-source="vue-component"');
    expect(html).not.toContain("resource-card active");
    expect(entrypoint).toContain("@/components/slime/SlimeResourceCard.vue");
    expect(entrypoint).toContain('title: "default"');
    expect(entrypoint).toContain('title: "web-client"');
  });

  it("documents the select/dropdown primitive with open and disabled states", () => {
    const html = readFileSync(previewPath, "utf8");
    const entrypoint = readFileSync(previewEntrypointPath, "utf8");

    expect(html).toContain("SlimeSelect");
    expect(html).toContain('id="slime-select-preview"');
    expect(html).toContain('data-preview-source="vue-component"');
    expect(html).not.toContain("select-trigger open");
    expect(entrypoint).toContain("@/components/ui/SlimeSelect.vue");
    expect(entrypoint).toContain("defaultOpen: true");
    expect(entrypoint).toContain('label: "百度OneApi"');
    expect(entrypoint).toContain("disabled: true");
  });

  it("documents Schedule Kit as three real Vue components", () => {
    const html = readFileSync(previewPath, "utf8");
    const entrypoint = readFileSync(previewEntrypointPath, "utf8");

    expect(html).toContain('id="slime-week-calendar-preview"');
    expect(html).toContain('data-component-id="SlimeWeekCalendar"');
    expect(html).toContain('id="slime-task-list-preview"');
    expect(html).toContain('data-component-id="SlimeTaskList"');
    expect(html).toContain('id="slime-timeline-preview"');
    expect(html).toContain('data-component-id="SlimeTimeline"');
    expect(html).not.toContain('class="week-strip"');
    expect(html).not.toContain('class="task-row"');
    expect(html).not.toContain('class="timeline-entry"');
    expect(entrypoint).toContain("@/components/slime/SlimeWeekCalendar.vue");
    expect(entrypoint).toContain("@/components/slime/SlimeTaskList.vue");
    expect(entrypoint).toContain("@/components/slime/SlimeTimeline.vue");
  });

  it("uses preview-only component id labels instead of component-specific badge variants", () => {
    const html = readFileSync(previewPath, "utf8");

    expect(html).toContain("component-id-label");
    expect(html).toContain('<span class="component-id-label">SlimeButton</span>');
    expect(html).toContain('<span class="component-id-label">SlimeWeekCalendar</span>');
    expect(html).not.toContain('<span class="badge accent">SlimeButton</span>');
    expect(html).not.toContain('<span class="badge warning">SlimeLogCard</span>');
  });

  it("loads the component preview as a Vue entrypoint instead of static component mockups", () => {
    const html = readFileSync(previewPath, "utf8");

    expect(html).toContain('class="dark"');
    expect(html).toContain('type="module" src="./codex-style-components-preview.ts"');
    expect(html).toContain('data-component-id="SlimeSelect"');
    expect(html).toContain('data-component-id="SlimeResourceCard"');
    expect(html).toContain('data-component-id="SlimeWeekCalendar"');
    expect(html).toContain('data-component-id="SlimeTaskList"');
    expect(html).toContain('data-component-id="SlimeTimeline"');
  });
});
