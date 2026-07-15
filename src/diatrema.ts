import { join } from 'node:path';

import { HttpServer } from './http-server';
import { EventEmitter } from "./event-emitter";

import type { Container } from './container';
import type { Route } from './route';
import type { Logger } from './logger';

export type DiatremaEvents = {
    ready: [data: { mode: "development" | "production"; port: number; host: string; }];
};

export type DiatremaOptions = {
    dev: boolean;
    isStandalone: boolean;
    rootPath: string;
    appPath: string;
    routesDir: string;
    productionDir: string;
    developmentDir: string;
}

export type DiatremaDependencies = {
    container: Container;
    route: Route;
    httpServer: HttpServer;
    logger: Logger;
};

export const diatremaDefaultConfig: DiatremaOptions = {
    dev: false,
    isStandalone: false,
    rootPath: process.cwd(),
    get appPath(): string {
        if (this.isStandalone)
            return this.rootPath;

        return join(this.rootPath, this.dev ? this.developmentDir : this.productionDir);
    },
    productionDir: '.mahameru',
    developmentDir: '.mahameru',
    routesDir: 'routes'
}

/**
 * Main Diatrema class that orchestrates the application lifecycle.
 */
export default class Diatrema extends EventEmitter<DiatremaEvents> {
    #initialized = false;
    #isShuttingDown = false;
    public readonly options: DiatremaOptions = diatremaDefaultConfig;
    protected readonly dependencies: DiatremaDependencies;

    constructor(dependencies: DiatremaDependencies)
    constructor(
        initialOptions: Partial<DiatremaOptions>,
        dependencies: DiatremaDependencies
    )
    constructor(
        arg1: Partial<DiatremaOptions> | DiatremaDependencies,
        arg2?: DiatremaDependencies
    ) {
        super();

        if (typeof arg2 !== 'undefined')
            this.options = { ...this.options, ...arg1 as Partial<DiatremaOptions> };

        if (typeof arg2 !== 'undefined') {
            this.dependencies = arg2;
        } else {
            this.dependencies = arg1 as DiatremaDependencies;
        }
    }

    /**
     * Indicates whether the Mahameru server has been initialized or not.
     * @returns {boolean}
     */
    get initialized() {
        return this.#initialized;
    }

    /**
     * Indicates whether the Mahameru server is shutting down or not.
     * @returns {boolean}
     */
    get isShuttingDown() {
        return this.#isShuttingDown;
    }

    /**
     * Initialize the Mahameru server.
     */
    async initialize(): Promise<void> {
        try {
            if (this.#initialized)
                return;

            await this.dependencies.container.discover();
        } catch (error) {
            throw error;
        }

        const { port, host } = await this.dependencies.httpServer.listen();
        this.#initialized = true;

        this.emit('ready', { mode: this.options.dev ? 'development' : 'production', port: port, host: host });
    }

    /**
     * Hot reload the middleware and routes when a file changes in development mode.
     */
    async devHRM(changedFile?: string) {
        if (!this.#initialized)
            return

        if (changedFile) {
            if (await this.dependencies.container.onFileChanged(changedFile))
                this.dependencies.logger.debug(`File changed: ${changedFile}`);
        }
    }

    /**
     * Shut down the Mahameru server gracefully.
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        if (this.#isShuttingDown)
            return

        this.#isShuttingDown = true;

        this.dependencies.logger.info('Shutting down Mahameru server...');

        try {
            this.dependencies.logger.info('Databases destroyed successfully.');
        } catch (error) {
            this.dependencies.logger.error('Error destroying databases', error);
        }

        if (this.dependencies.httpServer.listening) {
            try {
                await this.dependencies.httpServer.close();
                this.dependencies.logger.info('HTTP server closed successfully.');
            } catch (error) {
                this.dependencies.logger.error('Error closing HTTP server', error);
            }
        }

        this.#initialized = false;
        this.dependencies.logger.info('Mahameru server shut down.');
    }
}
