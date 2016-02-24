export class NestedError extends Error {
    private innerError: Error | any; // Normally this should be an error, but we support any value

    constructor(message: string, innerError: any) {
        super(message);
        this.innerError = innerError;
        this.name = innerError.name;
        const innerMessage = innerError.message;
        this.message = innerMessage ? `${message}: ${innerMessage}` : message;
    }
}