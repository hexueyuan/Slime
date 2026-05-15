#!/usr/bin/env node
import http from "node:http";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const port = Number(process.env.PORT || process.env.SLIME_TEST_CURATOR_PORT || 4866);
const decisionFile =
  process.env.SLIME_TEST_CURATOR_DECISIONS || "/tmp/slime-test-curation-decisions.json";

const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TEST_DIRS = ["test", "src/main", "src/renderer"];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "out") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, out);
    } else if (TEST_FILE_RE.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

function sourceKind(file) {
  const ext = extname(file);
  if (ext === ".tsx" || ext === ".jsx") return ts.ScriptKind.TSX;
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function lineOf(source, pos) {
  return source.getLineAndCharacterOfPosition(pos).line + 1;
}

function callName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const left = callName(expr.expression);
    return left ? `${left}.${expr.name.text}` : expr.name.text;
  }
  return "";
}

function baseCallName(expr) {
  const name = callName(expr);
  const parts = name.split(".");
  return parts[0] ?? "";
}

function stringArg(node) {
  const arg = node.arguments[0];
  if (!arg) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  return arg.getText().slice(0, 80);
}

function compact(text) {
  return text.replace(/\s+/g, " ").trim();
}

function collectAssertions(body) {
  const assertions = [];
  const helpers = new Set();

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const full = callName(node.expression);
      const text = compact(node.getText());
      if (text.startsWith("expect(") && /\.(?:not\.)?(?:resolves\.|rejects\.)?to[A-Z]/.test(text)) {
        assertions.push(compact(node.getText()).slice(0, 180));
        return;
      } else if (text.startsWith("expect.")) {
        return;
      } else if (full.startsWith("vi.") || full.startsWith("mock") || full.includes("mock")) {
        helpers.add(full);
      }
    }
    ts.forEachChild(node, visit);
  }

  if (body) visit(body);
  return {
    assertions: assertions.slice(0, 8),
    assertionCount: assertions.length,
    helperHints: [...helpers].slice(0, 4),
  };
}

function stableId(file, fullName, startLine) {
  return createHash("sha1")
    .update(`${relative(root, file)}\n${fullName}\n${startLine}`)
    .digest("hex")
    .slice(0, 12);
}

function moduleOf(file) {
  if (file.includes("/llm/")) return "LLM 客户端";
  if (
    file.includes("/agentChat/") ||
    file.includes("agentChat") ||
    file.includes("agentMessage") ||
    file.includes("agentSession") ||
    file.includes("agentInvoker")
  ) {
    return "Agent 对话";
  }
  if (file.includes("agentConfig") || file.includes("agentPaths") || file.includes("/agents/")) {
    return "Agent 管理";
  }
  if (file.includes("/skills/") || file.includes("skillPresenter")) return "Skills";
  if (file.includes("/gateway") || file.includes("selector") || file.includes("modelDao")) {
    return "LLM Gateway";
  }
  if (file.includes("/mcp/")) return "MCP";
  if (file.includes("/tasks/") || file.includes("taskDao") || file.includes("attachmentService")) {
    return "任务系统";
  }
  if (file.includes("browser.test") || file.includes("/browser/")) return "浏览器工具";
  if (file.includes("/cli/")) return "CLI";
  if (file.includes("evolution")) return "Evolution";
  if (file.includes("db.test") || file.includes("database") || file.includes("jsonStore")) {
    return "数据层";
  }
  if (file.includes("toolPresenter")) return "ToolPresenter 工具";
  if (
    file.includes("filePresenter") ||
    file.includes("gitPresenter") ||
    file.includes("configPresenter") ||
    file.includes("sessionPresenter") ||
    file.includes("workspacePresenter") ||
    file.includes("appPresenter") ||
    file.includes("presenter.test") ||
    file.includes("contentPresenter")
  ) {
    return "主进程 Presenter/工具";
  }
  if (file.startsWith("test/renderer/components/")) return "Renderer 组件";
  if (file.startsWith("test/renderer/stores/")) return "Renderer Store";
  if (file.startsWith("test/renderer/views/")) return "Renderer 视图";
  if (file.startsWith("test/renderer/composables/")) return "Renderer Composable";
  if (
    file.includes("tray") ||
    file.includes("eventbus") ||
    file.includes("runtime") ||
    file.includes("paths")
  ) {
    return "应用运行时/基础设施";
  }
  return "其他";
}

