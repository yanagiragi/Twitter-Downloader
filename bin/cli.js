#!/usr/bin/env node
const fs = require('fs-extra')
const minimist = require('minimist')
const { TwitterTweet, TwitterCrawler } = require('..')
const { DateFormat, IncreaseDate } = require('./utils')

const daySkip = 7

const StoragePath = __dirname + '/Storage'
const dataPath = __dirname + '/data/data.json'
const containerPath = __dirname + '/data/container.json'
const currentDate = DateFormat(new Date())

if (require.main === module) {

    fs.ensureDirSync(StoragePath)

    let data = []
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

    let containers = {}
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

    Promise.all(
        data.map (async user => {
            let account = user.id
            let startDate = user.startDate
            
            if(containers[account] == undefined){
                containers[account] = []
            }
    
            if (startDate == currentDate) {
                console.log(`${account} Already up to date. Skip.`)
                return 
            }
            else {
                let updateCount = 1
                while (startDate < currentDate){
                    let nextDate = IncreaseDate(startDate, daySkip)
                    console.log(`Fetching ${account}, Date = ${startDate} ~ ${nextDate}`)
                    let crawlResult = await new TwitterCrawler(account, startDate, nextDate).Crawl()
                    crawlResult.map(x => {
                        const isExist = containers[account].filter(ele => ele.tweetId == x.tweetId).length != 0
                        if (!isExist){
                            containers[account].push(x)
                            console.log(`update ${x.tweetId}`)
                            updateCount += 1
                        }
                    })

                    if(updateCount > 50 || updateCount % 50 == 0){
                        fs.writeFileSync(dataPath, JSON.stringify(data, null, 4))
                        fs.writeFileSync(containerPath, JSON.stringify(containers, null, 4))
                        updateCount = 0
                    }

                    startDate = nextDate
                }
                
                return 
            }
        })
    ).then(res => {
        data.map(x => x.startDate = currentDate)
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 4))
        fs.writeFileSync(containerPath, JSON.stringify(containers, null, 4))
        console.log(`Done.`)
    })
}