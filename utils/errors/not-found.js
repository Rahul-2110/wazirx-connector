class NotFoundError extends Error {
    statusCode = 404;

    constructor(message) {
        super(message);
    }

    serializeErrors() {
        return [
            {
                message: this.message || 'Not found',
            },
        ];
    }
}

module.exports = NotFoundError;
