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
  timeoutMs = 5000,
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

export function buildFallbackSummary(snapshot: SessionSnapshot): string {
  const { task, files, metrics } = snapshot;
  const parts: string[] = [];

  if (metrics.turnCount > 0) {
    const prompt = task.lastUserPrompt
      ? `「${task.lastUserPrompt.slice(0, 40)}」`
      : '';
    parts.push(
      `会话进行了 ${metrics.turnCount} 轮交互${prompt ? `，最后指令为${prompt}` : ''}`,
    );
  } else {
    parts.push('会话未进行实质交互即退出');
  }

  if (files.modified.length > 0) {
    parts.push(`修改了 ${files.modified.length} 个文件`);
  }

  const pending = task.todos.filter((t) => t.status !== 'completed');
  if (pending.length > 0) {
    parts.push(`${pending.length} 项待办未完成`);
  }

  return parts.join('，') + '。';
}
