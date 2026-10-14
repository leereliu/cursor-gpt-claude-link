import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const tests = readdirSync(new URL('../test/', import.meta.url))
  .filter(name => name.endsWith('.test.mjs')).map(name => 'test/' + name);
for (const [command, args] of [
  [process.execPath, ['--test', ...tests]],
  ['python3', ['-m', 'unittest', 'discover', '-s', 'test', '-p', 'test_macos*.py', '-v']]
]) {
  const result = spawnSync(command, args, {cwd:root, stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
