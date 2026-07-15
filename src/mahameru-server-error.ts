interface ErrorDetails {
    code: string
    address: string
    port: number
}

export class MahameruServerError {
    public readonly name = 'MahameruServerError';
    public readonly details?: ErrorDetails

    constructor(public readonly message: string, details?: ErrorDetails) {
        this.message = message;
        this.details = details;
    }

    toString() {
        if (this.details)
            return `${this.name}: ${this.message} (${this.details.code}) [${this.details.address}:${this.details.port}]`;

        return `${this.name}: ${this.message}`;
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            details: this.details
        };
    }
}
