# packages/cli — 命令行 + 终端 UI（@qwen-code/qwen-code）

本文件是**模块级补充**。通用规则（简洁优先、maintainer-only 核心门禁、Better
Harness 强制门禁、提交规范）见根目录 `AGENTS.md`，这里只写本模块特有的东西。

## 这是什么

用户实际跑的那个 `qwen` 命令：命令行解析、交互式 TUI（React + Ink）、非交互
模式、ACP/远程输入、serve 守护、i18n、导出。引擎逻辑在 `packages/core`，本包
负责「怎么呈现给人、怎么接收输入」。

## 高风险 / 重点路径

- `src/config/`、`src/services/` — 核心模块，改动评估下游消费者（根 AGENTS.md
  two-tier 门禁）。
- `src/nonInteractiveCli.ts`、`src/validateNonInterActiveAuth.ts`、`src/serve/`、
  `src/acp-integration/` — 非交互 / 守护 / 集成入口，headless 与 CI 都走这里，
  改坏会让自动化静默失败。
- `src/ui/` — 体量最大的子树（React 组件 + hooks + contexts）。UI 改动优先复用
  现有组件与 hooks，别另起一套。

## 验证（在本包目录内跑）

```bash
cd packages/cli
npx vitest run src/path/to/file.test.ts   # 单测（首选）
npx vitest run src/path/to/file.test.ts --update   # 更新快照
npm run typecheck                          # tsc --noEmit
npm run lint                               # eslint
npm run check-i18n                         # 改了文案/i18n 时跑
```

UI 行为改动建议用 `npm run dev`（tsx 直跑源码）目视确认；终端宽度相关的布局要
在宽 / 窄两种终端各看一遍。

## 本模块特有的坑

- **CLI 测试 mock**：`vi.mock()` 工厂在模块加载期执行，早于测试体——给它消费的
  mock 必须用 `vi.hoisted()` 声明。
- **快照测试**：UI 输出变了要 `--update` 更新快照，别手动改快照文件。
- **文件名**：React 组件 `PascalCase.tsx`，普通 `.ts` 用 `kebab-case.ts`。
- **i18n**：用户可见文案走 i18n，改完跑 `check-i18n`。
- 禁止 `any`、包之间禁止相对 import、类型用 `import type`。

## 下一步路由

- 改的是「引擎能力」而非呈现 → 去 `packages/core`（含其模块级 AGENTS.md）。
- 改 UI 组件 → 先看 `src/ui/components` 与 `src/ui/hooks` 有没有现成的可复用。
- 里程碑/PR 前 → 跑 `/better-harness` 全审计。
