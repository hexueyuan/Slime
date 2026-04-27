// Model icon mapping: model name prefix → brand info
// SVG assets extracted from @lobehub/icons (octopus project)

export interface ModelIconInfo {
  svg: string | null;
  bg: string;
  color: string;
  initials: string;
}

const MAPPINGS: Array<{
  prefixes: string[];
  name: string;
  bg: string;
  color: string;
  initials: string;
}> = [
  {
    prefixes: ["gpt-", "o1", "o3", "o4", "chatgpt", "text-embedding", "dall-e", "openai"],
    name: "openai",
    bg: "#000",
    color: "#fff",
    initials: "OA",
  },
  {
    prefixes: ["claude", "anthropic"],
    name: "anthropic",
    bg: "#D7765A",
    color: "#fff",
    initials: "AN",
  },
  { prefixes: ["gemini"], name: "gemini", bg: "#fff", color: "#fff", initials: "GM" },
  {
    prefixes: ["gemma", "palm", "google"],
    name: "google",
    bg: "#fff",
    color: "#fff",
    initials: "GG",
  },
  { prefixes: ["deepseek"], name: "deepseek", bg: "#4D6BFE", color: "#fff", initials: "DS" },
  {
    prefixes: ["llama", "meta-llama", "meta"],
    name: "meta",
    bg: "linear-gradient(45deg,#007FF8,#0668E1,#007FF8)",
    color: "#fff",
    initials: "MT",
  },
  {
    prefixes: ["mistral", "mixtral", "codestral", "pixtral"],
    name: "mistral",
    bg: "#FA520F",
    color: "#fff",
    initials: "MS",
  },
  {
    prefixes: ["doubao", "skylark", "bytedance"],
    name: "bytedance",
    bg: "#325AB4",
    color: "#fff",
    initials: "DB",
  },
  {
    prefixes: ["ernie", "wenxin", "baidu"],
    name: "baidu",
    bg: "#2932E1",
    color: "#fff",
    initials: "BD",
  },
  { prefixes: ["qwen", "qwq"], name: "qwen", bg: "#615ced", color: "#fff", initials: "QW" },
  { prefixes: ["alibaba"], name: "alibaba", bg: "#FF6003", color: "#fff", initials: "AL" },
  {
    prefixes: ["glm", "chatglm", "zhipu", "z-ai"],
    name: "zhipu",
    bg: "#3859FF",
    color: "#fff",
    initials: "ZP",
  },
  { prefixes: ["moonshot"], name: "moonshot", bg: "#16191E", color: "#fff", initials: "MS" },
  { prefixes: ["kimi"], name: "kimi", bg: "#000", color: "#fff", initials: "KM" },
  { prefixes: ["grok", "xai"], name: "grok", bg: "#000", color: "#fff", initials: "XA" },
  {
    prefixes: ["minimax", "abab"],
    name: "minimax",
    bg: "linear-gradient(to right,#E2167E,#FE603C)",
    color: "#fff",
    initials: "MM",
  },
  { prefixes: ["groq"], name: "groq", bg: "#F55036", color: "#fff", initials: "GQ" },
  { prefixes: ["cohere", "command"], name: "cohere", bg: "#39594D", color: "#fff", initials: "CO" },
  { prefixes: ["perplexity"], name: "perplexity", bg: "#22B8CD", color: "#000", initials: "PP" },
  { prefixes: ["ollama"], name: "ollama", bg: "#fff", color: "#000", initials: "OL" },
  { prefixes: ["cloudflare"], name: "cloudflare", bg: "#F38020", color: "#fff", initials: "CF" },
  {
    prefixes: ["huggingface", "hf-"],
    name: "huggingface",
    bg: "#FFD21E",
    color: "#fff",
    initials: "HF",
  },
  {
    prefixes: ["nvidia", "nemotron"],
    name: "nvidia",
    bg: "#74B71B",
    color: "#fff",
    initials: "NV",
  },
  { prefixes: ["azure"], name: "azure", bg: "#0078D4", color: "#fff", initials: "AZ" },
  { prefixes: ["phi-"], name: "microsoft", bg: "#00A4EF", color: "#fff", initials: "MS" },
  { prefixes: ["volcengine"], name: "volcengine", bg: "#3370FF", color: "#fff", initials: "VE" },
  { prefixes: ["siliconflow"], name: "siliconcloud", bg: "#6E29F6", color: "#fff", initials: "SC" },
  { prefixes: ["together"], name: "together", bg: "#0F6FFF", color: "#fff", initials: "TG" },
  { prefixes: ["stepfun", "step-"], name: "stepfun", bg: "#5B5CFF", color: "#fff", initials: "SF" },
  { prefixes: ["spark"], name: "spark", bg: "#0078FF", color: "#fff", initials: "SP" },
  { prefixes: ["hunyuan"], name: "hunyuan", bg: "#0052D9", color: "#fff", initials: "HY" },
  { prefixes: ["internlm"], name: "internlm", bg: "#1B3882", color: "#fff", initials: "IL" },
  { prefixes: ["yi-", "01-ai"], name: "yi", bg: "#003425", color: "#fff", initials: "YI" },
];

const svgModules = import.meta.glob("../assets/model-icons/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function svgUrl(name: string): string | null {
  const key = `../assets/model-icons/${name}.svg`;
  return svgModules[key] ?? null;
}

export function getModelIconInfo(modelName: string): ModelIconInfo {
  const name = modelName.toLowerCase();
  const stripped = name.includes("/") ? name.split("/").pop()! : name;

  for (const m of MAPPINGS) {
    for (const prefix of m.prefixes) {
      if (name.startsWith(prefix) || stripped.startsWith(prefix)) {
        return { svg: svgUrl(m.name), bg: m.bg, color: m.color, initials: m.initials };
      }
    }
  }

  const initials = modelName.slice(0, 2).toUpperCase();
  return { svg: null, bg: "#6B7280", color: "#fff", initials };
}
