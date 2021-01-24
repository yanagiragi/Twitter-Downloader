const util = require('util')
const streamPipeline = util.promisify(require('stream').pipeline)
const fetch = require('node-fetch')
const fs = require('fs-extra')

function DateFormat (date) {
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function FormatDate (dateString) {
	if (dateString.includes('-')) { // old version
		let splitted = dateString.split('-')
		return new Date([...splitted])
	} else {
		return new Date(dateString)
	}
}

function FormatTwitterTimestamp (str) {
	if (str.includes('-')) { // old version
		let splitted = str.split(' ')

		// already YYYY-MM-DD HH:MM AM/PM
		if (splitted.length === 3) {
			return str
		}

		let monthString = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

		let date = `${splitted[splitted.length - 1]}-${monthString.indexOf(splitted[splitted.length - 2])}-${splitted[splitted.length - 3]}`
		let time = `${splitted[0]} ${splitted[1]}`

		return `${date} ${time}`
	} else {
		return str
	}
}

function IncreaseDate (dateString, dayCount = 1) {
	let date = FormatDate(dateString)
	date.setDate(date.getDate() + dayCount)
	return DateFormat(date)
}

async function FetchImage (url, filename) {
	try {
		const resp = await fetch(url)
		if (!resp.ok) throw new Error(`Error When Downloading ${url}`)
		await streamPipeline(await resp.body, fs.createWriteStream(filename))
	} catch (error) {
		console.log(`Error when download ${url}`)
		return false
	}

	return true
}

exports.DateFormat = DateFormat
exports.FormatDate = FormatDate
exports.FormatTwitterTimestamp = FormatTwitterTimestamp
exports.IncreaseDate = IncreaseDate
exports.FetchImage = FetchImage
