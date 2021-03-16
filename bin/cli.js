#!/usr/bin/env node
const path = require('path')
const fs = require('fs-extra')
const minimist = require('minimist')
const Table = require('easy-table')
const pMap = require('p-map')
const { TwitterCrawler } = require('..')
const { DateFormat, FormatDate, IncreaseDate, FetchImage, FormatTwitterTimestamp } = require('./utils')

const daySkip = 1
const saveDuration = 50

const args = minimist(process.argv.slice(2))

const mode = args.mode || 'info'
const sync = args.sync || 'false'
const noEarlyBreak = args.deep || 'false'
const useRemoteStorage = args.useRemoteStorage || 'false'

const isVerbose = (process.env.NODE_ENV !== 'production')

const StoragePath = (useRemoteStorage === 'true' ? path.join(__dirname, '/Storage_Remote') : path.join(__dirname, '/Storage'))
const dataPath = (useRemoteStorage === 'true' ? path.join(__dirname, '/Storage_Remote', 'data.json') : path.join(__dirname, 'data', 'data.json'))
const containerPath = (useRemoteStorage === 'true' ? path.join(__dirname, '/Storage_Remote', 'container.json') : path.join(__dirname, 'data', 'container.json'))
const currentDate = DateFormat(new Date())
const remoteStorageCache = UpdateRemoteStorageCache()

var data = []
var containers = {}

function UpdateRemoteStorageCache () {
	if (useRemoteStorage !== 'true') {
		return []
	}

	console.log('Updating Remote Storage Cache ...')
	const res = fs.readdirSync(StoragePath)
		.filter(x => x.includes('.json') === false) // filter container.json and data.json
		.map(x => fs.readdirSync(path.join(StoragePath, x)).map(ele => path.join(StoragePath, x, ele)))
		.flat()
	console.log('Updating Remote Storage Cache Done, length = ' + res.length)
	return res
}

async function DownloadImage (url, filename) {
	const result = await FetchImage(url, filename)
	if (result && isVerbose) { console.log(`Successfully Download ${url} as ${filename}`) }
	return
}

function NoEarlyBreak (instance, resultContainers) {
	const [tweetContainer, retweetContainer] = resultContainers
	return tweetContainer.length === 0 && retweetContainer.length === 0
}

function EarlyBreak (instance, resultContainers) {
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
		const isExist = containers[instance.account].filter(ele => ele.tweetId === x.tweetId).length !== 0
		if (isExist) { return acc + 1 }
		return acc
	}, 0)

	return (duplicatedCount === tweetContainer.length)
}

function Save (UpdateDate = false) {
	if (useRemoteStorage === 'true') {
		console.log('Saving ...')
	}

	if (UpdateDate) {
		data.map(x => {
			x.startDate = currentDate
		})
	}

	for (const key in containers) {
		const ele = containers[key]
		ele.map(x => {
			x.timestamp = FormatTwitterTimestamp(x.timestamp)
		})
		ele.sort((a, b) => FormatDate(a.timestamp) < FormatDate(b.timestamp) ? 1 : -1)
	}

	fs.writeFileSync(dataPath, JSON.stringify(data, null, 4))
	fs.writeFileSync(containerPath, JSON.stringify(containers, null, 4))

	if (isVerbose) {
		console.log('Save Done.')
	}
}

