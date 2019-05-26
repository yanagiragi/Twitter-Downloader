#!/usr/bin/env node
const fs = require('fs-extra')
const minimist = require('minimist')
const { TwitterCrawler } = require('..')
const { DateFormat, FormatDate, IncreaseDate, FetchImage, FormatTwitterTimestamp } = require('./utils')

const daySkip = 1
const saveDuration = 50

const args = minimist(process.argv.slice(2));

const mode = args.mode || "info"

const StoragePath = __dirname + '/Storage'
const dataPath = __dirname + '/data/data.json'
const containerPath = __dirname + '/data/container.json'
const currentDate = DateFormat(new Date())

const isVerbose = true

function EarlyBreak(instance, resultIds)
{
    // return false if resultIds.length is 0
    // possibles conditions:
    // 1. there is no more uncrawled data. in this case, next iteration will stop automatically
    // 2. the return data are all retweets, in this case, return false is too force it not to early break
    if (resultIds.length == 0){
        return false
    }

    let duplicatedCount = resultIds.reduce((acc, x) => {
        const isExist = containers[instance.account].filter(ele => ele.tweetId == x.tweetId).length != 0
        if (isExist)
            return acc + 1
        return acc
    }, 0)

    if (duplicatedCount == resultIds.length)
        return true
    else
        return false
}

function Save(UpdateDate=false)
{
	if(UpdateDate){
        data.map(x => x.startDate = currentDate)
	}

	for(let key in containers){
		let ele = containers[key]
		ele.map(x => x.timestamp = FormatTwitterTimestamp(x.timestamp))
	    ele.sort((a, b) => FormatDate(a.timestamp) < FormatDate(b.timestamp) ? 1 : -1)
	}
    
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 4))
    
    fs.writeFileSync(containerPath, JSON.stringify(containers, null, 4))
    
    if(isVerbose){
    	console.log(`Done.`)
	}
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
                                console.log(`update ${x.tweetId}`)
                            updateCount += 1
                        }
                    })

                    if(updateCount > saveDuration){
                        data.map(x => x.startDate = startDate)
                        fs.writeFileSync(dataPath, JSON.stringify(data, null, 4))
                        fs.writeFileSync(containerPath, JSON.stringify(containers, null, 4))
                        updateCount = 0
                    }

                    startDate = nextDate
                }
            }
        })
    ).then(res => {
        Save(UpdateDate=true)
    })    
}

function UpdateMainInfo()
{
    Promise.all(
        data.map (async user => {
            let account = user.id
            let startDate = user.startDate
            
            if(containers[account] == undefined){
                containers[account] = []
            }
            
            let updateCount = 1
            if(isVerbose)
                console.log(`Fetching ${account} MainInfo`)
            let crawlResult = await new TwitterCrawler(account, startDate, startDate,isVerbose, EarlyBreak).CrawlFromMainPage()

            crawlResult.map(x => {
                const isExist = containers[account].filter(ele => ele.tweetId == x.tweetId).length != 0
                if (!isExist){
                    containers[account].push(x)
                    if(isVerbose)
                        console.log(`update ${x.tweetId}`)
                    updateCount += 1
                }
            })

            if(updateCount > saveDuration){
                fs.writeFileSync(containerPath, JSON.stringify(containers, null, 4))
                updateCount = 0
            }
        })
    ).then(res => {
    	Save()
    })
}

function UpdateImage()
{
    Promise.all(
        data.map (async user => {
            fs.ensureDirSync(`${StoragePath}/${user.id}`)

            const img = containers[user.id].reduce((acc, ele) => {
                if (ele.hasPhoto)
                    return acc.concat([...ele.photos])
                else
                    return acc
            }, [])

            img.map(async x => {
                let isDownload = await FetchImage(x, `${StoragePath}/${user.id}/${x.substring(x.lastIndexOf('/')+1)}`)
                if (isDownload && isVerbose)
                    console.log(`Successfully Download ${x}.`)
            })
        })
    )
}

if (require.main === module) {

    fs.ensureDirSync(StoragePath)

    var data = []
    if (!fs.existsSync(dataPath)){
        console.log(`${dataPath} does not exists. Abort.`)
        process.exit()
    }
    else {
        let rawData = fs.readFileSync(dataPath)
        try {
            data = JSON.parse(rawData)
        }
        catch(err) {
            console.log(`Failed Parsing ${dataPath}, error = ${err}}`)
            process.exit()
        }
    }

    var containers = {}
    if(fs.existsSync(containerPath)){
        let rawContainer = fs.readFileSync(containerPath)
        try {
            containers = JSON.parse(rawContainer)
        }
        catch(err) {
            console.log(`Failed Parsing ${containerPath}, error = ${err}}`)
            process.exit()
        }
    }

    if(mode == 'mainInfo'){
        console.log("============================================")
        console.log("             UPDATE  MAIN  INFO")
        console.log("============================================")
        UpdateMainInfo()
    }

    else if (mode == "searchInfo"){
        console.log("============================================")
        console.log("             UPDATE SEARCH INFO")
        console.log("============================================")
        UpdateSearchInfo()
    }
    else if(mode == "image"){
        console.log("============================================")
        console.log("                UPDATE IMAGE")
        console.log("============================================")
        UpdateImage()
    }
    else {
        console.log("Error When Parsing Arguments.")
        console.log("Abort.")
        process.exit()
    }
    
}
