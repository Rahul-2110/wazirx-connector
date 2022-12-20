class ExchangeError extends Error {
    statusCode = 400;

    constructor(message) {
        super(message);
    }

    serializeErrors() {
        return [
            {
                message: this.message,
                type: 'exchange_error',
            },
        ];
    }
}

module.exports = ExchangeError;
