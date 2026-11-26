#!/usr/bin/env node
// GitHub Actions の「VRT 基準画像の更新」で作った基準画像を取り込む（gh CLI が必要）。
//   node scripts/test/vrt-pull.mjs            今のブランチの最新の成功した実行から
//   node scripts/test/vrt-pull.mjs <run-id>   指定した実行から
// 取り込んだら差分を確かめて `test: VRT の基準画像を更新` でコミットする。
import { join } from 'node:path';
import { currentBranch } from '../lib/git.mjs';
import { capture, ROOT, run } from '../lib/proc.mjs';

const WORKFLOW = 'vrt-update.yml';
const ARTIFACT = 'vrt-baselines';

let runId = process.argv[2];
if (!runId) {
  const branch = currentBranch();
  runId = capture('gh', [
    'run',
    'list',
    '--workflow',
    WORKFLOW,
    '--branch',
    branch,
    '--status',
    'success',
    '--limit',
    '1',
    '--json',
    'databaseId',
    '--jq',
    '.[0].databaseId',
  ]).trim();
  if (!runId) {
    console.error(
      `${branch} で成功した「VRT 基準画像の更新」が見つかりません。先に Actions で実行してください。`,
    );
    process.exit(1);
  }
}

const status = run('gh', [
  'run',
  'download',
  runId,
  '--name',
  ARTIFACT,
  '--dir',
  join(ROOT, 'tests', 'vrt'),
]).status;
if (status === 0) console.log('基準画像を取り込みました。git diff で確かめてからコミットしてください。');
process.exit(status);
