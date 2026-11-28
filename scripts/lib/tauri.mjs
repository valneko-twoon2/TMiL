// Tauri の CLI に渡す環境変数。
// CLI は実行した場所の下から tauri.conf.json を探すが、フロントとバックを src/ の下に分けているので見つからない。
// 設定（src/backend/app）とフロント（src/frontend）の場所を環境変数で教える。
import { join } from 'node:path';
import { BACKEND, FRONTEND } from './proc.mjs';

/** @returns {{ TAURI_APP_PATH: string, TAURI_FRONTEND_PATH: string }} */
export function tauriEnv() {
  return { TAURI_APP_PATH: join(BACKEND, 'app'), TAURI_FRONTEND_PATH: FRONTEND };
}
