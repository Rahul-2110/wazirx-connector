function hmac(key, string) {
    return hmacSHA256(string, key).toString();
}

module.exports = {
    hmac
}