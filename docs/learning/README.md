# 千问 Code 源码深度学习指南

> 面向阿里 Agent 研发中心新工程师的 21 天系统化学习路径

## 🗺️ 学习路线图

```
Week 1: 架构总览          Week 2: 深入子系统          Week 3: 实战贡献
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Day 1  环境搭建  │     │ Day 8  工具注册  │     │ Day 15 UI渲染   │
│ Day 2  Monorepo │     │ Day 9  权限模型  │     │ Day 16 Hooks    │
│ Day 3  启动流程  │     │ Day 10 上下文   │     │ Day 17 测试     │
│ Day 4  配置系统  │     │ Day 11 Memory   │     │ Day 18 调试     │
│ Day 5  Agent循环 │     │ Day 12 MCP      │     │ Day 19 贡献流程  │
│ Day 6  LLM适配  │     │ Day 13 子Agent  │     │ Day 20 CI/CD    │
│ Day 7  周总结   │     │ Day 14 周总结   │     │ Day 21 毕业项目  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 📋 前置要求

- 熟悉 TypeScript（ESM modules、AsyncGenerator、泛型）
- 了解 React 基础（组件、hooks）— UI 层使用 Ink（终端 React 渲染器）
- 了解 LLM API 基本概念（prompt、completion、streaming、function calling）
- Node.js >= 22 环境

## 🚀 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/QwenLM/qwen-code.git
cd qwen-code

# 2. 安装依赖（会自动触发构建）
npm install

# 3. 运行测试确认环境正常
npm run test

# 4. 从源码启动
npm start
```

## 📂 目录结构

```
docs/learning/
├── README.md                    ← 你在这里
├── week1-architecture/          ← 第1周：架构总览
├── week2-subsystems/            ← 第2周：深入子系统
├── week3-practice/              ← 第3周：实战贡献
└── artifacts/                   ← 交互式可视化（浏览器打开）
```

## 🎓 学习方法建议

1. **先读后写** — 每天先通读文档，再打开源码对照阅读
2. **断点调试** — 用 `npm run debug` 启动，在关键位置设断点
3. **画图验证** — 尝试自己画出调用链，与文档中的架构图对比
4. **完成练习** — 每天的动手练习是检验理解的最佳方式
5. **写笔记** — 用自己的话记录每个模块的核心设计思想

## 🔗 相关资源

| 资源              | 路径                              |
| ----------------- | --------------------------------- |
| 开发者文档        | `docs/developers/`                |
| 设计文档（189篇） | `docs/design/`                    |
| 贡献指南          | `CONTRIBUTING.md`                 |
| 架构概览          | `docs/developers/architecture.md` |
| 用户文档          | `docs/users/`                     |

## 📐 项目技术栈速览

| 层面    | 技术                              |
| ------- | --------------------------------- |
| 语言    | TypeScript (ESM)                  |
| 运行时  | Node.js >= 22                     |
| 终端 UI | React 19 + Ink 7                  |
| 构建    | esbuild                           |
| 测试    | Vitest                            |
| Lint    | ESLint 9 + Prettier               |
| LLM SDK | OpenAI / Anthropic / Google GenAI |
| 协议    | MCP (Model Context Protocol)      |
| 包管理  | npm workspaces (monorepo)         |
