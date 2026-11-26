// Claude Code のフックが stdin で渡す JSON を読む。
import { readFileSync } from 'node:fs';

/** @returns {Record<string, any>} */
export function readHookInput() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** フックをブロックして理由を Claude に返す（exit 2）。 */
export function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
