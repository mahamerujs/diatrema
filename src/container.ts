import path, { basename, dirname, join, relative, resolve } from 'node:path';
import { readdir } from 'node:fs/promises';

import { dynamicRequire, exists } from './helpers';
import type { ContainerError } from './container-error';
import type { ClassConstructor, ContainerItemID, ContainerRegistry, ErrorHandler, HTTPMethod, InitiatorHandler, MahameruContainer, MahameruMiddleware, ProtectedRoute, RouteHandler, RouteItem } from './types';
import type { ModuleError } from './module-error';

/**
 * Container options
 */
export type ContainerOptions = {
    modulesPath: string;
    routesPath: string;
    appPath: string;
    dev: boolean;
    moduleType: "commonjs" | "esm";
}

export type ContainerDependencies = {
    dataSources?: Record<string, any>;
    ContainerError: typeof ContainerError;
    ModuleError: typeof ModuleError;
}

export class Container {
    #initialized = false;
    protected classes = new Map<string, ClassConstructor>();
    protected _modules = new Map<ClassConstructor, any>();
    protected _errorHandler?: ErrorHandler;
    protected _notFoundHandler?: Record<HTTPMethod, RouteHandler>;
    protected _protectedRoutes: ProtectedRoute = [];
    protected dependencies: ContainerDependencies;
    protected _initiatorHandler?: InitiatorHandler;
    public readonly options: ContainerOptions;
    public containerRegistry: ContainerRegistry = new Map();

    constructor(dependencies: ContainerDependencies);
    constructor(initialOptions: Partial<ContainerOptions>, dependencies: ContainerDependencies);
    constructor(arg1: Partial<ContainerOptions> | ContainerDependencies, arg2?: ContainerDependencies) {
        if (typeof arg2 !== 'undefined') {
            this.options = this.buildOptions(arg1 as Partial<ContainerOptions>);
            this.dependencies = arg2;
        } else {
            this.dependencies = arg1 as ContainerDependencies;
            this.options = this.buildOptions();
        }
    }

    get notFoundHandler() {
        return this._notFoundHandler;
    }

    getRouteItems(): RouteItem[] {
        return Array.from(this.containerRegistry.values()).filter((item) => item.type === 'route').map((item) => item.item);
    }

    get middlewareHandler(): MahameruMiddleware | undefined {
        return this.containerRegistry.values().find((item) => item.type === 'middleware')?.item;
    }

    get errorHandler() {
        return this._errorHandler;
    }

    get protectedRoutes() {
        return this._protectedRoutes;
    }

    get initialized() {
        return this.#initialized;
    }

    get mahameruContainer(): MahameruContainer {
        const camelCaseName = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

        return new Proxy({} as Record<string, unknown>, {
            get: (_target, prop) => {
                if (typeof prop !== 'string')
                    return undefined;

                for (const registry of this.containerRegistry.values()) {
                    if (registry.type === 'module-service' || registry.type === 'module-controller' || registry.type === 'instance') {
                        const key = camelCaseName(registry.name);

                        if (key === prop) {
                            return registry.item;
                        }
                    }
                }

                return undefined;
            }
        }) as MahameruContainer;


        // const instances = this.containerRegistry.values().find((item) => item.type === 'instance');

        // if (instances) {
        //     (result as any) = {
        //         ...result,
        //         ...instances.item
        //     };
        // }

        // return result;
    }

    async discover() {
        await this.loadRoutes();
        await this.loadInitiator();
        await this.loadModules();
        await this.loadMiddlewareHandler();
        await this.loadNotFoundHandlers();
        await this.loadErrorHandler();
        await this.loadProtectedRoutes();

        this.#initialized = true;
    }

    protected async loadRoutes(currentDir?: string) {
        const baseDir = this.options.routesPath;

        if (!currentDir)
            currentDir = baseDir;

        const items = await readdir(currentDir, { withFileTypes: true }).catch(error => {
            if (error.code === 'ENOENT')
                return [];

            throw error;
        });

        for (const item of items) {

            const fullPath = join(currentDir, item.name);

            if (item.isDirectory()) {
                await this.loadRoutes(fullPath);

                continue;
            }

            if (!item.isFile() || (!['route.js', 'route.ts'].includes(item.name)))
                continue;

            await this.loadSingleRoute(fullPath, currentDir, baseDir, { parentPath: item.parentPath, name: item.name })
        }
    }

