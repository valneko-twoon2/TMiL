#!/usr/bin/env node
// scripts/ 自身のテスト（node:test）を回す。
//   node scripts/test/tools.mjs
import { run } from '../lib/proc.mjs';
import { toolTestArgs } from '../lib/tools.mjs';

process.exit(run(process.execPath, toolTestArgs()).status);
