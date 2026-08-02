/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  buildBetterHarnessPanel,
  type BetterHarnessPanel,
} from '../utils/progress-insights.js';

/**
 * 审计结果是低频数据（一次里程碑审计才更新一次），无需占用 ProgressPanel
 * 的 1s tick；5s 轮询足以在审计渲染完成后及时刷新。
 */
export const BETTER_HARNESS_POLL_INTERVAL_MS = 5_000;

const HARNESS_DIR = path.join('.qwen', 'better-harness');
const FINDINGS_FILE = 'findings.json';

/**
 * 在 `<cwd>/.qwen/better-harness/` 的各 run 目录中定位 mtime 最新的
 * findings.json；目录不存在或无产物时返回 undefined。
 */
async function findLatestFindingsPath(
  cwd: string,
): Promise<string | undefined> {
  const root = path.join(cwd, HARNESS_DIR);
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return undefined;
  }

  let bestPath: string | undefined;
  let bestMtime = -1;
  for (const entry of entries) {
    const candidate = path.join(root, entry, FINDINGS_FILE);
    try {
      const info = await stat(candidate);
      if (info.isFile() && info.mtimeMs > bestMtime) {
        bestMtime = info.mtimeMs;
        bestPath = candidate;
      }
    } catch {
      // 该 run 目录尚无 findings.json，跳过。
    }
  }
  return bestPath;
}

/**
 * 读取最近一次 /better-harness 审计渲染出的 findings.json，解析为
 * ProgressPanel 第三列所需的面板数据。挂载时读一次，之后每 5s 轮询；
 * 未审计或解析失败时返回 undefined（由组件显示「未审计」占位）。
 */
export function useBetterHarnessPanel(
  cwd: string,
): BetterHarnessPanel | undefined {
  const [panel, setPanel] = useState<BetterHarnessPanel | undefined>(undefined);
  const panelRef = useRef(panel);
  panelRef.current = panel;

  useEffect(() => {
    let cancelled = false;
    let refreshGeneration = 0;

    const refresh = async () => {
      const generation = ++refreshGeneration;
      const findingsPath = await findLatestFindingsPath(cwd);
      if (!findingsPath) {
        if (
          !cancelled &&
          generation === refreshGeneration &&
          panelRef.current
        ) {
          setPanel(undefined);
        }
        return;
      }
      let next: BetterHarnessPanel | null = null;
      try {
        next = buildBetterHarnessPanel(await readFile(findingsPath, 'utf8'));
      } catch {
        next = null;
      }
      if (cancelled || generation !== refreshGeneration) return;
      if (next === null) {
        if (panelRef.current) setPanel(undefined);
        return;
      }
      // 仅当审计产物变化（维度分数或 findings 数）时更新，避免无谓重渲染。
      const prev = panelRef.current;
      const changed =
        !prev ||
        prev.findingsTotal !== next.findingsTotal ||
        prev.dimensions.length !== next.dimensions.length ||
        prev.dimensions.some(
          (dimension, index) =>
            dimension.id !== next!.dimensions[index]?.id ||
            dimension.score !== next!.dimensions[index]?.score,
        );
      if (changed) setPanel(next);
    };

    void refresh().catch(() => {});
    const pollTimer = setInterval(() => {
      void refresh().catch(() => {});
    }, BETTER_HARNESS_POLL_INTERVAL_MS);
    pollTimer.unref?.();

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [cwd]);

  return panel;
}
