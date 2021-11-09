module.exports = {
    ifEquals (value1, value2, options) {
        return value1 === value2 ? options.fn(this) : "";
    },
    ifNotEquals (value1, value2, options) {
        return value1 !== value2 ? options.fn(this) : "";
    }
}