function parseFile(file) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, sourceKind(file));
  const cases = [];
  const suiteStack = [];

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = baseCallName(node.expression);
      const title = stringArg(node);
      const callback = node.arguments[1];

      if (title && (name === "describe" || name === "suite" || name === "context")) {
        suiteStack.push(title);
        if (callback) ts.forEachChild(callback, visit);
        suiteStack.pop();
        return;
      }

      if (title && (name === "it" || name === "test")) {
        const startLine = lineOf(source, node.getStart(source));
        const endLine = lineOf(source, node.getEnd());
        const fullName = [...suiteStack, title].join(" > ");
        const assertionInfo = collectAssertions(callback);
        const testCase = {
          id: stableId(file, fullName, startLine),
          file: relative(root, file),
          module: moduleOf(relative(root, file)),
          title,
          suite: [...suiteStack],
          fullName,
          startLine,
          endLine,
          assertionCount: assertionInfo.assertionCount,
          assertions: assertionInfo.assertions,
          helperHints: assertionInfo.helperHints,
          summary: buildSummary(fullName, assertionInfo.assertions, assertionInfo.assertionCount),
          ...buildExamples(assertionInfo.assertions),
        };
        cases.push({ ...testCase, ...explainCase(testCase) });
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return cases;
}

function humanizeScenario(fullName) {
  const text = fullName
    .replaceAll(" > ", " / ")
    .replace(/\bshould\b/gi, "")
    .replace(/\breturns?\b/gi, "返回")
    .replace(/\brenders?\b/gi, "渲染")
    .replace(/\bthrows?\b/gi, "抛出")
    .replace(/\bcalls?\b/gi, "调用")
    .replace(/\bcreates?\b/gi, "创建")
    .replace(/\bupdates?\b/gi, "更新")
    .replace(/\bdeletes?\b/gi, "删除")
    .replace(/\bloads?\b/gi, "加载")
    .replace(/\bfilters?\b/gi, "过滤")
    .replace(/\s+/g, " ")
    .trim();

  if (/429|rate limit|限流/i.test(text)) return `供应商 API Key 限流（${text}）`;
  if (/auth|api key|认证|无效 key|过期 key/i.test(text)) return `网关 API Key 认证（${text}）`;
  if (/runtime.*lock|runtimeLock|data directory lock|runtime\.lock/i.test(text)) {
    return `运行时数据目录锁（${text}）`;
  }
  if (/runtime.*profile|SLIME_E2E|SLIME_USER_DATA|profile/i.test(text)) {
    return `运行 Profile 选择（${text}）`;
  }
  if (/slimeHomeDir|paths|路径/i.test(text)) return `Slime 路径解析（${text}）`;
  if (/web_fetch|makeWebFetchTool|fetch/i.test(text)) return `网页抓取工具（${text}）`;
  if (/browser_/i.test(text)) return `浏览器工具（${text}）`;
  if (/relayStream|流式/i.test(text)) return `Gateway 流式转发（${text}）`;
  if (/relay|转发/i.test(text)) return `Gateway 转发（${text}）`;
  if (/Skill|skill|技能/i.test(text)) return `Skill 加载与过滤（${text}）`;
  if (/AgentChat|chat/i.test(text)) return `Agent 对话流程（${text}）`;
  if (/SplitPane|split pane|leftWidth|rightWidth/i.test(text)) return `分栏布局尺寸计算（${text}）`;
  return text;
}

