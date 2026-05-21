import { createApp, defineComponent, h, ref } from "vue";
import "@/assets/main.css";
import SlimeSelect, { type SlimeSelectOption } from "@/components/ui/SlimeSelect.vue";
import SlimeResourceCard from "@/components/slime/SlimeResourceCard.vue";
import SlimeTaskList from "@/components/slime/SlimeTaskList.vue";
import SlimeTimeline from "@/components/slime/SlimeTimeline.vue";
import SlimeWeekCalendar from "@/components/slime/SlimeWeekCalendar.vue";

document.documentElement.classList.add("dark");

const providerOptions: SlimeSelectOption[] = [
  {
    value: "baidu-oneapi",
    label: "百度OneApi",
    description: "anthropic · 13 模型 · healthy",
    badge: "online",
    badgeVariant: "success",
    mark: "百",
  },
  {
    value: "ofoxai",
    label: "OfoxAI",
    description: "anthropic · 46 模型 · 延迟 2.1s",
    badge: "standby",
    mark: "O",
  },
  {
    value: "deepseek",
    label: "Deepseek",
    description: "reasoner · 2 模型 · 成本优先",
    badge: "retry",
    badgeVariant: "warning",
    mark: "D",
  },
];

const groupOptions: SlimeSelectOption[] = [
  {
    value: "default",
    label: "default",
    description: "轮询策略 · 3 个渠道",
    badge: "内置",
    badgeVariant: "accent",
    mark: "D",
  },
  {
    value: "reasoning",
    label: "reasoning",
    description: "故障转移 · 6 个渠道",
    badge: "healthy",
    badgeVariant: "success",
    mark: "R",
  },
  {
    value: "archived",
    label: "归档分组",
    description: "当前不可选",
    badge: "disabled",
    mark: "A",
    disabled: true,
  },
];

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const previewToday = toLocalDateString(new Date());

const scheduleTasks = [
  {
    id: "ui-primitives",
    title: "完成 UI primitives 首轮实现",
    meta: "高优先级 · Chatroom / GroupChat",
    status: "今天",
    tone: "warning" as const,
  },
  {
    id: "visual-spec",
    title: "确认 Codex-like 视觉样张",
    meta: "设计基准 · 已完成",
    status: "done",
    completed: true,
    tone: "success" as const,
  },
  {
    id: "gateway-charts",
    title: "补齐 Gateway 图表组件",
    meta: "实时指标 · 排名 · 日志",
    status: "排期",
  },
];

const scheduleTimelineEntries = [
  {
    id: "spec",
    label: "创建设计 spec",
    description: "确定组件拆分边界和视觉基准",
    time: "09:40",
    active: true,
  },
  {
    id: "preview",
    label: "预览组件样张",
    description: "在组件库中校验真实组件效果",
    time: "14:20",
  },
  {
    id: "implementation",
    label: "计划实现任务",
    description: "拆成周日历、任务面板和时间线",
    time: "16:00",
  },
];

const SelectPreview = defineComponent({
  name: "CodexStyleSelectPreview",
  setup() {
    const provider = ref("baidu-oneapi");
    const groups = ref<Array<string | number>>(["default", "reasoning"]);

    return () =>
      h("div", { style: "display: grid; gap: 12px;" }, [
        h("div", { style: "display: grid; gap: 7px;" }, [
          h(
            "div",
            {
              style:
                "display: flex; justify-content: space-between; gap: 10px; color: var(--color-text-muted); font-size: 11px; font-weight: 560;",
            },
            [h("span", "当前供应商"), h("span", "真实 SlimeSelect · 单选")],
          ),
          h(SlimeSelect, {
            modelValue: provider.value,
            "onUpdate:modelValue": (value: string | number | Array<string | number> | null) => {
              if (!Array.isArray(value) && value != null) {
                provider.value = value;
              }
            },
            options: providerOptions,
            defaultOpen: true,
          }),
        ]),
        h("div", { style: "display: grid; gap: 7px;" }, [
          h(
            "div",
            {
              style:
                "display: flex; justify-content: space-between; gap: 10px; color: var(--color-text-muted); font-size: 11px; font-weight: 560;",
            },
            [h("span", "选择分组"), h("span", "真实 SlimeSelect · 多选")],
          ),
          h(SlimeSelect, {
            mode: "multiple",
            modelValue: groups.value,
            "onUpdate:modelValue": (value: string | number | Array<string | number> | null) => {
              groups.value = Array.isArray(value) ? value : [];
            },
            options: groupOptions,
          }),
          h(
            "div",
            { style: "color: var(--color-text-muted); font-size: 11px;" },
            "预览和业务页共享同一个 Vue 组件，只通过 props 改变内容。",
          ),
        ]),
      ]);
  },
});

const ResourceCardPreview = defineComponent({
  name: "CodexStyleResourceCardPreview",
  setup() {
    return () =>
      h(
        "div",
        {
          style:
            "display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 10px;",
        },
        [
          h(SlimeResourceCard, {
            kind: "group",
            selected: true,
            eyebrow: "分组路由",
            title: "default",
            subtitle: "轮询策略",
            badges: [
              { label: "内置", variant: "accent" },
              { label: "healthy", variant: "success" },
            ],
            stats: [
              { label: "成员", value: "3 个渠道" },
              { label: "权重", value: "5 / 3 / 2" },
              { label: "模型", value: "24" },
            ],
            detailValue: "百度OneApi, OfoxAI, Deepseek",
          }),
          h(SlimeResourceCard, {
            kind: "key",
            eyebrow: "API Key",
            title: "web-client",
            subtitle: "sk-live...0f91 · 永不过期",
            badges: [
              { label: "启用", variant: "success" },
              { label: "internal", variant: "neutral" },
            ],
            stats: [
              { label: "范围", value: "default" },
              { label: "用途", value: "Web App" },
              { label: "最近使用", value: "10 分钟前" },
            ],
            detailValue: "用于客户端访问 Gateway，本地加密保存",
          }),
        ],
      );
  },
});

const WeekCalendarPreview = defineComponent({
  name: "CodexStyleWeekCalendarPreview",
  setup() {
    const selectedDate = ref(previewToday);

    return () =>
      h(SlimeWeekCalendar, {
        selectedDate: selectedDate.value,
        "onUpdate:selectedDate": (date: string) => {
          selectedDate.value = date;
        },
        showHeader: false,
      });
  },
});

const TaskListPreview = defineComponent({
  name: "CodexStyleTaskListPreview",
  setup() {
    return () =>
      h(SlimeTaskList, {
        title: "任务面板",
        showCreate: true,
        tasks: scheduleTasks,
      });
  },
});

const TimelinePreview = defineComponent({
  name: "CodexStyleTimelinePreview",
  setup() {
    return () =>
      h(SlimeTimeline, {
        title: "时间线",
        entries: scheduleTimelineEntries,
      });
  },
});

const selectMount = document.getElementById("slime-select-preview");
if (selectMount) {
  createApp(SelectPreview).mount(selectMount);
}

const resourceCardMount = document.getElementById("slime-resource-card-preview");
if (resourceCardMount) {
  createApp(ResourceCardPreview).mount(resourceCardMount);
}

const weekCalendarMount = document.getElementById("slime-week-calendar-preview");
if (weekCalendarMount) {
  createApp(WeekCalendarPreview).mount(weekCalendarMount);
}

const taskListMount = document.getElementById("slime-task-list-preview");
if (taskListMount) {
  createApp(TaskListPreview).mount(taskListMount);
}

const timelineMount = document.getElementById("slime-timeline-preview");
if (timelineMount) {
  createApp(TimelinePreview).mount(timelineMount);
}
