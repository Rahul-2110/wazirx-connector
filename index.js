const { BASE_URL } = require('./utils/constants');

const hmacSHA256 = require('crypto-js/hmac-sha256');
const axios = require('axios');
const { REQUEST_METHODS } = require('./utils/constants');

const TooManyRequests = require('./utils/errors/too-many-requests');
const TooManyRequestsError = require('./utils/errors/too-many-requests');
const GatewayTimeoutError = require('./utils/errors/gateway-timeout');
const TooManyRequestsEnvestError = require('./utils/errors/too-many-requests-envest');
const ExchangeError = require('./utils/errors/exchange-error');

const logger = require('./utils/logger');

const { delay } = require('./utils/helpers');

// WazirX codes

// HTTP 403 return code is used when the WAF Limit (Web Application Firewall) has been violated.
// HTTP 429 return code is used when breaking a request rate limit.
// HTTP 418 return code is used when an IP has been auto-banned for continuing to send requests after receiving 429 codes.

// WazirX general request information

// For GET endpoints, parameters must be sent as a query string.
// For POST, PUT, and DELETE endpoints, the parameters must be sent as a request body with content type application/x-www-form-urlencoded.
// Parameters may be sent in any order.
// If a parameter sent in both the query string and request body, the query string parameter will be used.

// General Info on Limits

// Limits are set on specific api endpoints. These will be mentioned in the description of the endpoint. For e.g the Ping api will have a limit of 1 request/sec while Place order api will have a limit of 10 requests/sec
// A 429 will be returned when rate limit is violated.
// The limits on the API are based on the API keys.
// We recommend using the websocket for getting data as much as possible, as this will not count to the request rate limit.

// IP Limits

// When a 429 is received, it's your obligation as an API to back off and not spam the API.
// Repeatedly violating rate limits and/or failing to back off after receiving 429s will result in an automated IP ban (HTTP status 418).
// IP bans are tracked and scale in duration for repeat offenders, from 2 minutes to 3 days.
// A Retry-After header is sent with a 418 or 429 responses and will give the number of seconds required to wait, in the case of a 429, to prevent a ban, or, in the case of a 418, until the ban is over.


const sortObjectByKeys = (obj) =>
    Object.keys(obj)
        .sort()
        .reduce((res, key) => ((res[key] = obj[key]), res), {});

class WazirXApis {
    constructor(data) {
        this.api_key = data.apiKey;
        this.api_secret = data.apiSecret;
        this.base_url = BASE_URL;
        this.content_type = 'application/x-www-form-urlencoded';
        this.res_window = data.resWindow ? data.resWindow : RESPONSE_WINDOW;
        this.cacheIpKey = `WazirX:isIpBlocked`;
        this.axiosInstance = axios.create({
            timeout: this.res_window,
            baseURL: this.base_url,
            headers: { 'X-Api-Key': this.api_key },
        });
        this.retry_count = data.retryCount ? data.retryCount : RETRY_COUNT;
    }

    getCacheKey(apiEndpoint) {
        return `WazirX:${this.api_key}:${apiEndpoint}`;
    }

    errorHandler(error, url, limitPerSec) {
        if (error.response) {
            if (error.response.status == 429) {
                nodeCache.set(this.getCacheKey(url), limitPerSec, 1);
                throw new TooManyRequestsError(
                    `[WazirX] Max limit reached. Retry after ${error.response?.headers['Retry-After']
                        ? error.response?.headers['Retry-After']
                        : 1
                    } seconds`
                );
            } else if (error.response.status == 418) {
                nodeCache.set(
                    this.cacheIpKey,
                    true,
                    error.response?.headers['Retry-After']
                        ? error.response?.headers['Retry-After']
                        : 10
                );
                throw new TooManyRequestsError(
                    `[WazirX] Max limit reached. Retry after ${error.response?.headers['Retry-After']
                        ? error.response?.headers['Retry-After']
                        : 10
                    } seconds`
                );
            }
            // throw new TooManyRequestsError(`[WazirX] Max limit reached. Retry after ${error.response?.headers['Retry-After'] ? error.response?.headers['Retry-After'] : 10} seconds`)
        } else if (!(error instanceof TooManyRequests)) {
            if (error.code === 'ECONNABORTED') {
                throw new GatewayTimeoutError(
                    `WazirX server taking too much time to respond for : ${url}`
                );
            }
        }
        logger.info(error.response);
        const errorMessage = error?.response?.data?.message || error.message;
        throw new ExchangeError(errorMessage);
    }

