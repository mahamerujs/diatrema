import { execSync } from 'node:child_process'
import { renameSync, rmSync } from 'node:fs'
import packageJson from '../package.json' with { type: 'json' };
import { join } from 'node:path';

const { name, version } = packageJson;

rmSync('dist.tgz', { force: true, recursive: true });
execSync('npm pack', { cwd: 'dist' })
renameSync(join(process.cwd(), 'dist', `${name.replace('@', '').replaceAll('/', '-')}-${version}.tgz`), join(process.cwd(), 'dist.tgz'))
rmSync('dist/scripts/post-build.js', { force: true, recursive: true });
rmSync('dist/.tsbuildinfo', { force: true, recursive: true });
