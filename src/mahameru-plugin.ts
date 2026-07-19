import type Diatrema from "./diatrema";
import { type Logger } from "./logger";

export interface BasePluginOptions {
    debug?: boolean;
}

export abstract class MahameruPlugin<O extends BasePluginOptions = BasePluginOptions> {
    public abstract readonly name: string;
    public abstract readonly slugName: string;
    protected logger!: Logger;
    protected diatrema!: Diatrema;
    protected _options: O;
    protected _initialized = false;
    protected _isShuttingDown = false;
    protected _typesGenerator?: TypesGenerator;

    constructor(options: Partial<O>) {
        this._options = options as O;
    }

    get initialized() {
        return this._initialized;
    }

    get options(): O {
        return this._options;
    }

    get typesGenerator() {
        return this._typesGenerator;
    }

    set outputTypesDirPath(outputTypesDirPath: string) {
        if (this.typesGenerator)
            this.typesGenerator.outputTypesDirPath = outputTypesDirPath;
    }

    public setDiatrema(diatrema: Diatrema) {
        this.diatrema = diatrema;
    }

    public async initialize(): Promise<void> {
        if (!this.diatrema) {
            this.logger.debug('Failed to initialize. No Diatrema instance found');

            return;
        }

        this.logger.debug('Initializing...');

        if (this._initialized) {
            this.logger.debug('Already initialized');

            return;
        }

        await this.boot();

        this.logger.debug('Initializing... Done');

        this._initialized = true;
    }

    public async destroy(): Promise<void> {
        if (!this._initialized || this._isShuttingDown)
            return;

        this.logger.debug('Destroying...');

        this._isShuttingDown = true;

        await this.terminate();

        this._initialized = false;
        this._isShuttingDown = false;

        this.logger.debug('Destroying... Done');
    }

    protected abstract boot(options?: Partial<O>): Promise<void> | void;
    protected abstract terminate(): Promise<void> | void;
}

export interface BaseTypesGeneratorOptions {
    debug?: boolean;
}

export abstract class TypesGenerator<O extends BaseTypesGeneratorOptions = BaseTypesGeneratorOptions> {
    protected logger!: Logger;
    protected _diatrema!: Diatrema;
    protected _options: O;
    protected _outputTypesDirPath!: string;

    constructor(options: Partial<O>) {
        this._options = options as O;
    }

    set diatrema(diatrema: Diatrema) {
        this._diatrema = diatrema;
    }

    set outputTypesDirPath(outputTypesDirPath: string) {
        this._outputTypesDirPath = outputTypesDirPath;
    }

    public async generate() {
        this.logger.debug('Generating types...');
        const types = await this._generate();
        this.logger.debug('Types generated', types);
    }

    protected abstract _generate(): Promise<Record<string, any>>;
}
