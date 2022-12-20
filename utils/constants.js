const BASE_URL = 'https://api.wazirx.com/sapi/v1/';
const RESPONSE_WINDOW = 2000;
const RETRY_COUNT = 0;
const REQUEST_METHODS = {
    GET: 'get',
    POST: 'post',
    DELETE: 'delete',
};

module.exports = {
    BASE_URL,
    RESPONSE_WINDOW,
    RETRY_COUNT,
    REQUEST_METHODS
}