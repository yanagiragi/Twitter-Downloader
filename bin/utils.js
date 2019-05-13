const rp = require('request-promise')
const fs = require('fs-extra')

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

async function FetchImage(url, filename) {
    if (fs.existsSync(filename)){
        return false
    }
    else {
        try{
            let result = await rp({ url: url, encoding: 'binary'})
            fs.writeFileSync(filename, result, 'binary')
        }
        catch(error){
            console.log(`Error when download ${url}`)
            return false
        }
        
        return true
    }
}

exports.DateFormat = DateFormat
exports.FormatDate = FormatDate
exports.IncreaseDate = IncreaseDate
exports.FetchImage = FetchImage