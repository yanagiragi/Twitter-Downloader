const rp = require('request-promise')
const fs = require('fs-extra')

function DateFormat(date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function FormatDate(dateString) {
    let splitted = dateString.split('-')
    return new Date([...splitted])
}

function FormatTwitterTimestamp(str) {
	let splitted = str.split(' ')

	// already YYYY-MM-DD HH:MM AM/PM
	if (splitted.length == 3){
		return str
	}

	let monthString = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

	let date = `${splitted[splitted.length - 1]}-${monthString.indexOf(splitted[splitted.length - 2])}-${splitted[splitted.length - 3]}`
	let time = `${splitted[0]} ${splitted[1]}`

	return `${date} ${time}`
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
exports.FormatTwitterTimestamp = FormatTwitterTimestamp
exports.IncreaseDate = IncreaseDate
exports.FetchImage = FetchImage
