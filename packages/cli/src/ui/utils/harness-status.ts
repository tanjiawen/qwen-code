/**
 * 解析 Better Harness 运行时状态文件（.qwen/harness-status.jsonl）为面板数据。
 *
 * 状态文件每行一个 JSON：gate 触发或 skill 调用事件。纯函数、无 I/O，
 * 便于单元测试；解析失败的行跳过（fail-open），不抛错。
 */

export interface HarnessEvent {
  /** 事件时间戳（epoch ms）。 */
  ts: number;
  /** 事件类型：gate 触发或 skill 调用。 */
  type: 'gate' | 'skill';
  /** 来源：stop-hook / pre-commit / audit / skill 名。 */
  source: string;
  /** gate 结果：pass / block / warn。 */
  result?: 'pass' | 'block' | 'warn';
  /** skill 名（type === 'skill' 时）。 */
  name?: string;
  /** skill 状态（type === 'skill' 时）。 */
  status?: string;
  /** 人类可读说明。 */
  detail?: string;
}

export interface HarnessStatus {
  /** 最近的 gate 记录，最新在前。 */
  gates: HarnessEvent[];
  /** 最近的 skill 记录，最新在前。 */
  skills: HarnessEvent[];
  /** 全部事件中 ts 最大的一条，无则 null。 */
  latest: HarnessEvent | null;
}

/**
 * 解析 harness-status.jsonl 文本。损坏行跳过；事件按 ts 降序（最新在前），
 * 各自截断到 limit 条。
 */
export function buildHarnessStatus(
  jsonlText: string,
  limit = 5,
): HarnessStatus {
  const events: HarnessEvent[] = [];
  for (const line of jsonlText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as HarnessEvent).ts === 'number'
      ) {
        events.push(parsed as HarnessEvent);
      }
    } catch {
      // 损坏行跳过（fail-open）。
    }
  }

  events.sort((a, b) => b.ts - a.ts);
  return {
    gates: events.filter((event) => event.type === 'gate').slice(0, limit),
    skills: events.filter((event) => event.type === 'skill').slice(0, limit),
    latest: events[0] ?? null,
  };
}