    async request(
        url = null,
        method = null,
        params = {},
        body = {},
        limitPerSec = 1,
        isPublic = false
    ) {
        if (!url || !method) {
            throw new Error('Invalid request data');
        }
        const nodeCacheKey = this.getCacheKey(url);
        if (nodeCache.get(this.cacheIpKey)) {
            throw new TooManyRequestsError(
                `[Envest] Max limit reached. Retry after ${new Date(
                    nodeCache.getTtl(this.cacheIpKey)
                )}`
            );
        }
        let reqCount = nodeCache.get(nodeCacheKey);
        if (reqCount < limitPerSec) {
            nodeCache.set(nodeCacheKey, reqCount + 1);
        } else if (reqCount >= limitPerSec) {
            throw new TooManyRequestsError(
                `[Envest] Max limit reached. Retry after ${new Date(
                    nodeCache.getTtl(nodeCacheKey)
                )}`
            );
        } else {
            nodeCache.set(nodeCacheKey, 1, 1);
        }
        const currentTime = new Date().getTime();
        if (method === REQUEST_METHODS.GET) {
            params.recvWindow = this.res_window;
            params.timestamp = currentTime;
            if (!isPublic) {
                let paramsString = encodeURI(
                    Object.keys(sortObjectByKeys(params))
                        .map((key) => key + '=' + params[key])
                        .join('&')
                );
                const signature = hmac(this.api_secret, paramsString);
                params = { ...params, signature };
            }

            return await this.axiosInstance.request({
                url,
                method,
                params: params,
            });
        } else if (method === REQUEST_METHODS.POST || method === REQUEST_METHODS.DELETE) {
            body.recvWindow = this.res_window;
            body.timestamp = currentTime;
            let bodyString = encodeURI(
                Object.keys(sortObjectByKeys(body))
                    .map((key) => key + '=' + body[key])
                    .join('&')
            );
            const signature = hmac(this.api_secret, bodyString);
            return await this.axiosInstance.request({
                url,
                method,
                data: `${bodyString}&signature=${signature}`,
                headers: { 'Content-Type': this.content_type },
            });
        }
    }

    async retryRequest(
        url = null,
        method = null,
        params = {},
        body = {},
        limitPerSec = 1,
        retryCount = this.retry_count,
        isPublic = false
    ) {
        try {
            if (!url || !method) {
                throw new Error('Invalid request data');
            }
            if (retryCount <= 0) {
                throw new TooManyRequestsEnvestError(
                    `[Envest] Max limit reached. Retry after some time`
                );
            }
            const nodeCacheKey = this.getCacheKey(url);
            if (nodeCache.get(this.cacheIpKey)) {
                let waitPeriod = nodeCache.getTtl(this.cacheIpKey) - new Date().getTime();
                if (nodeCache <= 2000) {
                    await delay(waitPeriod);
                    let res = await this.retryRequest(
                        url,
                        method,
                        params,
                        body,
                        limitPerSec,
                        retryCount,
                        isPublic
                    );
                    return res;
                } else {
                    throw new TooManyRequestsEnvestError(
                        `[Envest] Max limit reached. Retry after ${new Date(
                            nodeCache.getTtl(this.cacheIpKey)
                        )}`
                    );
                }
            }
            let reqCount = nodeCache.get(nodeCacheKey);
            if (reqCount < limitPerSec) {
                nodeCache.set(
                    nodeCacheKey,
                    reqCount + 1,
                    (nodeCache.getTtl(nodeCacheKey) - Date.now()) / 1000
                );
            } else if (reqCount >= limitPerSec) {
                const waitPeriod = nodeCache.getTtl(nodeCacheKey) - Date.now();
                if (waitPeriod <= 2000) {
                    await delay(waitPeriod);
                    let res = await this.retryRequest(
                        url,
                        method,
                        params,
                        body,
                        limitPerSec,
                        retryCount,
                        isPublic
                    );
                    return res;
                } else {
                    throw new TooManyRequestsEnvestError(
                        `[Envest] Max limit reached. Retry after ${new Date(
                            nodeCache.getTtl(nodeCacheKey)
                        )}`
                    );
                }
            } else {
                nodeCache.set(nodeCacheKey, 1, 1);
            }
            const currentTime = new Date().getTime();
            if (method === REQUEST_METHODS.GET) {
                params.recvWindow = this.res_window;
                params.timestamp = currentTime;
                if (!isPublic) {
                    let paramsString = encodeURI(
                        Object.keys(sortObjectByKeys(params))
                            .map((key) => key + '=' + params[key])
                            .join('&')
                    );
                    const signature = hmac(this.api_secret, paramsString);
                    params.signature = signature;
                }
                try {
                    let res = await this.axiosInstance.request({
                        url,
                        method,
                        params: params,
                    });
                    return res;
                } catch (error) {
                    if (error.code === 'ECONNABORTED') {
                        delete params.recvWindow;
                        delete params.timestamp;
                        if (!isPublic) {
                            delete params.signature;
                        }
                        let res = await this.retryRequest(
                            url,
                            method,
                            params,
                            body,
                            limitPerSec,
                            retryCount - 1,
                            isPublic
                        );
                        return res;
                    }
                    throw error;
                }
            } else if (method === REQUEST_METHODS.POST || method === REQUEST_METHODS.DELETE) {
                body.recvWindow = this.res_window;
                body.timestamp = currentTime;

                let bodyString = encodeURI(
                    Object.keys(sortObjectByKeys(body))
                        .map((key) => key + '=' + body[key])
                        .join('&')
                );
                const signature = hmac(this.api_secret, bodyString);
                try {
                    let res = await this.axiosInstance.request({
                        url,
                        method,
                        data: `${bodyString}&signature=${signature}`,
                        headers: { 'Content-Type': this.content_type },
                    });
                    return res;
                } catch (error) {
                    if (error.code === 'ECONNABORTED') {
                        delete body.recvWindow;
                        delete body.timestamp;
                        let res = await this.retryRequest(
                            url,
                            method,
                            params,
                            body,
                            limitPerSec,
                            retryCount - 1,
                            isPublic
                        );
                        return res;
                    }
                    throw error;
                }
            }
        } catch (error) {
            if ([2098, 429, 418].includes(error.response?.status) && retryCount > 1) {
                if (error.response.status == 429) {
                    nodeCache.set(
                        this.getCacheKey(url),
                        limitPerSec,
                        error.response?.headers['Retry-After']
                            ? error.response?.headers['Retry-After']
                            : 1
                    );
                } else if (error.response.status == 418) {
                    nodeCache.set(
                        this.cacheIpKey,
                        true,
                        error.response?.headers['Retry-After']
                            ? error.response?.headers['Retry-After']
                            : 10
                    );
                }
                let res = await this.retryRequest(
                    url,
                    method,
                    params,
                    body,
                    limitPerSec,
                    retryCount - 1
                );
                return res;
            } else {
                throw error;
            }
        }
    }

