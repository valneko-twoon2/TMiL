#!/usr/bin/env node
// SessionStart: git フックが有効になっているか確認し、無ければ入れる。
import { capture, ROOT, run } from '../../lib/proc.mjs';

if (capture('git', ['config', '--get', 'core.hooksPath']).trim() !== '.githooks') {
  run(process.execPath, [`${ROOT}/scripts/setup/install-hooks.mjs`], { quiet: true });
}
