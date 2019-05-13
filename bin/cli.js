#!/usr/bin/env node
const fs = require('fs-extra')
const minimist = require('minimist')
const { TwitterCrawler } = require('..')
const { DateFormat, FormatDate, IncreaseDate, FetchImage } = require('./utils')

const daySkip = 7
const saveDuration = 50

const args = minimist(process.argv.slice(2));

const mode = args.mode || "info"

const StoragePath = __dirname + '/Storage'
const dataPath = __dirname + '/data/data.json'
const containerPath = __dirname + '/data/container.json'
const currentDate = DateFormat(new Date())

function UpdateInfo()
{
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
                while (FormatDate(startDate) < FormatDate(currentDate)){
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

                    if(updateCount > saveDuration){
                        data.map(x => x.startDate = startDate)
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
                if (isDownload)
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

    if (mode == "info"){
        console.log("============================================")
        console.log("                UPDATE INFO")
        console.log("============================================")
        UpdateInfo()
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