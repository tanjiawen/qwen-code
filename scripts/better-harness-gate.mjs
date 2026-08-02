/**
 * Better Harness pre-commit gate (Layer 1 of the mandatory gate).
 *
 * Runs the Better Harness blast-radius analysis over the pending commit and
 * hard-blocks (exit 1) when the change is critical-severity, removes
 * security-sensitive code, or touches a high/critical-risk core area.
 *
 * Fail-open: if Better Harness is not installed or the analysis throws, the
 * commit proceeds with a warning — this gate must never wedge the developer.
 * Bypass deliberately with `git commit --no-verify` (same as the lint gate).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BH = process.env.BETTER_HARNESS_DIR || path.join(os.homedir(), 'better-harness');
const BLAST = path.join(BH, 'hooks/git-scripts/blast-radius.mjs');

if (!existsSync(BLAST)) {
  console.warn(
    `[better-harness] skip: ${BLAST} not found (set BETTER_HARNESS_DIR to override).`,
  );
  process.exit(0);
}

const { analyzeRepository, formatReviewMessage } = await import(
  pathToFileURL(BLAST).href
);

let report;
try {
  report = await analyzeRepository(process.cwd(), {});
} catch (error) {
  console.warn(`[better-harness] analysis failed, allowing commit: ${error.message}`);
  process.exit(0);
}

const criticalCoreHits = (report.coreHits ?? []).filter((hit) =>
  ['critical', 'high'].includes(hit.risk),
);
const blockers = [];
if (report.severity === 'critical') {
  blockers.push(`影响半径 severity=critical（score ${report.score}）`);
}
if ((report.securityRemovals ?? []).length > 0) {
  blockers.push(`${report.securityRemovals.length} 处安全相关代码被移除`);
}
for (const hit of criticalCoreHits) {
  blockers.push(`改动核心模块 ${hit.rule}（risk=${hit.risk}）→ ${hit.target}`);
}

if (blockers.length > 0) {
  console.error('\n[better-harness] ══ 提交被 Better Harness 门禁阻断 ══');
  for (const reason of blockers) {
    console.error(`  - ${reason}`);
  }
  console.error('');
  console.error(formatReviewMessage(report));
  console.error('\n如确属误报：调整 .better-harness/blast-radius.json 阈值，或 git commit --no-verify 绕过。');
  console.error('里程碑/PR 前请运行完整审计：/better-harness\n');
  process.exit(1);
}

if (report.severity === 'high') {
  console.warn(
    `[better-harness] 警告：影响半径 severity=high（score ${report.score}），建议运行 /better-harness 审计。`,
  );
}

process.exit(0);
