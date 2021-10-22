module.exports = {
    ifEquals: function (value1, value2, options) {
        return value1 === value2 ? options.fn(this) : "";
    },
    ifNotEquals: function (value1, value2, options) {
        return value1 !== value2 ? options.fn(this) : "";
    }
}