function explainCase(testCase) {
  const name = testCase.fullName;
  const file = testCase.file;
  const assertions = testCase.assertions.join(" ");

  if (/failover sorts by priority descending/i.test(name)) {
    return {
      explanation:
        "验证 Gateway failover 策略会按 priority 从高到低选择渠道，避免降级或容灾时先走低优先级供应商。",
      recommendation: "建议保留",
      reason: "这是核心路由策略，删掉后流量顺序回归不容易被发现。",
    };
  }
  if (/429|rate limit|限流/i.test(name + assertions)) {
    return {
      explanation:
        "验证供应商 API Key 被限流后的处理，包括冷却、跳过或标记限流，避免持续打到不可用 key。",
      recommendation: "建议保留",
      reason: "限流处理直接影响 Gateway 稳定性和调用成本。",
    };
  }
  if (/auth|api key|认证|过期 key|无效 key|disabled key/i.test(name)) {
    return {
      explanation: "验证 Gateway API Key 认证，确保无效、过期或禁用 key 会被拒绝。",
      recommendation: "建议保留",
      reason: "认证测试属于安全边界，不建议删除。",
    };
  }
  if (/runtime.*lock|runtimeLock|runtime\.lock|data directory lock/i.test(name + file)) {
    return {
      explanation:
        "验证同一个数据目录只能被一个 Slime 实例占用，避免多个进程同时写 SQLite、配置和会话文件。",
      recommendation: "建议保留",
      reason: "这是 runtime profile 设计的关键安全约束。",
    };
  }
  if (/runtime.*profile|SLIME_E2E|SLIME_USER_DATA|SLIME_HOME|profile/i.test(name + assertions)) {
    return {
      explanation:
        "验证生产、开发、staging、E2E 的数据目录选择规则，确保测试隔离且默认开发使用真实数据。",
      recommendation: "建议保留",
      reason: "这是运行环境隔离规则，删掉后数据目录回归不易被发现。",
    };
  }
  if (/relay|router|balancer|circuitBreaker|keyPool|selector/i.test(file + name)) {
    return {
      explanation: "验证 LLM Gateway 的路由、负载均衡、熔断、key 选择或请求转发行为。",
      recommendation: "建议保留",
      reason: "Gateway 是核心链路，这类单测能防止供应商路由和转发回归。",
    };
  }
  if (/recordToCoreMessages|buildContext|selectTurnHistory|contextBuilder/i.test(file + name)) {
    return {
      explanation:
        "验证 Agent 对话上下文构造、消息格式转换或历史截断规则，确保发给 LLM 的消息结构合法。",
      recommendation: "建议保留",
      reason: "上下文格式一旦回归会直接影响 Agent 对话和工具调用，建议保留。",
    };
  }
  if (/dao|database|db\.test|migration|insert|update|delete|list/i.test(file + name)) {
    return {
      explanation: "验证数据库表、DAO 增删改查、迁移或字段序列化行为。",
      recommendation: "建议保留",
      reason: "数据层回归破坏面大，建议保留关键 CRUD 和迁移测试。",
    };
  }
  if (/throws|rejects|blocked|forbidden|invalid|not allowed|抛错/i.test(name + assertions)) {
    return {
      explanation: "验证异常路径、安全拦截或非法输入是否按预期触发。",
      recommendation: "建议保留",
      reason: "负向测试覆盖边界条件，通常比静态渲染测试更值得保留。",
    };
  }
  if (
    /render|renders|should render|Dialog|Panel|Message|Settings|Button|Toolbar/i.test(name + file)
  ) {
    return {
      explanation: "验证前端组件在特定状态下显示正确内容、按钮或交互入口。",
      recommendation: "可考虑删除",
      reason: "如果只是检查静态文案或按钮存在，价值通常较低；建议只保留关键用户流程。",
    };
  }
  if (/store|Pinia|use.*Store/i.test(file + name)) {
    return {
      explanation: "验证前端状态管理的初始状态、状态变更或 IPC 事件同步。",
      recommendation: "建议合并/精简",
      reason: "Store 测试可保留关键状态流转，重复 getter 或初始值检查可合并。",
    };
  }
  if (/format|utils|helper|parse|estimate/i.test(file + name)) {
    return {
      explanation: "验证工具函数、解析器或格式化逻辑在典型输入下输出正确。",
      recommendation: "建议合并/精简",
      reason: "工具函数测试有价值，但相似输入的多个 case 可合并成参数化测试。",
    };
  }

  return {
    explanation: `验证 ${humanizeScenario(name)} 这个行为是否符合预期。`,
    recommendation: "待人工判断",
    reason: "当前只能从 case 名和断言粗略判断，需要结合模块重要性决定是否删除。",
  };
}

function extractExpectedValue(assertion) {
  const match = assertion.match(/\.(?:toBe|toEqual|toContain|toHaveLength)\((.*)\)/);
  return match ? match[1].slice(0, 80) : "";
}

function extractSubject(assertion) {
  const match = assertion.match(/^expect\((.*)\)\.(?:not\.)?(?:resolves\.|rejects\.)?to[A-Z]/);
  if (!match) return "结果";
  return match[1].slice(0, 70);
}

