class CustomError extends Error {
    statusCode = 500;

    constructor(message) {
        super(message);
    }

    serializeErrors() {}
}
class RequestValidationError extends CustomError {
    statusCode = 400;

    errors = {};

    constructor(errors) {
        super('Invalid request parameters');
        this.errors = errors;
    }

    serializeErrors() {
        return this.errors.details.map((error) => ({
            message: error.message,
            field: error.context?.label,
        }));
    }
}

module.exports = RequestValidationError;
