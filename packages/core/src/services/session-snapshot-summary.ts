/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionSnapshot } from './session-snapshot.js';

export interface SummaryGenerator {
  generate(prompt: string): Promise<string>;
}

const SUMMARY_PROMPT_TEMPLATE = `你是一个会话摘要生成器。根据以下 JSON 格式的会话结构化数据，用 2-3 句中文概括：
1. 这个会话在做什么
2. 进展到哪一步
3. 还剩什么没完成

只输出摘要文本，不要加标题或前缀。

会话数据：
`;

export async function generateSnapshotSummary(
  snapshot: SessionSnapshot,
  generator: SummaryGenerator,
  timeoutMs = 3000,
): Promise<string | null> {
  const input = {
    git: snapshot.git,
    task: snapshot.task,
    files: snapshot.files,
    metrics: snapshot.metrics,
  };

  const prompt = SUMMARY_PROMPT_TEMPLATE + JSON.stringify(input, null, 2);

  try {
    const result = await Promise.race([
      generator.generate(prompt),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), timeoutMs),
      ),
    ]);
    if (result === null) return null;
    const trimmed = result.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 500) : null;
  } catch {
    return null;
  }
}
