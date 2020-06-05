#!/usr/bin/env node
const path = require('path')
const fs = require('fs-extra')
const minimist = require('minimist')
const Table = require('easy-table')
const { TwitterCrawler } = require('..')
const { DateFormat, FormatDate, IncreaseDate, FetchImage, FormatTwitterTimestamp } = require('./utils')

const daySkip = 1
const saveDuration = 50

const args = minimist(process.argv.slice(2))

const mode = args.mode || 'info'
const sync = args.sync || 'false'
const noEarlyBreak = args.deep || 'false'

const StoragePath = path.join(__dirname, '/Storage')
const dataPath = path.join(__dirname, 'data', 'data.json')
const containerPath = path.join(__dirname, 'data', 'container.json')
const currentDate = DateFormat(new Date())

const isVerbose = (process.env.NODE_ENV !== 'production')

var data = []
var containers = {}

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

	let duplicatedCount = tweetContainer.reduce((acc, x) => {
		const isExist = containers[instance.account].filter(ele => ele.tweetId === x.tweetId).length !== 0
		if (isExist) { return acc + 1 }
		return acc
	}, 0)

	return (duplicatedCount === tweetContainer.length)
}

function Save (UpdateDate = false) {
	if (UpdateDate) {
		data.map(x => {
			x.startDate = currentDate
		})
	}

	for (let key in containers) {
		let ele = containers[key]
		ele.map(x => {
			x.timestamp = FormatTwitterTimestamp(x.timestamp)
		})
		ele.sort((a, b) => FormatDate(a.timestamp) < FormatDate(b.timestamp) ? 1 : -1)
	}

	fs.writeFileSync(dataPath, JSON.stringify(data, null, 4))
	fs.writeFileSync(containerPath, JSON.stringify(containers, null, 4))

	if (isVerbose) {
		console.log('Done.')
	}
}

/* async function UpdateSearchInfoSync()
{
    for (const user of data) {
        let account = user.id
        let startDate = user.startDate

        if(containers[account] == undefined){
            containers[account] = []
        }

        if (startDate == currentDate) {
            if(isVerbose)
                console.log(`${account} Already up to date. Skip.`)
            continue
        }
        else {
            let updateCount = 1
            while (FormatDate(startDate) < FormatDate(currentDate)){
                let nextDate = IncreaseDate(startDate, daySkip)
                if(isVerbose)
                    console.log(`Fetching ${account}, Date = ${startDate} ~ ${nextDate}`)
                let crawlResult = await new TwitterCrawler(account, startDate, nextDate, isVerbose).CrawlFromAdvancedSearch()
                crawlResult.map(x => {
                    const isExist = containers[account].filter(ele => ele.tweetId == x.tweetId).length != 0
                    if (!isExist){
                        containers[account].push(x)
                        if(isVerbose)
                            console.log(`update ${x.tweetId} for ${user.id}`)
                        updateCount += 1
                    }

                    updateCount += 1
                })

                updateCount += 1

                if(updateCount > saveDuration){
                    user.startDate = startDate
                    fs.writeFileSync(dataPath, JSON.stringify(data, null, 4))
                    fs.writeFileSync(containerPath, JSON.stringify(containers, null, 4))
                    updateCount = 0
                }

                startDate = nextDate
            }
        }
    }

    Save(UpdateDate=true)
}

function UpdateSearchInfo()
{
    Promise.all(
        data.map (async user => {
            let account = user.id
            let startDate = user.startDate

            if(containers[account] == undefined){
                containers[account] = []
            }

            if (startDate == currentDate) {
                if(isVerbose)
                    console.log(`${account} Already up to date. Skip.`)
                return
            }
            else {
                let updateCount = 1
                while (FormatDate(startDate) < FormatDate(currentDate)){
                    let nextDate = IncreaseDate(startDate, daySkip)
                    if(isVerbose)
                        console.log(`Fetching ${account}, Date = ${startDate} ~ ${nextDate}`)
                    let crawlResult = await new TwitterCrawler(account, startDate, nextDate, isVerbose).CrawlFromAdvancedSearch()
                    crawlResult.map(x => {
                        const isExist = containers[account].filter(ele => ele.tweetId == x.tweetId).length != 0
                        if (!isExist){
                            containers[account].push(x)
                            if(isVerbose)
                                console.log(`update ${x.tweetId} for ${user.id}`)
                            updateCount += 2
                        }
                        else {
	                        // update with weight 1
	                        updateCount += 1
	                    }
                    })

                    // update anyway, force no data stills increase updateCount
                    updateCount += 1

                    if(updateCount > saveDuration){
                        user.startDate = startDate
                        fs.writeFileSync(dataPath, JSON.stringify(data, null, 4))
                        fs.writeFileSync(containerPath, JSON.stringify(containers, null, 4))
                        console.log(`Save Snapshot: ${user.id} ${startDate}`)
                        updateCount = 0
                    }

                    startDate = nextDate
                }
            }
        })
    ).then(res => {
        Save(UpdateDate=true)
    })
} */

