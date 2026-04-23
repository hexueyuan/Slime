# TASK-011: 文件操作安全层设计

## 目标

为 FilePresenter 和 exec 工具添加安全约束，确保 Agent 只能在 Slime 代码库范围内操作，且不能修改受保护路径。

## 背景

- FilePresenter 已实现 read/write/edit，有 `resolveSafe` 防路径穿越
- ToolPresenter 的 exec 工具无任何限制，可执行任意命令、访问任意路径
- 不需要新增工具（delete/list/exists 等由 exec 覆盖）
- 不需要备份机制（git 已提供版本管理）

## 设计

### 1. FilePresenter 禁止写入路径

在 `write` 和 `edit` 中，`resolveSafe` 之后增加 `validateWritable` 检查。`read` 不限制。

```typescript
const FORBIDDEN_WRITE_PATTERNS = [
  /^\.git(\/|$)/, // Git 仓库数据
  /^node_modules(\/|$)/, // 依赖目录
  /^dist(\/|$)/, // 构建产物
  /^\.slime(\/|$)/, // 内部状态目录
  /\.secret\./, // 敏感文件
  /\.key$/, // 密钥文件
];
```

- `validateWritable(userPath)`: 将用户路径 normalize（`\` → `/`），逐一匹配 FORBIDDEN_WRITE_PATTERNS，命中则抛 `Error("Cannot modify protected path: ...")`
- 在 `write()` 和 `edit()` 的 `resolveSafe` 调用之后、实际 IO 之前调用

### 2. exec 命令黑名单

在 exec 工具的 execute 函数开头，检查命令是否匹配危险模式：

```typescript
const EXEC_BLOCKED_PATTERNS = [
  /(?:^|\s)\//, // 绝对路径（阻止访问项目外）
  /rm\s+(-[^\s]*\s+)*\.git/, // 删除 .git
  /rm\s+(-[^\s]*\s+)*node_modules/, // 删除 node_modules
  /curl\s.*\|\s*(?:sh|bash)/, // 下载执行
  /wget\b/, // 网络下载
];
```

匹配任一模式则抛错，不执行命令。

### 3. 测试

- `test/main/filePresenter.test.ts`: 补充用例
  - write/edit 禁止路径被拒绝（.git/config, node_modules/foo, dist/index.js 等）
  - write/edit 正常路径仍可写入
  - read 不受禁止路径限制
- `test/main/toolPresenter.test.ts`: 新增 exec 安全测试
  - 绝对路径命令被拦截
  - rm .git 被拦截
  - curl|sh 被拦截
  - 正常命令（pnpm run typecheck, ls, git status 等）不被拦截

## 改动范围

| 文件                                  | 改动                                           |
| ------------------------------------- | ---------------------------------------------- |
| `src/main/presenter/filePresenter.ts` | 加 FORBIDDEN_WRITE_PATTERNS + validateWritable |
| `src/main/presenter/toolPresenter.ts` | exec execute 加 EXEC_BLOCKED_PATTERNS 检查     |
| `test/main/filePresenter.test.ts`     | 补充禁止路径测试                               |
| `test/main/toolPresenter.test.ts`     | 新增 exec 黑名单测试                           |

## 不做

- 不新增工具（delete/list/exists/compile_check）
- 不新建服务层
- 不加备份机制
- 不改 file.presenter.d.ts 接口
