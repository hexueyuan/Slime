import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const previewPath = resolve("docs/superpowers/prototypes/codex-style-components-preview.html");

describe("codex-style components preview", () => {
  it("defines device buttons for responsive component preview", () => {
    const html = readFileSync(previewPath, "utf8");

    expect(html).toContain('data-device="desktop"');
    expect(html).toContain('data-width="1280px"');
    expect(html).toContain('data-device="laptop"');
    expect(html).toContain('data-width="1024px"');
    expect(html).toContain('data-device="tablet"');
    expect(html).toContain('data-width="768px"');
    expect(html).toContain('data-device="mobile"');
    expect(html).toContain('data-width="390px"');
  });

  it("contains the script that updates preview width and active state", () => {
    const html = readFileSync(previewPath, "utf8");

    expect(html).toContain("function setPreviewDevice(button)");
    expect(html).toContain('previewFrame.style.setProperty("--preview-width", width)');
    expect(html).toContain("deviceLabel.textContent = `${button.textContent?.trim()} · ${width}`");
  });
});
