function delayInSecods(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function delay(miliseconds) {
    return new Promise((resolve) => setTimeout(resolve, miliseconds));
}

module.exports = {
    delayInSecods,
    delay
};