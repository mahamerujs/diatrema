export class ModuleError extends Error {
    public readonly detail?: {
        path: string;
        moduleName: string;
    };

    constructor(message: string, detail?: { path: string; moduleName: string }) {
        super(message);

        if (detail) {
            this.detail = {
                path: detail.path,
                moduleName: detail.moduleName || 'UNKNOWN'
            };
        }

        Object.setPrototypeOf(this, ModuleError.prototype);

        delete this.stack;
    }
}
