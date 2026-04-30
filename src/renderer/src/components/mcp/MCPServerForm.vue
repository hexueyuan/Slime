<script setup lang="ts">
import { ref, watch } from "vue";
import type { MCPServer } from "@shared/types/mcp";

const props = defineProps<{ open: boolean; server?: MCPServer | null }>();
const emit = defineEmits<{ "update:open": [boolean]; saved: [config: any] }>();

const name = ref("");
const transport = ref<"stdio" | "http">("stdio");
const command = ref("");
const args = ref("");
const env = ref("");
const url = ref("");
const httpHeaders = ref("");

watch(
  () => props.open,
  (val) => {
    if (!val) return;
    if (props.server) {
      name.value = props.server.name;
      transport.value = props.server.transport;
      command.value = props.server.command ?? "";
      args.value = props.server.args?.join(" ") ?? "";
      env.value = props.server.env
        ? Object.entries(props.server.env)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n")
        : "";
      url.value = props.server.url ?? "";
      httpHeaders.value = props.server.httpHeaders ? JSON.stringify(props.server.httpHeaders) : "";
    } else {
      name.value = "";
      transport.value = "stdio";
      command.value = "";
      args.value = "";
      env.value = "";
      url.value = "";
      httpHeaders.value = "";
    }
  },
);

function onSave() {
  if (!name.value.trim()) return;
  const config: any = {
    id: props.server?.id ?? crypto.randomUUID(),
    name: name.value.trim(),
    transport: transport.value,
    enabled: true,
  };
  if (transport.value === "stdio") {
    config.command = command.value.trim();
    config.args = args.value.trim() ? args.value.trim().split(/\s+/) : [];
    if (env.value.trim()) {
      config.env = Object.fromEntries(
        env.value
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const idx = l.indexOf("=");
            return idx >= 0 ? [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] : [l.trim(), ""];
          }),
      );
    }
  } else {
    config.url = url.value.trim();
    if (httpHeaders.value.trim()) {
      try {
        config.httpHeaders = JSON.parse(httpHeaders.value.trim());
      } catch {}
    }
  }
  emit("saved", config);
  emit("update:open", false);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="$emit('update:open', false)" />
      <div class="relative w-[480px] rounded-lg border border-border bg-card p-5 shadow-xl">
        <h2 class="text-sm font-semibold mb-4">{{ server ? "编辑" : "添加" }} MCP Server</h2>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-muted-foreground">名称</label>
            <input
              v-model="name"
              class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm"
              placeholder="My Server"
            />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">传输类型</label>
            <div class="flex gap-2">
              <button
                :class="[
                  'rounded px-3 py-1 text-xs',
                  transport === 'stdio'
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'bg-muted text-muted-foreground',
                ]"
                @click="transport = 'stdio'"
              >
                stdio
              </button>
              <button
                :class="[
                  'rounded px-3 py-1 text-xs',
                  transport === 'http'
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'bg-muted text-muted-foreground',
                ]"
                @click="transport = 'http'"
              >
                HTTP
              </button>
            </div>
          </div>
          <template v-if="transport === 'stdio'">
            <div>
              <label class="text-xs text-muted-foreground">Command</label>
              <input
                v-model="command"
                class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm"
                placeholder="npx"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground">Arguments</label>
              <input
                v-model="args"
                class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm"
                placeholder="-y @anthropic/mcp-github"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground">环境变量（KEY=VALUE 每行一个）</label>
              <textarea
                v-model="env"
                rows="2"
                class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm resize-none"
                placeholder="GITHUB_TOKEN=ghp_xxx"
              />
            </div>
          </template>
          <template v-else>
            <div>
              <label class="text-xs text-muted-foreground">URL</label>
              <input
                v-model="url"
                class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm"
                placeholder="https://mcp.example.com"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground">Headers (JSON)</label>
              <input
                v-model="httpHeaders"
                class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm"
                placeholder='{"Authorization":"Bearer xxx"}'
              />
            </div>
          </template>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button
            class="rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            @click="$emit('update:open', false)"
          >
            取消
          </button>
          <button
            class="rounded-md bg-violet-600 px-4 py-1.5 text-sm text-white hover:bg-violet-500"
            @click="onSave"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