    async getFunds(retry_count) {
        try {
            if (retry_count) {
                let res = await this.retryRequest(
                    `/funds`,
                    REQUEST_METHODS.GET,
                    {},
                    {},
                    1,
                    retry_count
                );
                return res.data;
            } else {
                let res = await this.request(`/funds`, REQUEST_METHODS.GET, {}, {}, 1);
                return res.data;
            }
        } catch (error) {
            this.errorHandler(error, `/funds`, 1);
        }
    }

    async getTicker(symbol, retry_count) {
        try {
            const redis = getRedis();
            let ticker = await redis.get(`WazirX:Ticker:${symbol}`);
            if (ticker) {
                return JSON.parse(ticker);
            }
            if (retry_count) {
                let res = await this.retryRequest(
                    `/ticker/24hr`,
                    REQUEST_METHODS.GET,
                    { symbol },
                    {},
                    1,
                    retry_count,
                    true
                );
                await redis.set(`WazirX:Ticker:${symbol}`, JSON.stringify(res.data), 'EX', 5);
                return res.data;
            } else {
                let res = await this.request(
                    `/ticker/24hr`,
                    REQUEST_METHODS.GET,
                    { symbol },
                    {},
                    1,
                    true
                );
                await redis.set(`WazirX:Ticker:${symbol}`, JSON.stringify(res.data), 'EX', 5);
                return res.data;
            }
        } catch (error) {
            this.errorHandler(error, `/ticker/24hr`, 1);
        }
    }

    async getTickers(retry_count) {
        try {
            const redis = getRedis();
            let tickers = await redis.get(`WazirX:Tickers`);
            if (tickers) {
                return JSON.parse(tickers);
            }
            if (retry_count) {
                let res = await this.retryRequest(
                    `/tickers/24hr`,
                    REQUEST_METHODS.GET,
                    {},
                    {},
                    1,
                    retry_count,
                    true
                );
                await redis.set(`WazirX:Tickers`, JSON.stringify(res.data), 'EX', 5);
                return res.data;
            } else {
                let res = await this.request(`/tickers/24hr`, REQUEST_METHODS.GET, {}, {}, 1, true);
                await redis.set(`WazirX:Tickers`, JSON.stringify(res.data), 'EX', 5);
                return res.data;
            }
        } catch (error) {
            this.errorHandler(error, `/tickers/24hr`, 1);
        }
    }

    async order(symbol, type = 'limit', price, quantity, side = 'buy', order_id) {
        try {
            let res = await this.request(
                `/order`,
                REQUEST_METHODS.POST,
                {},
                {
                    symbol,
                    type,
                    price,
                    quantity,
                    side,
                    clientOrderId: order_id,
                },
                10
            );
            return res.data;
        } catch (error) {
            this.errorHandler(error, `/order`, 10);
        }
    }

    async getOrderStatus(client_order_id, retry_count) {
        try {
            if (retry_count) {
                try {
                    let res = await this.retryRequest(
                        `/order`,
                        REQUEST_METHODS.GET,
                        { clientOrderId: client_order_id },
                        {},
                        2,
                        retry_count
                    );
                    return res.data;
                } catch (er) {
                    console.log('retry error');
                    throw er;
                }
            } else {
                try {
                    let res = await this.request(
                        `/order`,
                        REQUEST_METHODS.GET,
                        { clientOrderId: client_order_id },
                        {},
                        2
                    );
                    return res.data;
                } catch (er) {
                    console.log('request error');
                    throw er;
                }
            }
        } catch (error) {
            this.errorHandler(error, `/order`, 1);
        }
    }
}

module.exports = WazirXApis;
