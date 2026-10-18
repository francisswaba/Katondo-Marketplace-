import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDirectory = path.dirname(fileURLToPath(import.meta.url));
const expoCli = path.resolve(mobileDirectory, '../../../node_modules/expo/bin/cli');
const result = spawnSync(process.execPath, [expoCli, 'export', '--platform', 'ios', '--platform', 'android', '--output-dir', '.expo-export'], {
  cwd: path.resolve(mobileDirectory, '..'),
  env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
  stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
