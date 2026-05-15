# LLM Prompt Caching 笔记

## 一、基本概念

Prompt caching 允许将重复使用的 prompt 片段缓存起来，后续请求直接读取缓存，避免重复计算，从而**降低延迟和费用**。

---

## 二、Anthropic 使用方式

### 开启缓存

请求头中需要加入 Beta 标识：

```
anthropic-beta: prompt-caching-2024-07-31
```

### 标记缓存断点

在需要缓存的内容块末尾加上 `cache_control`：

```json
{
  "type": "text",
  "text": "这里是很长的 system prompt...",
  "cache_control": { "type": "ephemeral" }
}
```

### 完整请求示例

```bash
curl https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: prompt-caching-2024-07-31" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 256,
    "system": [
      {
        "type": "text",
        "text": "你是一个专业的视频脚本创作助手...(2000+ token 的 system prompt)",
        "cache_control": { "type": "ephemeral" }
      }
    ],
    "messages": [
      { "role": "user", "content": "帮我写一个30秒的产品宣传视频脚本，产品是一款智能手表" }
    ]
  }'
```

---

## 三、响应中的 usage 字段

| 字段                          | 含义                                        |
| ----------------------------- | ------------------------------------------- |
| `input_tokens`                | 本次请求实际计费的输入 token 数             |
| `cache_creation_input_tokens` | 本次**写入**缓存的 token 数（首次，较贵）   |
| `cache_read_input_tokens`     | 本次**命中**缓存的 token 数（后续，较便宜） |

### 示例对比

**第一次请求（写入缓存）：**

```json
{
  "input_tokens": 2150,
  "output_tokens": 180,
  "cache_creation_input_tokens": 2048,
  "cache_read_input_tokens": 0
}
```

**第二次请求（命中缓存，只改了 user message）：**

```json
{
  "input_tokens": 120,
  "output_tokens": 195,
  "cache_creation_input_tokens": 0,
  "cache_read_input_tokens": 2048
}
```

> `input_tokens` 从 2150 骤降至 120，仅计算新 user message 部分，缓存命中的 token 费率更低。

---

## 四、缓存失效规则

### 失效传播方向：**从前往后**

> tools 变了 → system 和 messages 缓存全部失效  
> system 变了 → messages 缓存失效，tools 缓存不受影响  
> messages 层变化 → 只影响自身，tools 和 system 缓存不受影响

### 官方失效表

| 变化原因             | tools 缓存 | system 缓存 | messages 缓存 | 说明                                     |
| -------------------- | ---------- | ----------- | ------------- | ---------------------------------------- |
| 工具定义变更         | ✗          | ✗           | ✗             | 改名称/描述/参数，三段全失效             |
| 网页搜索/引用切换    | ✓          | ✗           | ✗             | 启用/禁用会修改 system prompt            |
| 速度设置（speed）    | ✓          | ✗           | ✗             | 切换 `fast` 会使 system 和 messages 失效 |
| tool_choice          | ✓          | ✓           | ✓             | 只影响元数据，三段均不失效               |
| 图片变更             | ✓          | ✓           | ✗             | 只影响 messages 层                       |
| 思考参数（thinking） | ✓          | ✓           | ✗             | 启用/禁用/改预算只影响 messages          |

---

## 五、断点策略

基于失效从前往后传播的规律，推荐在 **tools 末尾** 和 **system 末尾** 各打一个 `cache_control` 断点：

```
[ tools 块 ] <-- cache_control
[ system 块 ] <-- cache_control
[ messages 块 ]
```

这样即使 system prompt 因功能开关变化而失效，tools 层的缓存仍然有效，实现**分层保护**，而非"全有或全无"。

---

## 六、Prompt 组织顺序

```
tools → system → messages
```

- **tools**：最稳定，几乎不变，放最前
- **system**：偶尔调整，放中间
- **messages**：每次都不同，放最后

越稳定的内容越靠前，缓存命中率最大化。

---

## 七、硬性限制

| 限制项          | 说明                                                                 |
| --------------- | -------------------------------------------------------------------- |
| 最多断点数      | **4 个**（automatic caching 也占一个槽位，实际可手动控制约 3 个）    |
| 最小缓存长度    | Sonnet：**1,024 tokens**；Opus / Haiku：**4,096 tokens**             |
| Lookback Window | **20-block**，多轮对话中若新消息将断点推出窗口，该缓存条目将无法命中 |
| TTL（默认）     | **5 分钟**，每次命中刷新计时                                         |
| TTL（可选）     | **1 小时**，但缓存写入价格**翻倍**                                   |
