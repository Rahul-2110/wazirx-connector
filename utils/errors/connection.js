class ConnectionError extends Error {
    statusCode = 500;

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

module.exports = ConnectionError;
