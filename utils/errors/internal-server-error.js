class InternalServerError extends Error {
    statusCode = 500;

    reason = 'Internal Server Error';

    constructor() {
        super('Internal Server Error');
    }

    serializeErrors() {
        return [
            {
                message: this.reason,
            },
        ];
    }
}

module.exports = InternalServerError;