async function UpdateUserMainInfo (user) {
	try {
		let account = user.id
		let startDate = user.startDate

		if (containers[account] === undefined) {
			containers[account] = []
		}

		let updateCount = 1
		if (isVerbose) { console.log(`Fetching ${account} MainInfo`) }

		const breakHandler = noEarlyBreak === 'true' ? (instance, resultIds) => resultIds.length === 0 : EarlyBreak
		let crawlResult = await new TwitterCrawler(account, isVerbose, breakHandler).CrawlFromMainPage()

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
		console.log(`${err}`)
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
	).then(res => Save())
}

function UpdateImage () {
	Promise.all(
		data.map(async user => {
			fs.ensureDirSync(`${StoragePath}/${user.id}`)

			const img = containers[user.id].reduce((acc, ele) => {
				if (ele.hasPhoto) { return acc.concat([...ele.photos]) } else { return acc }
			}, [])

			img.map(async x => {
				// remove :orig when saving
				const filename = `${StoragePath}/${user.id}/${x.replace(':orig', '').substring(x.lastIndexOf('/') + 1)}`
				let isDownload = await FetchImage(x, filename)
				if (isDownload && isVerbose) { console.log(`Successfully Download ${x} as ${filename}`) }
			})
		})
	)
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
		t.cell('Twitter Id', d.id)
		t.cell('Create Date', d.createDate)
		t.cell('Start Date', d.startDate)
		t.newRow()
	})

	console.log(t.toString())
}

function UpdateData (isUpdate, updateData) {
	if (isUpdate === 'NULL') {
		console.log('Missing update param.')
		console.log('Wrong Format. Abort.')
		return
	}

	if (updateData === 'NULL') {
		console.log(`updateData = ${JSON.stringify(updateData)}`)
		console.log('Wrong Format. Abort.')
		return
	}

	if (isUpdate) {
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
				break
			}
		}
	} else {
		if (updateData.createDate === 'NULL' || updateData.startDate === 'NULL') {
			console.log(`updateData = ${JSON.stringify(updateData)}`)
			console.log('Wrong Format. Abort.')
			return
		} else {
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
		let rawData = fs.readFileSync(dataPath)
		try {
			data = JSON.parse(rawData)
		} catch (err) {
			console.log(`Failed Parsing ${dataPath}, error = ${err}}`)
			process.exit()
		}
	}

	if (fs.existsSync(containerPath)) {
		let rawContainer = fs.readFileSync(containerPath)
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
			UpdateMainInfoSync()
		} else {
			UpdateMainInfo()
		}
	} else if (mode === 'searchInfo') {
		if (isVerbose) {
			console.log('============================================')
			console.log('             UPDATE SEARCH INFO')
			console.log('============================================')
		}
		if (sync === 'true') {
			// UpdateSearchInfoSync()
		} else {
			// UpdateSearchInfo()
		}
	} else if (mode === 'image') {
		if (isVerbose) {
			console.log('============================================')
			console.log('                UPDATE IMAGE')
			console.log('============================================')
		}
		UpdateImage()
	} else if (mode === 'clear') {
		if (isVerbose) {
			console.log('============================================')
			console.log('                CLEAR DATA')
			console.log('============================================')
		}
		Clear()
	} else if (mode === 'data') {
		const isUpdate = args.update === 'true' || false
		console.log('============================================')
		console.log(`                ${isUpdate ? 'Update DATA' : 'Add     DATA'}`)
		console.log('============================================')
		const updateId = args.id || 'NULL'
		const updateCreateDate = args.createDate || 'NULL'
		const updateStartDate = args.startDate || (isUpdate ? 'NULL' : updateCreateDate) // default set equal to updateCreateDate when mode = add

		const updateData = { id: updateId, createDate: updateCreateDate, startDate: updateStartDate }
		UpdateData(isUpdate, updateData)
	} else if (mode === 'list') {
		if (isVerbose) {
			console.log('============================================')
			console.log('                LIST DATA')
			console.log('============================================')
		}
		ListData()
	} else {
		console.log('Error When Parsing Arguments.')
		console.log('Abort.')
		process.exit()
	}
}
