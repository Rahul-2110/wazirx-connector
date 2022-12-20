class TooManyRequestsEnvestError extends Error {
    statusCode = 4290;

    constructor(message) {
        super(message);
    }

    serializeErrors() {
        return [
            {
                message: this.message || 'Retry after 2 seconds',
            },
        ];
    }
}

module.exports = TooManyRequestsEnvestError;
