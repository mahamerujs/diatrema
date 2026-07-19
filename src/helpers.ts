import { access, constants } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const exists = async (target: string): Promise<boolean> => {
    try {
        await access(target, constants.R_OK);
        return true;
    } catch {
        return false;
    }
};

/**
 * Checks if the target path is within the base path.
 * @param base The base directory (absolute path)
 * @param target The target path (absolute path) to check
 * @returns true if target is within base, false otherwise
 */
function isWithin(base: string, target: string): boolean {
    if (target === base)
        return true;

    if (target.startsWith(base)) {
        const nextChar = target.charAt(base.length);

        return nextChar === sep;
    }

    return false;
}

/**
 * Resolves a target path relative to a base directory, ensuring the result is within the base.
 * Returns null if the resolved path would be outside the base.
 * @param base The base directory (absolute path)
 * @param target The target path (relative to base) to resolve
 * @returns The resolved absolute path if within base, null otherwise
 */
export function resolveWithinBase(base: string, target: string): string | null {
    const baseResolved = resolve(base);
    const targetResolved = resolve(base, target);

    if (isWithin(baseResolved, targetResolved))
        return targetResolved;

    return null;
}

/**
 * 
 * @param type "commonjs" | "esm"
 * @param filePath string - path to resolved file: require.resolve("./path/to/file")
 */
export async function dynamicRequire<T extends Record<string, unknown> = Record<string, unknown>>(type: "commonjs" | "esm", resolvedFilePath: string, noCache: boolean = false): Promise<T | undefined> {
    if (!(await exists(resolvedFilePath)))
        return;

    if (type === "commonjs") {
        if (noCache) {
            delete require.cache[resolvedFilePath];
        }

        return require(resolvedFilePath) as T;
    }

    let fileUrl = pathToFileURL(resolvedFilePath).href;

    if (noCache)
        fileUrl += `?update=${Date.now()}`;

    return (await import(fileUrl)) as T;
}
