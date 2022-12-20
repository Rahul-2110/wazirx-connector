class NotAuthorizedError extends Error {
    statusCode = 401;

    reason = 'Not Authorized';

    constructor() {
        super('Not Authorized');
    }

    serializeErrors() {
        return [
            {
                message: this.reason,
            },
        ];
    }
}

module.exports = NotAuthorizedError;
