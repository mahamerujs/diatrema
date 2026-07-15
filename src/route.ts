import { join } from 'node:path';

import type { MahameruRequest } from './mahameru-request';
import type { MahameruResponse } from './mahameru-response';
import type { Container } from './container';
import type { HttpServerError } from './http-server-error';
import type { HTTPMethod, RouteHandlerContext, RouteItem } from './types';

export type RouteOptions = {
    dev: boolean;
    routesPath: string;
};

export type RouteDependencies = {
    container: Container;
    HttpServerError: typeof HttpServerError;
    MahameruResponse: typeof MahameruResponse;
};

export class Route {
    public readonly options: RouteOptions = {
        dev: false,
        routesPath: join(process.cwd(), '.mahameru', 'routes')
    }
    protected dependencies: RouteDependencies;

    constructor(
        dependencies: RouteDependencies
    )
    constructor(
        options: Partial<RouteOptions>,
        dependencies: RouteDependencies
    )
    constructor(
        arg1: Partial<RouteOptions> | RouteDependencies,
        arg2?: RouteDependencies
    ) {
        if (typeof arg2 !== 'undefined')
            this.options = { ...this.options, ...arg1 as Partial<RouteOptions> };

        if (typeof arg2 !== 'undefined') {
            this.dependencies = arg2;
        } else {
            this.dependencies = arg1 as RouteDependencies;
        }
    }

    normalizePathForMatching(path: string): string {
        if (path.length > 1 && path.endsWith('/')) {
            return path.slice(0, -1);
        }

        return path;
    }

    findMatchedRoute(matchUrl: string) {
        let matchedRoute: RouteItem | null = null;
        let matchResult: RegExpExecArray | null = null;

        for (const route of this.dependencies.container.getRouteItems()) {
            const result = route.regex.exec(matchUrl);

            if (result) {
                matchedRoute = route;
                matchResult = result;

                break;
            }
        }

        return { matchedRoute, matchResult };
    }

    async runNotFoundHandler(request: MahameruRequest, method: HTTPMethod): Promise<MahameruResponse | undefined> {
        if (!this.dependencies.container.notFoundHandler)
            return undefined;

        const handler = this.dependencies.container.notFoundHandler[method];

        if (typeof handler !== 'function') {
            return undefined;
        }

        const response = await handler(request, this.dependencies.container, { params: {} } satisfies RouteHandlerContext);

        return this.normalizeMahameruResponse(
            response,
            `Not found handler for method '${method}' must return a MahameruResponse instance.`
        );
    }

    async resolveRoute(request: MahameruRequest) {
        const rawReqPath = request.url.split('?')[0] || '/';
        const rawReqUrl = rawReqPath.replace(/\/+/g, '/');
        const matchUrl = this.normalizePathForMatching(rawReqUrl);

        let { matchedRoute, matchResult } = this.findMatchedRoute(matchUrl);

        if (!matchedRoute || !matchResult)
            return {
                matchedRoute: null,
                matchResult: null,
                notFoundResponse: await this.runNotFoundHandler(request, request.method) || this.dependencies.MahameruResponse.json(
                    { error: 'Not Found' },
                    { status: 404 }
                )
            };

        return { matchedRoute, matchResult };
    }

    protected isMahameruResponseLike(value: unknown): value is { body: unknown; status: number; headers?: Headers | Record<string, string> } {
        if (!value || typeof value !== 'object') {
            return false;
        }

        if (!('status' in value) || typeof value.status !== 'number') {
            return false;
        }

        if (!('body' in value)) {
            return false;
        }

        if (!('headers' in value) || value.headers === undefined) {
            return true;
        }

        if (value.headers instanceof Headers) {
            return true;
        }

        return typeof value.headers === 'object' && value.headers !== null && !Array.isArray(value.headers);
    }

    protected normalizeMahameruResponse(value: unknown, errorMessage: string): MahameruResponse {
        if (value instanceof this.dependencies.MahameruResponse) {
            return value;
        }

        if (!this.isMahameruResponseLike(value)) {
            throw new this.dependencies.HttpServerError(errorMessage);
        }

        const normalizedHeaders = value.headers instanceof Headers
            ? Object.fromEntries(value.headers.entries())
            : value.headers;

        return new this.dependencies.MahameruResponse(value.body, {
            status: value.status,
            headers: normalizedHeaders
        });
    }
}
