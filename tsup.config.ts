/// <reference types="node" />

import { copyFile, cp, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'tsup'
import type { PackageJson } from 'type-fest'
import { fixExtensionsPlugin } from 'esbuild-fix-imports-plugin';
import { rmSync } from 'node:fs';

function replaceDistPath(packageObj: PackageJson): PackageJson {
    function toPlainObject(target: unknown): unknown {
        if (target === null || typeof target !== 'object') {
            if (typeof target === 'string' && target.startsWith('./dist/'))
                return target.replace('./dist/', './');

            return target;
        }

        if (Array.isArray(target)) {
            return (target as unknown[]).map(toPlainObject);
        }

        const plainObj: Record<string, unknown> = {};
        const keys = Object.getOwnPropertyNames(target as object);

        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(target as object, key);
            if (descriptor) {
                const value = descriptor.get ? (target as any)[key] : descriptor.value;
                plainObj[key] = toPlainObject(value);
            }
        }

        return plainObj;
    }

    return toPlainObject(packageObj) as PackageJson;
}

const onSuccess = async () => {
    try {
        const packageJsonString = await readFile('package.json', 'utf-8');
        let packageJson = JSON.parse(packageJsonString) as PackageJson;
        packageJson.main = './index.cjs';
        packageJson.module = './index.js';
        packageJson.types = './index.d.ts';

        packageJson = replaceDistPath(packageJson);

        await writeFile('dist/package.json', JSON.stringify(packageJson, null, 2), 'utf-8');
        await copyFile('README.md', 'dist/README.md');
    } catch (error) {
        console.error(error);
    }
}

rmSync('dist.tgz', { force: true, recursive: true });
rmSync('dist', { force: true, recursive: true });

export default defineConfig({
    bundle: false,
    entry: ['src/**/*.ts'],
    format: ['cjs', 'esm'],
    outDir: 'dist',
    tsconfig: 'tsconfig.json',
    splitting: false,
    cjsInterop: true,
    sourcemap: true,
    dts: true,
    keepNames: true,
    clean: process.env.NODE_ENV !== 'development',
    watch: process.env.NODE_ENV === 'development',
    shims: true,
    esbuildPlugins: [fixExtensionsPlugin()],
    onSuccess
})