async function UpdateUserSearchInfo (user) {
	const account = user.id
	let startDate = user.startDate

	if (containers[account] === undefined) {
		containers[account] = []
	}

	if (startDate === currentDate) {
		if (isVerbose) { console.log(`${account} Already up to date. Skip.`) }
		return
	} else {
		let updateCount = 1
		const crawler = new TwitterCrawler(account, isVerbose)
		while (FormatDate(startDate) < FormatDate(currentDate)) {
			const nextDate = IncreaseDate(startDate, daySkip)
			if (isVerbose) { console.log(`Fetching ${account}, Date = ${startDate} ~ ${nextDate}`) }
			try {
				const crawlResult = await crawler.CrawlFromAdvancedSearch(startDate, nextDate)

				const tweetResult = crawlResult[0]
				tweetResult.map(x => {
					const isExist = containers[account].filter(ele => ele.tweetId === x.tweetId).length !== 0
					if (!isExist) {
						containers[account].push(x)
						if (isVerbose) { console.log(`update ${x.tweetId} for ${user.id}`) }
						// update with double weight when new tweet is found
						updateCount += 2
					}

					// update with weight 1
					updateCount += 1
				})

				// update anyway, force no data stills increase updateCount
				updateCount += 1

				if (updateCount > saveDuration) {
					user.startDate = startDate
					fs.writeFileSync(dataPath, JSON.stringify(data, null, 4))
					fs.writeFileSync(containerPath, JSON.stringify(containers, null, 4))
					console.log(`Save Snapshot: ${user.id} ${startDate}`)
					updateCount = 0
				}

				startDate = nextDate
			} catch (err) {
				console.log(`Error occurs on ${account}: ${err.message}`)
				break
			}

			// update anyway, force to save current date when error occurs
			user.startDate = startDate
		}
	}

	user.startDate = startDate
}

async function UpdateSearchInfoSync () {
	for (const user of data) {
		await UpdateUserSearchInfo(user)
	}
	Save()
}

function UpdateSearchInfo () {
	const tasks = data.map(user => UpdateUserSearchInfo(user))
	Promise.all(tasks).then(res => {
		Save()
	})
}

async function UpdateUserMainInfo (user) {
	const account = user.id
	const startDate = user.startDate

	if (containers[account] === undefined) {
		containers[account] = []
	}

	let updateCount = 1
	if (isVerbose) { console.log(`Fetching ${account} MainInfo`) }

	const breakHandler = noEarlyBreak === 'true' ? NoEarlyBreak : EarlyBreak

	try {
		const [crawlResult, crawlRetweets] = await new TwitterCrawler(account, isVerbose, breakHandler).CrawlFromMainPage()

		crawlResult.map(x => {
			const isExist = containers[account].filter(ele => ele.tweetId === x.tweetId).length !== 0
			if (!isExist) {
				containers[account].push(x)
				if (isVerbose) { console.log(`update ${x.tweetId}`) }
				updateCount += 1
			}
		})

		if (updateCount > saveDuration) {
			fs.writeFileSync(containerPath, JSON.stringify(containers, null, 4))
			updateCount = 0
		}
	} catch (err) {
		console.log(`Error occurs on ${account}: ${err.message}`)
	}
}

async function UpdateMainInfoSync () {
	for (const user of data) {
		await UpdateUserMainInfo(user)
	}
	Save()
}

function UpdateMainInfo () {
	Promise.all(
		data.map(async user => UpdateUserMainInfo(user))
	)
		.catch(err => console.error(err))
		.finally(() => Save())
}

async function UpdateImage () {	
	const tasks = []
	for(let i = 0; i < data.length; ++i) {
		const user = data[i]
		
		fs.ensureDirSync(`${StoragePath}/${user.id}`)

		const imgs = containers[user.id].reduce((acc, ele) => {
			if (ele.hasPhoto) { return acc.concat([...ele.photos]) } else { return acc }
		}, [])

		for(let j = 0; j < imgs.length; ++j) {
			const img = imgs[j]

			// remove :orig when saving
			const filename = path.join(StoragePath, user.id, img.replace(':orig', '').substring(img.lastIndexOf('/') + 1))
			
			if (useRemoteStorage === 'true' && remoteStorageCache.includes(filename)) {
				continue
			} else if (useRemoteStorage !== 'true' && fs.existsSync(filename)) {
				continue
			}
		
			tasks.push({ index: tasks.length, img: img, filename: filename })
		}
	}

	return pMap(tasks, async task => {
		if (isVerbose)
			console.log(`Running ${task.index}/${tasks.length}: ${task.img}`)
		const result = await DownloadImage(task.img, task.filename)
		return result
	}, { concurrency: 10 })
}

function Clear () {
	for (const user of data) {
		if (user.createDate) {
			user.startDate = user.createDate
		}
	}

	Save()
}

function ListData () {
	const t = new Table()

	data.forEach(d => {
		const omitPrefix = `${(d.ignore && d.ignore === true) ? '** ' : ''}`
		t.cell('Twitter Id (** For Omitted)', omitPrefix + d.id)
		t.cell('Create Date', d.createDate)
		t.cell('Start Date', d.startDate)
		t.newRow()
	})

	console.log(t.toString())
}

