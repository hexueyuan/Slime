# 贡献指南

## 开发环境

- Node.js >= 20.19.0
- pnpm >= 10.11.0

## 开始开发

```bash
pnpm install
pnpm run dev
```

## 代码规范

- 使用 TypeScript 严格模式
- 使用 oxfmt 格式化代码（单引号、无分号、行宽 100）
- 使用 oxlint 检查代码质量
- 提交前会自动运行 lint-staged

## 提交规范

使用 Conventional Commits 格式：

```
type(scope): subject
```

类型：feat | fix | docs | style | refactor | perf | test | chore

## 测试

- 所有新功能必须包含测试
- 运行测试：`pnpm test`
- 覆盖率要求：>= 80%

## PR 规范

- 清晰的描述
- 关联 Issue（Closes #123）
- 通过 lint、typecheck、test
