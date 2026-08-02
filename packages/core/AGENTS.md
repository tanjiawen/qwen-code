# packages/core — Agent 引擎（@qwen-code/qwen-code-core）

本文件是**模块级补充**。通用规则（简洁优先、maintainer-only 核心门禁、Better
Harness 强制门禁、提交规范）见根目录 `AGENTS.md`，这里只写本模块特有的东西。

## 这是什么

CLI 的引擎层：模型调用、工具执行、权限、MCP、记忆、子代理、遥测都在这里。
`packages/cli` 是它上面那层（终端 UI + 命令）。改这里通常意味着改「agent 怎么
思考和动手」，影响面是整个产品。

## 高风险路径（动之前先看根 AGENTS.md 的 two-tier 门禁）

- `src/auth/`、`src/providers/`、`src/models/` — 核心基础设施，外部改动须 100%
  确信或升级 maintainer。
- `src/config/`、`src/tools/`、`src/services/`、`src/permissions/` — 核心模块，
  跨包改动要评估全部下游消费者。
- `src/index.ts` — 公共 API 出口。改这里就是改包的对外契约，`packages/cli`
  直接依赖，务必同步检查调用方。

## 验证（在本包目录内跑，别在仓库根目录）

```bash
cd packages/core
npx vitest run src/path/to/file.test.ts   # 单测（首选，别跑全量）
npm run typecheck                          # tsc --noEmit
npm run lint                               # eslint
```

改了行为就要有对应的 collocated 测试（`file.test.ts` 紧挨 `file.ts`）。

## 本模块特有的坑

- **ESM-only**：`import`-only 导出。别用 `require.resolve` 探内部包路径，会抛
  `ERR_PACKAGE_PATH_NOT_EXPORTED`，看着像缺模块、其实是用法错。
- **文件名**：`.ts` 用 `kebab-case.ts`（ESLint 强制；存量 camelCase 在
  allowlist 里，碰到时顺手改并同提交更新所有 import）。
- **禁止 `any`**、包之间禁止相对 import、类型用 `import type`。
- 测试 mock 注意模块加载时机（CLI 侧用 `vi.hoisted()`，本包同理：`vi.mock()`
  工厂在模块加载期执行，早于测试体）。

## 下一步路由

- 改的是「引擎能力」（工具/模型/权限/MCP）→ 大概率也要看 `packages/cli` 怎么消费。
- 涉及架构主干的大重构（500+ 行）→ 必须 maintainer 发起（根 AGENTS.md 硬规则）。
- 里程碑/PR 前 → 跑 `/better-harness` 全审计。
