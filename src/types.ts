import type { MahameruRequest } from "./mahameru-request";
import type { MahameruResponse } from "./mahameru-response";

export enum HTTPMethodEnum {
    GET = 'GET',
    HEAD = 'HEAD',
    POST = 'POST',
    PUT = 'PUT',
    DELETE = 'DELETE',
    CONNECT = 'CONNECT',
    OPTIONS = 'OPTIONS',
    TRACE = 'TRACE',
    PATCH = 'PATCH'
}

export type HTTPMethod = `${HTTPMethodEnum}`

export type RouteObject<T extends string = string> = {
    path: T;
    methods: HTTPMethod[];
};

export interface RegisterRoutes { }

export type ProtectedRoute = RegisterRoutes extends { routes: infer R }
    ? R[]
    : (string | RouteObject<string>)[];

export type RequestParams = {
    [key: string]: string;
};
export type RouteHandlerContext = { params: RequestParams };

export type RouteHandler = (
    request: MahameruRequest,
    container: MahameruContainer,
    context: RouteHandlerContext
) => Promise<MahameruResponse> | MahameruResponse;

export interface RouteItem {
    path: string;
    regex: RegExp;
    paramNames: (keyof RequestParams)[];
    routeHandlers: RouteHandlers;
    pathFS: string;
}

export type RouteHandlers = Record<HTTPMethod, RouteHandler>;

export type MahameruNext = () => Promise<MahameruResponse>;

export interface MahameruMiddlewareContext {
    request: MahameruRequest;
    container: MahameruContainer;
    params: Record<string, string>;
    path: string;
    method: HTTPMethod;
    status: number;
}

export type MahameruMiddleware = (context: MahameruMiddlewareContext, isProtectedRoute: boolean, next: MahameruNext) =>
    Promise<MahameruResponse> | MahameruResponse;

export type ErrorHandlerContext = MahameruMiddlewareContext & { error: unknown };

export type ErrorHandler = (context: ErrorHandlerContext, next: MahameruNext) =>
    Promise<MahameruResponse> | MahameruResponse;

export interface Modules { }
export interface Instances { }
export interface MahameruContainer extends Modules, Instances { }

export type ClassConstructor<T = unknown> = new (mahameruContainer: MahameruContainer) => T;

export type ContainerItemID = string
export type ContainerItem =
    | { name: string; path: string; type: 'module-service'; item: unknown }
    | { name: string; path: string; type: 'module-controller'; item: unknown }
    | { name: string; path: string; type: 'route'; item: RouteItem }
    | { name: string; path: string; type: 'instance'; item: Instances }
    | { name: string; path: string; type: 'middleware'; item: MahameruMiddleware }
    | { name: string; path: string; type: 'protected-route'; item: ProtectedRoute };

export type ContainerRegistry = Map<ContainerItemID, ContainerItem>;
export type InitiatorHandler = () => Promise<Instances>;