function summarizeAssertion(assertion) {
  const text = assertion.replace(/\s+/g, " ");
  const expected = extractExpectedValue(text);
  const subject = extractSubject(text);

  if (/rejects\.toThrow|toThrow/.test(text)) {
    const message = text.match(/toThrow\((.*)\)/)?.[1]?.slice(0, 80);
    return message ? `${subject} 抛出异常：${message}` : `${subject} 抛出预期异常`;
  }
  if (/toHaveBeenCalledWith/.test(text)) return `${subject} 被调用，且参数符合预期`;
  if (/toHaveBeenCalledTimes/.test(text)) {
    return `${subject} 调用次数符合预期${expected ? `：${expected}` : ""}`;
  }
  if (/not\.toHaveBeenCalled/.test(text)) return `${subject} 不会被调用`;
  if (/toHaveProperty/.test(text)) return `${subject} 包含指定字段`;
  if (/toHaveLength/.test(text)) return `${subject} 数量符合预期${expected ? `：${expected}` : ""}`;
  if (/not\.toBeUndefined|toBeDefined/.test(text)) return `${subject} 存在/已定义`;
  if (/toBeUndefined/.test(text)) return `${subject} 为空或未定义`;
  if (/toBeNull/.test(text)) return `${subject} 为 null`;
  if (/toBeTruthy/.test(text)) return `${subject} 为真`;
  if (/toBeFalsy/.test(text)) return `${subject} 为假`;
  if (/toContain/.test(text)) return `${subject} 包含预期内容${expected ? `：${expected}` : ""}`;
  if (/toEqual/.test(text)) return `${subject} 结构与预期一致${expected ? `：${expected}` : ""}`;
  if (/toBe/.test(text)) return `${subject} 等于预期值${expected ? `：${expected}` : ""}`;
  if (/toBeGreaterThanOrEqual/.test(text)) return `${subject} 大于或等于下限`;
  if (/toMatchObject/.test(text)) return `${subject} 包含预期字段`;
  return text.replace(/^expect\(/, "断言 ").slice(0, 120);
}

function classifyAssertion(assertion) {
  const text = assertion.replace(/\s+/g, " ");
  if (/rejects\.toThrow|toThrow|blocked|forbidden|invalid|not allowed/i.test(text)) {
    return "bad";
  }
  if (/not\.toHaveBeenCalled|toBeUndefined|toBeNull|toBeFalsy/.test(text)) return "bad";
  return "good";
}

function buildSummary(fullName, assertions, assertionCount) {
  const scenario = humanizeScenario(fullName);
  if (assertions.length === 0) {
    return `验证场景：${scenario}；断言：未检测到显式 expect，可能通过异常、快照或副作用完成验证。`;
  }
  const summaries = [...new Set(assertions.slice(0, 4).map(summarizeAssertion))];
  const suffix =
    assertionCount > summaries.length ? `；另有 ${assertionCount - summaries.length} 条断言` : "";
  return `验证场景：${scenario}；断言：${summaries.join("；")}${suffix}`;
}

function buildExamples(assertions) {
  const good = [];
  const bad = [];
  for (const assertion of assertions) {
    const item = summarizeAssertion(assertion);
    if (classifyAssertion(assertion) === "bad") bad.push(item);
    else good.push(item);
  }
  return {
    goodCases: good.length > 0 ? [...new Set(good)].slice(0, 4) : ["正常路径符合预期"],
    badCases: bad.length > 0 ? [...new Set(bad)].slice(0, 4) : ["未覆盖明显异常路径"],
  };
}

function scanCases() {
  const files = TEST_DIRS.flatMap((dir) => walk(resolve(root, dir)));
  const unique = [...new Set(files)].sort();
  const cases = unique.flatMap(parseFile).sort((a, b) => {
    const fileCmp = a.file.localeCompare(b.file);
    return fileCmp || a.startLine - b.startLine;
  });
  const byFile = new Map();
  const byModule = new Map();
  for (const testCase of cases) {
    if (!byFile.has(testCase.file)) byFile.set(testCase.file, []);
    byFile.get(testCase.file).push(testCase);
    if (!byModule.has(testCase.module))
      byModule.set(testCase.module, { files: new Set(), cases: [] });
    byModule.get(testCase.module).files.add(testCase.file);
    byModule.get(testCase.module).cases.push(testCase);
  }
  return {
    generatedAt: new Date().toISOString(),
    total: cases.length,
    modules: [...byModule.entries()]
      .map(([name, group]) => ({
        name,
        count: group.cases.length,
        fileCount: group.files.size,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    files: [...byFile.entries()].map(([file, fileCases]) => ({
      file,
      module: fileCases[0]?.module ?? "其他",
      count: fileCases.length,
      cases: fileCases,
    })),
    cases,
  };
}

function readJsonBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(INDEX_HTML);
}

let cached = scanCases();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (url.pathname === "/") {
      sendHtml(res);
      return;
    }

    if (url.pathname === "/api/cases") {
      sendJson(res, 200, cached);
      return;
    }

    if (url.pathname === "/api/rescan" && req.method === "POST") {
      cached = scanCases();
      sendJson(res, 200, cached);
      return;
    }

    if (url.pathname === "/api/decisions" && req.method === "GET") {
      const decisions = existsSync(decisionFile)
        ? JSON.parse(readFileSync(decisionFile, "utf8"))
        : { deleteIds: [], keepIds: [], notes: "" };
      sendJson(res, 200, { decisionFile, decisions });
      return;
    }

    if (url.pathname === "/api/decisions" && req.method === "POST") {
      const body = await readJsonBody(req);
      const deleteIds = Array.isArray(body.deleteIds) ? body.deleteIds : [];
      const mergeIds = Array.isArray(body.mergeIds) ? body.mergeIds : [];
      const keepIds = Array.isArray(body.keepIds) ? body.keepIds : [];
      const caseById = new Map(cached.cases.map((item) => [item.id, item]));
      const deleteCases = deleteIds.map((id) => caseById.get(id)).filter(Boolean);
      const mergeCases = mergeIds.map((id) => caseById.get(id)).filter(Boolean);
      const keepCases = keepIds.map((id) => caseById.get(id)).filter(Boolean);
      const payload = {
        savedAt: new Date().toISOString(),
        decisionFile,
        totalCases: cached.total,
        deleteCount: deleteCases.length,
        mergeCount: mergeCases.length,
        keepCount: keepCases.length,
        deleteIds,
        mergeIds,
        keepIds,
        deleteCases,
        mergeCases,
        keepCases,
        notes: typeof body.notes === "string" ? body.notes : "",
      };
      writeFileSync(decisionFile, JSON.stringify(payload, null, 2), "utf8");
      sendJson(res, 200, payload);
      return;
    }

    sendJson(res, 404, { error: "not found" });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Slime test-case curator running at http://127.0.0.1:${port}`);
  console.log(`Loaded ${cached.total} test cases from ${cached.files.length} files`);
  console.log(`Decisions will be saved to ${decisionFile}`);
});

const INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Slime Test Case Curator</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7f4;
      --panel: #ffffff;
      --ink: #202124;
      --muted: #666b73;
      --line: #d9ddd5;
      --accent: #1d6f5f;
      --danger: #b42318;
      --danger-bg: #fff0ed;
      --chip: #eef2ed;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      border-bottom: 1px solid var(--line);
      background: rgba(247, 247, 244, 0.96);
      backdrop-filter: blur(10px);
    }
    .bar {
      display: grid;
      grid-template-columns: minmax(260px, 1fr) auto;
      gap: 16px;
      align-items: center;
      padding: 14px 18px;
    }
    h1 {
      margin: 0;
      font-size: 18px;
      line-height: 1.2;
      font-weight: 700;
    }
    .subtitle {
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    button {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      border-radius: 7px;
      padding: 8px 11px;
      font-size: 13px;
      cursor: pointer;
    }
    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
      font-weight: 650;
    }
    button.danger {
      color: var(--danger);
      border-color: #f0bab2;
      background: var(--danger-bg);
    }
    main {
      display: grid;
      grid-template-columns: 290px minmax(0, 1fr);
      min-height: calc(100vh - 74px);
    }
    aside {
      border-right: 1px solid var(--line);
      padding: 14px;
      background: #fbfbf8;
    }
    .content {
      padding: 14px 18px 32px;
    }
    .field {
      display: grid;
      gap: 6px;
      margin-bottom: 12px;
    }
    label {
      font-size: 12px;
      color: var(--muted);
      font-weight: 650;
    }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: white;
      color: var(--ink);
      padding: 9px 10px;
      font: inherit;
      font-size: 13px;
    }
    textarea {
      min-height: 78px;
      resize: vertical;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin: 12px 0;
    }
    .stat {
      padding: 10px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 7px;
    }
    .stat b {
      display: block;
      font-size: 20px;
    }
    .stat span {
      color: var(--muted);
      font-size: 12px;
    }
    .file {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      margin-bottom: 12px;
      overflow: hidden;
    }
    .file-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 11px 12px;
      background: #f0f3ee;
      border-bottom: 1px solid var(--line);
      cursor: pointer;
    }
    .file-title {
      min-width: 0;
      font-size: 13px;
      font-weight: 700;
      word-break: break-all;
    }
    .file-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .case {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
      border-bottom: 1px solid var(--line);
    }
    .case:last-child { border-bottom: 0; }
    .case.marked { background: var(--danger-bg); }
    .decision {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 8px 0 10px;
    }
    .decision button {
      padding: 5px 9px;
      font-size: 12px;
      border-radius: 999px;
    }
    .decision button.active.keep { background: #e9f7f0; border-color: #78c9a0; color: #116149; }
    .decision button.active.delete { background: var(--danger-bg); border-color: #e88c82; color: var(--danger); }
    .decision button.active.merge { background: #fff6db; border-color: #d6b75f; color: #7a4d00; }
    .examples {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin: 8px 0;
    }
    .example-box {
      border: 1px solid var(--line);
      background: #fafbf8;
      border-radius: 7px;
      padding: 8px;
      min-width: 0;
    }
    .example-title {
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 5px;
    }
    .example-title.good { color: #116149; }
    .example-title.bad { color: var(--danger); }
    .example-box ul {
      margin: 0;
      padding-left: 17px;
      color: #34383d;
      font-size: 12px;
      line-height: 1.45;
    }
    details {
      margin-top: 7px;
    }
    summary {
      cursor: pointer;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }
    .case-title {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.35;
      margin-bottom: 4px;
    }
    .case-path {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 7px;
    }
    .recommendation {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 7px;
      border: 1px solid var(--line);
    }
    .rec-keep { color: #116149; background: #e9f7f0; border-color: #b9e2ce; }
    .rec-trim { color: #7a4d00; background: #fff6db; border-color: #ead18b; }
    .rec-delete { color: var(--danger); background: var(--danger-bg); border-color: #f0bab2; }
    .rec-unknown { color: #555b63; background: #f1f2f0; }
    .explanation {
      font-size: 13px;
      line-height: 1.55;
      margin: 0 0 7px;
    }
    .reason {
      font-size: 12px;
      line-height: 1.45;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .summary {
      font-size: 13px;
      line-height: 1.5;
      color: #34383d;
      margin-bottom: 8px;
    }
    .assertions {
      display: grid;
      gap: 5px;
    }
    code {
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border-radius: 6px;
      padding: 6px 8px;
      background: #f5f6f2;
      border: 1px solid #e3e7df;
      font-size: 12px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 7px;
    }
    .chip {
      background: var(--chip);
      border: 1px solid var(--line);
      color: var(--muted);
      border-radius: 999px;
      padding: 3px 7px;
      font-size: 11px;
    }
    .empty {
      padding: 40px;
      text-align: center;
      color: var(--muted);
    }
    @media (max-width: 880px) {
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .bar { grid-template-columns: 1fr; }
      .actions { justify-content: flex-start; }
      .examples { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <div>
        <h1>Slime Test Case Curator</h1>
        <div class="subtitle" id="subtitle">正在加载测试用例...</div>
      </div>
      <div class="actions">
        <button id="rescan">重新扫描</button>
        <button class="danger" id="clear">清空勾选</button>
        <button class="primary" id="submit">提交删除决策</button>
      </div>
    </div>
  </header>
  <main>
    <aside>
      <div class="field">
        <label for="q">搜索</label>
        <input id="q" placeholder="文件名、case 名、断言..." />
      </div>
      <div class="field">
        <label for="moduleFilter">模块</label>
        <select id="moduleFilter"><option value="">全部模块</option></select>
      </div>
      <div class="field">
        <label for="fileFilter">文件过滤</label>
        <select id="fileFilter"><option value="">全部文件</option></select>
      </div>
      <div class="field">
        <label for="mode">显示</label>
        <select id="mode">
          <option value="all">全部</option>
          <option value="marked">仅已勾选删除</option>
          <option value="unmarked">仅保留</option>
        </select>
      </div>
      <div class="field">
        <label for="recommendationFilter">建议标签</label>
        <select id="recommendationFilter">
          <option value="">全部建议</option>
          <option value="可考虑删除">可考虑删除</option>
          <option value="建议合并/精简">建议合并/精简</option>
          <option value="建议保留">建议保留</option>
          <option value="待人工判断">待人工判断</option>
        </select>
      </div>
      <button class="danger" id="markVisibleDelete" style="width: 100%; margin-bottom: 10px;">将当前可见标为删除</button>
      <div class="stats">
        <div class="stat"><b id="total">0</b><span>测试用例</span></div>
        <div class="stat"><b id="marked">0</b><span>已勾选删除</span></div>
        <div class="stat"><b id="visible">0</b><span>当前可见</span></div>
        <div class="stat"><b id="files">0</b><span>测试文件</span></div>
      </div>
      <div class="field">
        <label for="notes">备注</label>
        <textarea id="notes" placeholder="可写下你的删除原则或特别说明"></textarea>
      </div>
      <p class="subtitle">提交后会保存到服务器本地 JSON，Codex 会按你的选择删除对应 case。</p>
    </aside>
    <section class="content" id="content"></section>
  </main>
  <script>
    let data = null;
    const decisions = new Map();
    const collapsed = new Set();
    const els = {
      subtitle: document.getElementById("subtitle"),
      q: document.getElementById("q"),
      fileFilter: document.getElementById("fileFilter"),
      moduleFilter: document.getElementById("moduleFilter"),
      recommendationFilter: document.getElementById("recommendationFilter"),
      mode: document.getElementById("mode"),
      markVisibleDelete: document.getElementById("markVisibleDelete"),
      total: document.getElementById("total"),
      marked: document.getElementById("marked"),
      visible: document.getElementById("visible"),
      files: document.getElementById("files"),
      content: document.getElementById("content"),
      notes: document.getElementById("notes"),
      submit: document.getElementById("submit"),
      clear: document.getElementById("clear"),
      rescan: document.getElementById("rescan"),
    };

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    async function load() {
      data = await fetch("/api/cases").then((r) => r.json());
      const saved = await fetch("/api/decisions").then((r) => r.json()).catch(() => null);
      if (saved?.decisions?.deleteIds) {
        for (const id of saved.decisions.deleteIds) decisions.set(id, "delete");
        for (const id of saved.decisions.mergeIds || []) decisions.set(id, "merge");
        for (const id of saved.decisions.keepIds || []) decisions.set(id, "keep");
        els.notes.value = saved.decisions.notes || "";
      }
      els.fileFilter.innerHTML =
        '<option value="">全部文件</option>' +
        data.files.map((f) => '<option value="' + escapeHtml(f.file) + '">' + escapeHtml(f.file) + ' (' + f.count + ')</option>').join("");
      els.moduleFilter.innerHTML =
        '<option value="">全部模块</option>' +
        data.modules.map((m) => '<option value="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + ' (' + m.count + ' / ' + m.fileCount + ' files)</option>').join("");
      render();
    }

    function matches(testCase) {
      const q = els.q.value.trim().toLowerCase();
      const fileFilter = els.fileFilter.value;
      const moduleFilter = els.moduleFilter.value;
      const recommendationFilter = els.recommendationFilter.value;
      const mode = els.mode.value;
      if (moduleFilter && testCase.module !== moduleFilter) return false;
      if (fileFilter && testCase.file !== fileFilter) return false;
      if (recommendationFilter && testCase.recommendation !== recommendationFilter) return false;
      if (mode === "marked" && decisions.get(testCase.id) !== "delete") return false;
      if (mode === "unmarked" && decisions.get(testCase.id) === "delete") return false;
      if (!q) return true;
      const haystack = [
        testCase.file,
        testCase.module,
        testCase.fullName,
        testCase.summary,
        testCase.explanation,
        testCase.recommendation,
        testCase.reason,
        ...(testCase.goodCases || []),
        ...(testCase.badCases || []),
        ...testCase.assertions,
      ].join("\\n").toLowerCase();
      return haystack.includes(q);
    }

    function render() {
      const visibleFiles = [];
      let visibleCount = 0;
      for (const file of data.files) {
        const cases = file.cases.filter(matches);
        if (cases.length > 0) {
          visibleFiles.push({ ...file, cases });
          visibleCount += cases.length;
        }
      }

      els.subtitle.textContent = "共 " + data.total + " 个 case，来自 " + data.files.length + " 个文件；扫描时间 " + data.generatedAt;
      els.total.textContent = data.total;
      els.marked.textContent = [...decisions.values()].filter((v) => v === "delete").length;
      els.visible.textContent = visibleCount;
      els.files.textContent = visibleFiles.length;

      if (visibleFiles.length === 0) {
        els.content.innerHTML = '<div class="empty">没有匹配的测试用例</div>';
        return;
      }

      els.content.innerHTML = visibleFiles.map((file) => {
        const isCollapsed = collapsed.has(file.file);
        const markedInFile = file.cases.filter((c) => decisions.get(c.id) === "delete").length;
        return '<article class="file">' +
          '<div class="file-head" data-file="' + escapeHtml(file.file) + '">' +
          '<div class="file-title">' + (isCollapsed ? "▸ " : "▾ ") + escapeHtml(file.module) + " / " + escapeHtml(file.file) + '</div>' +
            '<div class="file-meta"><span>' + file.cases.length + ' visible</span><span>' + markedInFile + ' marked</span></div>' +
          '</div>' +
          (isCollapsed ? '' : file.cases.map(renderCase).join('')) +
        '</article>';
      }).join("");

      document.querySelectorAll(".file-head").forEach((node) => {
        node.addEventListener("click", () => {
          const file = node.getAttribute("data-file");
          if (collapsed.has(file)) collapsed.delete(file);
          else collapsed.add(file);
          render();
        });
      });
      document.querySelectorAll('button[data-case-id]').forEach((node) => {
        node.addEventListener("click", (event) => {
          event.stopPropagation();
          const id = node.dataset.caseId;
          const value = node.dataset.decision;
          if (decisions.get(id) === value) decisions.delete(id);
          else decisions.set(id, value);
          render();
        });
      });
    }

    function renderCase(testCase) {
      const decision = decisions.get(testCase.id) || "";
      const recClass = testCase.recommendation === "建议保留"
        ? "rec-keep"
        : testCase.recommendation === "可考虑删除"
          ? "rec-delete"
          : testCase.recommendation === "建议合并/精简"
            ? "rec-trim"
            : "rec-unknown";
      return '<div class="case ' + (decision === "delete" ? 'marked' : '') + '">' +
        '<div>' +
          '<div class="case-title">' + escapeHtml(testCase.fullName) + '</div>' +
          '<div class="case-path">' + escapeHtml(testCase.module) + ' · ' + escapeHtml(testCase.file) + ':' + testCase.startLine + '-' + testCase.endLine + '</div>' +
          '<div class="recommendation ' + recClass + '">' + escapeHtml(testCase.recommendation) + '</div>' +
          '<p class="explanation">' + escapeHtml(testCase.explanation) + '</p>' +
          '<div class="reason">' + escapeHtml(testCase.reason) + '</div>' +
          '<div class="decision">' +
            '<button class="keep ' + (decision === "keep" ? "active" : "") + '" data-case-id="' + testCase.id + '" data-decision="keep">保留</button>' +
            '<button class="delete ' + (decision === "delete" ? "active" : "") + '" data-case-id="' + testCase.id + '" data-decision="delete">删除</button>' +
            '<button class="merge ' + (decision === "merge" ? "active" : "") + '" data-case-id="' + testCase.id + '" data-decision="merge">合并/精简</button>' +
          '</div>' +
          '<div class="examples">' +
            '<div class="example-box"><div class="example-title good">Good case</div><ul>' + (testCase.goodCases || []).map((x) => '<li>' + escapeHtml(x) + '</li>').join('') + '</ul></div>' +
            '<div class="example-box"><div class="example-title bad">Bad case</div><ul>' + (testCase.badCases || []).map((x) => '<li>' + escapeHtml(x) + '</li>').join('') + '</ul></div>' +
          '</div>' +
          '<div class="summary">' + escapeHtml(testCase.summary) + '</div>' +
          '<details><summary>原始 expect 断言</summary><div class="assertions">' + testCase.assertions.map((a) => '<code>' + escapeHtml(a) + '</code>').join('') + '</div></details>' +
          '<div class="chips"><span class="chip">assertions: ' + testCase.assertionCount + '</span><span class="chip">id: ' + testCase.id + '</span><span class="chip">decision: ' + escapeHtml(decision || '未选择') + '</span></div>' +
        '</div>' +
      '</div>';
    }

    els.q.addEventListener("input", render);
    els.moduleFilter.addEventListener("change", () => {
      els.fileFilter.value = "";
      render();
    });
    els.fileFilter.addEventListener("change", render);
    els.recommendationFilter.addEventListener("change", render);
    els.mode.addEventListener("change", render);
    els.clear.addEventListener("click", () => {
      decisions.clear();
      render();
    });
    els.rescan.addEventListener("click", async () => {
      data = await fetch("/api/rescan", { method: "POST" }).then((r) => r.json());
      render();
    });
    els.markVisibleDelete.addEventListener("click", () => {
      let count = 0;
      for (const item of data.cases) {
        if (matches(item)) {
          decisions.set(item.id, "delete");
          count++;
        }
      }
      alert("已将当前可见的 " + count + " 条标为删除，尚未提交。");
      render();
    });
    els.submit.addEventListener("click", async () => {
      const result = await fetch("/api/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deleteIds: [...decisions.entries()].filter(([, v]) => v === "delete").map(([id]) => id),
          mergeIds: [...decisions.entries()].filter(([, v]) => v === "merge").map(([id]) => id),
          keepIds: [...decisions.entries()].filter(([, v]) => v === "keep").map(([id]) => id),
          notes: els.notes.value,
        }),
      }).then((r) => r.json());
      alert("已保存决策：删除 " + result.deleteCount + " 条，合并/精简 " + result.mergeCount + " 条，保留 " + result.keepCount + " 条\\n" + result.decisionFile);
    });

    load();
  </script>
</body>
</html>`;
