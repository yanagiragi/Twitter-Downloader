function DateFormat(date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function FormatDate(dateString) {
    let splitted = dateString.split('-')
    return new Date([...splitted])
}

function IncreaseDate(dateString, dayCount=1){
    let date = FormatDate(dateString)
    date.setDate(date.getDate() + dayCount)
    return DateFormat(date)
}

exports.DateFormat = DateFormat
exports.FormatDate = FormatDate
exports.IncreaseDate = IncreaseDate