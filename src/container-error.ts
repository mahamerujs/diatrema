export class ContainerError extends Error {
    public readonly path: string;
    public readonly moduleName: string;

    constructor(moduleName: string, path: string, message?: string) {
        super(message || 'Cannot load module: ' + moduleName);
        this.name = 'ContainerError';
        this.path = path;
        this.moduleName = moduleName;

        Object.setPrototypeOf(this, ContainerError.prototype);

        if (Error.captureStackTrace)
            Error.captureStackTrace(this, ContainerError);
    }
}
