# 测试指南

## 测试框架

- **Vitest**: 单元测试和集成测试
- **Vue Test Utils**: Vue 组件测试
- **jsdom**: DOM 环境模拟

## 测试目录

```
test/
├── setup.ts           # 全局测试配置和 mock
├── mocks/
│   └── electron.ts    # Electron API mock
├── main/              # 主进程测试
│   └── main.test.ts
└── renderer/          # 渲染进程测试
    └── App.test.ts
```

## 运行测试

```bash
# 运行所有测试
pnpm test

# 运行并查看覆盖率
pnpm run test:coverage

# 监听模式
pnpm run test:watch
```

## 编写测试

- 测试文件命名：`*.test.ts` 或 `*.spec.ts`
- 主进程测试放在 `test/main/`
- 渲染进程测试放在 `test/renderer/`
- Electron API 已在 `test/setup.ts` 中 mock
- 渲染进程测试使用 jsdom 环境

## 覆盖率要求

- Lines: >= 80%
- Functions: >= 80%
- Branches: >= 80%
- Statements: >= 80%
