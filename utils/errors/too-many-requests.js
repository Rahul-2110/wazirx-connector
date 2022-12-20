class TooManyRequestsError extends Error {
    statusCode = 429;

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

module.exports = TooManyRequestsError;
