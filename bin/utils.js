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

function NoEarlyBreak (instance, resultContainers) {
	const [tweetContainer, retweetContainer] = resultContainers
	return tweetContainer.length === 0 && retweetContainer.length === 0
}

function EarlyBreak (instance, resultContainers, configs) {
	const [tweetContainer, retweetContainer] = resultContainers

	// if there were no more results, it might just due to that most tweets are reply
	if (tweetContainer.length === 0) {
		if (retweetContainer.length === 0) {
			return true
		}
		// check if the tweets are all reply
		// return false
	}

	const duplicatedCount = tweetContainer.reduce((acc, x) => {
		const isExist = configs.containers[instance.account].filter(ele => ele.tweetId === x.tweetId).length !== 0
		if (isExist) { return acc + 1 }
		return acc
	}, 0)

	return (duplicatedCount === tweetContainer.length)
}

async function Dispatch (argv, configs, func) {
	if (argv.sync) {
		return DispatchSync(argv, configs, func)
	}
	return DispatchAsync(argv, configs, func)
}

async function DispatchSync (argv, configs, func) {
	for (const user of configs.data) {
		await func(argv, configs, user)
	}
}

async function DispatchAsync (argv, configs, func) {
	const tasks = configs.data.map(user => func(argv, configs, user))
	return Promise.all(tasks).catch(console.error)
}

exports.DateFormat = DateFormat
exports.FormatDate = FormatDate
exports.FormatTwitterTimestamp = FormatTwitterTimestamp
exports.IncreaseDate = IncreaseDate
exports.FetchImage = FetchImage
exports.NoEarlyBreak = NoEarlyBreak
exports.EarlyBreak = EarlyBreak
exports.Dispatch = Dispatch