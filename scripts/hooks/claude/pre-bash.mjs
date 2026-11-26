#!/usr/bin/env node
// PreToolUse(Bash|PowerShell): フックの回避や main への直接操作を止める。
import { checkCommand } from '../../lib/command-guard.mjs';
import { block, readHookInput } from './read-input.mjs';

const input = readHookInput();
const reason = checkCommand(String(input.tool_input?.command ?? ''));
if (reason) block(reason);