function UpdateData (updateData) {
	if (updateData === 'NULL') {
		console.log(`updateData = ${JSON.stringify(updateData)}`)
		console.log('Wrong Format. Abort.')
		return
	}

	let isUpdate = false

	for (const user of data) {
		if (user.id === updateData.id) {
			if (updateData.createDate !== 'NULL') {
				console.log(`Update ${user.id} createDate from ${user.createDate} to ${updateData.createDate}`)
				user.createDate = updateData.createDate
			}
			if (updateData.startDate !== 'NULL') {
				console.log(`Update ${user.id} startDate from ${user.startDate} to ${updateData.startDate}`)
				user.startDate = updateData.startDate
			}
			isUpdate = true
			break
		}
	}

	if (isUpdate === false) {
		if (updateData.createDate === 'NULL') {
			console.log(`updateData = ${JSON.stringify(updateData)}`)
			console.log('Wrong Format: createDate must be assigned.')
			console.log('Abort.')
			return
		} else {
			if (updateData.startDate === 'NULL') {
				console.log('Detect no assigned startDate, use createDate as default value')
				updateData.startDate = updateData.createDate
			}
			console.log(`Add ${updateData.id}, startDate = ${updateData.startDate}, createDate = ${updateData.createDate}`)
			data.push(updateData)
		}
	}

	Save()
}

if (require.main === module) {
	fs.ensureDirSync(StoragePath)

	if (!fs.existsSync(dataPath)) {
		console.log(`${dataPath} does not exists. Abort.`)
		process.exit()
	} else {
		const rawData = fs.readFileSync(dataPath)
		try {
			data = JSON.parse(rawData)

			if (mode !== 'list') {
				data = data.filter(x => typeof x.ignore === 'undefined' && x.ignore !== true)
			}
		} catch (err) {
			console.log(`Failed Parsing ${dataPath}, error = ${err}}`)
			process.exit()
		}
	}

	if (fs.existsSync(containerPath)) {
		const rawContainer = fs.readFileSync(containerPath)
		try {
			containers = JSON.parse(rawContainer)
		} catch (err) {
			console.log(`Failed Parsing ${containerPath}, error = ${err}}`)
			process.exit()
		}
	}

	if (mode === 'mainInfo') {
		if (isVerbose) {
			console.log('============================================')
			console.log('             UPDATE  MAIN  INFO')
			console.log('============================================')
			console.log('Deep = ', noEarlyBreak)
		}
		if (sync === 'true') {
			return UpdateMainInfoSync()
		} else {
			return UpdateMainInfo()
		}
	} else if (mode === 'searchInfo') {
		if (isVerbose) {
			console.log('============================================')
			console.log('             UPDATE SEARCH INFO')
			console.log('============================================')
		}
		if (sync === 'true') {
			UpdateSearchInfoSync()
		} else {
			UpdateSearchInfo()
		}
	} else if (mode === 'image') {
		if (isVerbose) {
			console.log('============================================')
			console.log('                UPDATE IMAGE')
			console.log('============================================')
		}
		return UpdateImage().then(result => console.log(`Done/Failed: ${result.filter(Boolean).length}/${result.length - result.filter(Boolean).length}`))
	} else if (mode === 'clear') {
		if (isVerbose) {
			console.log('============================================')
			console.log('                CLEAR DATA')
			console.log('============================================')
		}
		return Clear()
	} else if (mode === 'data') {
		console.log('============================================')
		console.log('                Update DATA')
		console.log('============================================')
		const updateId = args.id || 'NULL'
		const updateCreateDate = args.createDate || 'NULL'
		const updateStartDate = args.startDate || 'NULL'
		const updateData = { id: updateId, createDate: updateCreateDate, startDate: updateStartDate }
		return UpdateData(updateData)
	} else if (mode === 'list') {
		if (isVerbose) {
			console.log('============================================')
			console.log('                LIST DATA')
			console.log('============================================')
		}
		return ListData()
	} else {
		console.log('Error When Parsing Arguments.')
		console.log('Abort.')
		process.exit()
	}
}
