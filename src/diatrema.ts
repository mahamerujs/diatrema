import { join } from 'node:path';

import { EventEmitter } from "./event-emitter";
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { InitiatorHandler, Instances } from './types';
import type { MahameruPlugin } from './mahameru-plugin';
import { createLogger, type Logger } from './logger';

export type DiatremaEvents = {
    ready: [data: { mode: "development" | "production"; port?: number; host?: string; }];
};

export type DiatremaOptions = {
    dev: boolean;
    debug: boolean;
    rootPath: string;
    appPath: string;
    productionDir: string;
    developmentDir: string;
    initiatorFilePath?: string;
    moduleType: "commonjs" | "esm";
}

export const diatremaDefaultConfig: DiatremaOptions = {
    dev: false,
    debug: false,
    rootPath: process.cwd(),
    get appPath(): string {
        return join(this.rootPath, this.dev ? this.developmentDir : this.productionDir);
    },
    productionDir: '.mahameru',
    developmentDir: '.mahameru',
    moduleType: 'esm'
}

/**
 * Main Diatrema class that orchestrates the application lifecycle.
 */
export default class Diatrema extends EventEmitter<DiatremaEvents> {
    protected _initialized = false;
    protected _isShuttingDown = false;
    protected _plugins = new Map<string, MahameruPlugin<any>>();
    protected logger: Logger;
    public instances: Instances = {};
    public readonly options: DiatremaOptions;

    constructor(options?: Partial<DiatremaOptions>) {
        super();

        this.options = { ...diatremaDefaultConfig, ...options };
        this.logger = createLogger('Diatrema', this.options.debug);
    }

    /**
     * Indicates whether the Mahameru server has been initialized or not.
     * @returns {boolean}
     */
    get initialized() {
        return this._initialized;
    }

    /**
     * Indicates whether the Mahameru server is shutting down or not.
     * @returns {boolean}
     */
    get isShuttingDown() {
        return this._isShuttingDown;
    }

    get plugins(): Record<string, MahameruPlugin<any>> {
        return Object.fromEntries(this._plugins);
    }

    public async initialize(): Promise<void> {
        try {
            if (this._initialized)
                return;

            await this.loadInitiator();

            for (const plugin of this._plugins.values()) {
                plugin.setDiatrema(this);

                await plugin.initialize();
            }
        } catch (error) {
            throw error;
        }

        this._initialized = true;

        this.emit('ready', { mode: this.options.dev ? 'development' : 'production' });
    }

    public setPlugin<T extends MahameruPlugin<any>>(pluginName: string, plugin: T) {
        this._plugins.set(pluginName, plugin);
    }

    public getPlugin<T extends MahameruPlugin<any>>(pluginName: string): T | undefined {
        return this._plugins.get(pluginName) as T | undefined;
    }

    public async devHRM(changedFile?: string) {
        if (!this._initialized)
            return

        if (changedFile) {
            for (const [_name, plugin] of this._plugins.entries()) {
                await plugin.onDevHRM(changedFile);
            }
        }
    }

    public async shutdown(): Promise<void> {
        if (this._isShuttingDown)
            return

        this._isShuttingDown = true;

        this.logger.debug('Shutting down...');

        for (const plugin of this._plugins.values()) {
            await plugin.destroy();
        }

        this._initialized = false;
        this.logger.debug('Shutting down... Done');
    }

    protected async loadInitiator() {
        if (!this.options.initiatorFilePath)
            return;

        const result = await this.require<Record<'default', InitiatorHandler>>(this.options.moduleType, this.options.initiatorFilePath);

        if (result) {
            const handler = this.getDefaultExport<InitiatorHandler>(result, this.options.initiatorFilePath);

            this.instances = await handler();
            this.logger.debug(`Initiator loaded successfully. Found ${Object.keys(this.instances).length} instances.`);
        }
    }

    protected async require<T extends Record<string, unknown> = Record<string, unknown>>(type: "commonjs" | "esm", resolvedFilePath: string): Promise<T | undefined> {
        const noCache = this.options.dev;

        if (!existsSync(resolvedFilePath))
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

    protected getDefaultExport<T>(module: Record<string, T>, filePath: string) {
        const defaultExportName = Object.keys(module).find((key) => key === 'default');

        if (!defaultExportName)
            throw new Error(`Module in file '${filePath}' does not have a default export.`);

        return module[defaultExportName];
    }
}
