class GatewayTimeoutError extends Error {
    statusCode = 504;

    constructor(message) {
        super(message);
    }

    serializeErrors() {
        return [
            {
                message: this.message,
            },
        ];
    }
}

module.exports = GatewayTimeoutError;