    protected async loadSingleRoute(fullPath: string, currentDir: string, baseDir: string, item: { parentPath: string, name: string }): Promise<boolean> {
        const relativePath = relative(baseDir, currentDir);

        let path = '/' + relativePath.replace(/\\/g, '/');
        path = path.replace(/\/+/g, '/');

        if (path.length > 1 && path.endsWith('/'))
            path = path.slice(0, -1);

        const paramNames: RouteItem['paramNames'] = [];
        const paramMatches = path.match(/\[([^\]]+)\]/g);

        if (paramMatches)
            paramMatches.forEach((match) => {
                paramNames.push(match.slice(1, -1));
            });

        const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexPattern = escaped.replace(/\\\[([^\\\]]+)\\\]/g, '([^/]+)');
        const regex = new RegExp(`^${regexPattern}$`);
        const pathFS = resolve(fullPath);
        const routeHandlers = await dynamicRequire<Record<HTTPMethod, RouteHandler>>(this.options.moduleType, fullPath, this.options.dev);

        if (routeHandlers) {
            this.containerRegistry.set(fullPath, {
                name: dirname(item.parentPath),
                path: fullPath,
                type: 'route',
                item: {
                    paramNames: [...paramNames],
                    path,
                    pathFS,
                    regex,
                    routeHandlers
                }
            });

            return true;
        }

        return false;
    }

    protected async loadModules() {
        const items = await readdir(this.options.modulesPath, { withFileTypes: true }).catch(error => {
            if (error.code === 'ENOENT')
                return [];

            throw error;
        });

        for (const item of items) {
            if (!item.isDirectory())
                continue;

            const directory = item;

            let controllerPath;
            const controllerPathCandidate = [
                path.join(this.options.modulesPath, directory.name, `controller.js`),
                path.join(this.options.modulesPath, directory.name, `controller.ts`)
            ];

            for (const candidate of controllerPathCandidate) {
                if (await exists(candidate)) {
                    controllerPath = candidate;
                    break;
                }
            }

            if (controllerPath && await exists(controllerPath)) {
                const controllerModule = await dynamicRequire<Record<string, ClassConstructor>>(this.options.moduleType, controllerPath, this.options.dev);

                if (controllerModule) {
                    const { name, clazz } = this.getDefaultExportClass(controllerModule, controllerPath);
                    const item = new clazz(this.mahameruContainer);
                    const containerRegistryID = `${controllerPath}:${name}`;

                    if (!this.containerRegistry.has(containerRegistryID))
                        this.containerRegistry.set(containerRegistryID, {
                            name,
                            path: controllerPath,
                            type: 'module-controller',
                            item
                        })
                }
            }

            let servicePath;
            const servicePathCandidate = [
                path.join(this.options.modulesPath, directory.name, `service.js`),
                path.join(this.options.modulesPath, directory.name, `service.ts`)
            ];

            for (const candidate of servicePathCandidate) {
                if (await exists(candidate)) {
                    servicePath = candidate;
                    break;
                }
            }

            if (servicePath && await exists(servicePath)) {
                const serviceModule = await dynamicRequire<Record<string, ClassConstructor>>(this.options.moduleType, servicePath, this.options.dev);

                if (serviceModule) {
                    const { name, clazz } = this.getDefaultExportClass(serviceModule, servicePath);
                    const item = new clazz(this.mahameruContainer);
                    const containerRegistryID = `${controllerPath}:${name}`;

                    if (!this.containerRegistry.has(containerRegistryID))
                        this.containerRegistry.set(containerRegistryID, {
                            name,
                            path: servicePath,
                            type: 'module-service',
                            item
                        })
                }
            }
        }
    }

    protected async loadMiddlewareHandler() {
        const middlawareHandlerPath = join(this.options.appPath, 'middleware.js');
        const result = await dynamicRequire<Record<'default', MahameruMiddleware>>(this.options.moduleType, middlawareHandlerPath, this.options.dev);
        const containerID: ContainerItemID = `${middlawareHandlerPath}:default`;

        if (!this.containerRegistry.has(containerID) && result?.default)
            this.containerRegistry.set(containerID, {
                name: 'default',
                path: middlawareHandlerPath,
                type: 'middleware',
                item: result?.default
            });
    }

    protected async loadNotFoundHandlers() {
        const notFoundHandlerPath = join(this.options.appPath, 'routes', 'not-found.js');

        this._notFoundHandler = await dynamicRequire<Record<HTTPMethod, RouteHandler>>(this.options.moduleType, notFoundHandlerPath, this.options.dev);
    }

    protected async loadErrorHandler() {
        const errorHandlerPath = join(this.options.appPath, 'error.js');
        const result = await dynamicRequire<Record<'default', ErrorHandler>>(this.options.moduleType, errorHandlerPath, this.options.dev);

        this._errorHandler = result?.default;
    }

    protected async loadProtectedRoutes() {
        const middlewarePath = join(this.options.appPath, 'middleware.js');
        const result = await dynamicRequire<Record<'protectedRoutes' | 'default', ProtectedRoute>>(this.options.moduleType, middlewarePath, this.options.dev);

        if (result && result.protectedRoutes)
            this._protectedRoutes = result.protectedRoutes;
    }

    protected async loadInitiator() {
        const initiatorPath = join(this.options.appPath, 'initiator.js');
        const result = await dynamicRequire<Record<'default', InitiatorHandler>>(this.options.moduleType, initiatorPath, this.options.dev);
        const handler = result?.default;

        if (handler) {
            this._initiatorHandler = handler;
            const instances = await this._initiatorHandler();

            Object.keys(instances).forEach((key) => {
                this.containerRegistry.set(`${initiatorPath}:${key}`, {
                    name: key,
                    path: initiatorPath,
                    type: 'instance',
                    item: (instances as any)[key]
                })
            })
        }
    }

    public async onFileChanged(filePath: string): Promise<boolean> {
        filePath = filePath.endsWith('.ts') ? filePath.replace('.ts', '.js') : filePath;

        if (filePath.includes('\\src\\'))
            filePath = filePath.replace('\\src\\', `\\.mahameru\\`);

        const found = this.containerRegistry.values().find((containerItem) => containerItem.path === filePath);

        if (found) {
            let module;

            if (found.type === 'route') {
                return await this.loadSingleRoute(filePath, dirname(filePath), this.options.routesPath, { parentPath: dirname(filePath), name: basename(filePath) });
            } else if (found.type === 'middleware') {
                module = await dynamicRequire<Record<'default', MahameruMiddleware>>(this.options.moduleType, filePath, this.options.dev);

                if (module) {
                    this.containerRegistry.set(`${filePath}:default`, {
                        ...found,
                        item: module.default
                    });

                    return true
                }
            }
        }

        return false;
    }

    protected getDefaultExportClass(module: Record<string, ClassConstructor<unknown>>, filePath: string) {
        const defaultExportName = Object.keys(module).find((key) => key === 'default');

        if (!defaultExportName)
            throw new this.dependencies.ModuleError(`Module in file '${filePath}' does not have a default export.`, { path: filePath, moduleName: Object.keys(module)[0] });

        return {
            name: module[defaultExportName].name,
            clazz: module[defaultExportName]
        };
    }

    protected buildOptions(initialOptions?: Partial<ContainerOptions>): ContainerOptions {
        const appPath = join(process.cwd(), '.mahameru');
        const defaultOptions: ContainerOptions = {
            appPath,
            modulesPath: join(appPath, 'modules'),
            moduleType: 'esm',
            dev: initialOptions?.dev ? true : false,
            routesPath: join(appPath, 'routes')
        };

        if (!initialOptions)
            return defaultOptions;

        return {
            ...defaultOptions,
            appPath,
            ...initialOptions
        };
    }
}
