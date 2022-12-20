class BadRequestError extends Error {
    statusCode = 400;

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

module.exports = BadRequestError;
