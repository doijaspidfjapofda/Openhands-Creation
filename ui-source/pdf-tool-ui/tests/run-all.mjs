/* 依次运行本机逻辑测试；加 --with-e2e 时再运行真实浏览器测试 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const suites = ['merge.test.mjs', 'split.test.mjs', 'organize.test.mjs', 'convert.test.mjs', 'desktop.test.mjs', 'privacy.test.mjs'];
if (process.argv.includes('--with-e2e')) suites.push('e2e.test.mjs');

let failed = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(here, suite)], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}

if (failed) {
  console.error(`\n有 ${failed} 个测试文件未通过。`);
  process.exit(1);
}
console.log('\n全部测试通过。');
