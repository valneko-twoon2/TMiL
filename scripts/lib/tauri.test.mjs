import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { BACKEND, FRONTEND } from './proc.mjs';
import { tauriEnv } from './tauri.mjs';

describe('tauriEnv', () => {
  describe('equivalence', () => {
    it('設定はバックの app、フロントは src/frontend を指す', () => {
      assert.deepEqual(tauriEnv(), {
        TAURI_APP_PATH: join(BACKEND, 'app'),
        TAURI_FRONTEND_PATH: FRONTEND,
      });
    });

    it('指す場所に設定ファイルと package.json がある', () => {
      assert.ok(existsSync(join(tauriEnv().TAURI_APP_PATH, 'tauri.conf.json')));
      assert.ok(existsSync(join(tauriEnv().TAURI_FRONTEND_PATH, 'package.json')));
    });
  });
});
