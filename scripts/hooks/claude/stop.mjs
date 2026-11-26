#!/usr/bin/env node
// Stop: 未コミット・未 push の変更が残っていたら止めて、コミットと push を促す。
// 2 回目（stop_hook_active）は無限ループを避けるため警告だけにする。
import { currentBranch, isDirty, unpushedCount } from '../../lib/git.mjs';
import { block, readHookInput } from './read-input.mjs';

const input = readHookInput();
const messages = [];

if (isDirty()) {
  messages.push('未コミットの変更があります。規約どおりのメッセージでコミットしてください（例: feat: 〜を追加）。');
}
const unpushed = unpushedCount();
if (unpushed !== null && unpushed > 0 && currentBranch() === 'develop') {
  messages.push(`develop に未 push のコミットが ${String(unpushed)} 件あります。push してください。`);
}

if (messages.length === 0) process.exit(0);

if (input.stop_hook_active) {
  process.stdout.write(JSON.stringify({ systemMessage: `注意: ${messages.join(' ')}` }));
  process.exit(0);
}
block(messages.join('\n'));
