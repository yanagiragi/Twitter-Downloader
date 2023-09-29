const { TwitterCrawler } = require('../..')
const { LoadConfig, SaveConfig, SaveContainer } = require('../config')
const fs = require('fs-extra')

module.exports = {
    command: 'mainInfo',
    builder,
    handler
}

/** @param {import('yargs').Argv} yargs */
function builder (yargs) {
    yargs
        .usage('\nCommand Description: Fetch tweets from main page waterfall')
        .option('sync', {
            default: false,
            description: 'Fetch next tweet only if previous tweet is completed',
            type: 'boolean',
        })
        .option('deep', {
            default: false,
            description: 'Fetch all tweets in waterfall until there is no tweets. Set to false implies to fetch until there is no new tweets',
            type: 'boolean',
        })
        .option('deepTolerance', {
            default: 1,
            description: 'Fetch all tweets in waterfall until there is no tweets `n` times then break',
            type: 'number',
        })
        .option('useRemoteStorage', {
            default: false,
            description: 'Affects default path when data stores. Mount remote storage to `Storage_Remote` folder before enable this flag',
            type: 'boolean',
        })
        .option('shuffle', {
            default: false,
            description: 'Shuffle the input before dispatch crawls. Does not affect the order saved in data.json',
            type: 'boolean',
        })
        .option('verbose', {
            default: true,
            description: 'Enable detailed outputs',
            type: 'boolean',
        })
        .option('displayFetchedTweets', {
            default: false,
            description: 'Enable detailed outputs when fetching',
            type: 'boolean',
        })
        .option('saveDuration', {
            default: 50,
            description: 'How often to save container.json after numbers of tweet is fetched (In case there is a mis-catched error)',
            type: 'integer',
        })
        .option('maxDepth', {
            default: 1e9,
            description: 'Max depth to crawl in main page waterfall',
            type: 'integer',
        })
        .option('overrideCursor', {
            default: null,
            description: 'Override initial bottom cursor of twitter crawler',
            type: 'string',
        })
        .option('overrideData', {
            default: null,
            description: 'An option to override data.json by args',
            type: 'string',
        })
        .option('overrideConfig', {
            default: null,
            description: 'An option to override whole config by args',
            type: 'string',
        })
        .option('overrideContainer', {
            default: null,
            description: 'An option to override container.json by args',
            type: 'string',
        })
        .option('outputConfig', {
            default: false,
            description: 'An option to output whole config instead saving it to local files',
            type: 'boolean',
        })
        .option('cookie', {
            demandOption: true,
            description: 'Cookie of active twitter session',
            type: 'string',
        })
        .alias('d', 'deep')
        .alias('s', 'sync')
        .alias('c', 'cookie')
}

/**
 * @param {*} argv
 */
async function handler (argv) {

    if (argv.verbose) {
        console.error('============================================')
        console.error('             UPDATE  MAIN  INFO')
        console.error('============================================')
        console.error(`Deep = ${argv.deep}`)
    }

    const config = await LoadConfig(argv)

    if (config.argv.sync) {
        await UpdateMainInfoSync(config)
    } else {
        await UpdateMainInfo(config)
    }

    await SaveConfig(config)
}

function NoEarlyBreak (instance, resultContainers) {
    const [tweetContainer, retweetContainer] = resultContainers
    return tweetContainer.length === 0 && retweetContainer.length === 0
}

function EarlyBreak (instance, resultContainers, config) {
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
        const isExist = config.containers[instance.account].filter(ele => ele.tweetId === x.tweetId).length !== 0
        if (isExist) { return acc + 1 }
        return acc
    }, 0)

    return (duplicatedCount === tweetContainer.length)
}

async function UpdateUserMainInfo (config, user) {
    const account = user.id

    if (config.containers[account] === undefined) {
        config.containers[account] = []
    }

    if (config.argv.verbose) {
        console.error(`Fetching ${account} MainInfo`)
    }

    let earlyBreakCount = 0
    const breakHandler = config.argv.deep
        ? (instance, resultContainers) => {
            if (NoEarlyBreak(instance, resultContainers)) {
                earlyBreakCount += 1
                console.error(`Detect can break in deep mode: ${earlyBreakCount}/${config.argv.deepTolerance}`)
            }
            if (earlyBreakCount >= config.argv.deepTolerance) {
                return true
            }
            return false
        }
        : (instance, resultContainers) => EarlyBreak(instance, resultContainers, config)

    try {
        const crawler = new TwitterCrawler(account, config.argv.cookie, config.argv.verbose, breakHandler, config.argv.maxDepth)
        crawler.displayFetchedTweets = config.argv.displayFetchedTweets
        crawler.saveDuration = config.argv.saveDuration
        crawler.saveSnapShot = async () => SaveContainer(argv, config)
        crawler.bottomCursor = config.argv.overrideCursor ?? ''

        const [crawlResult, crawlRetweets] = await crawler.CrawlFromMainPage()

        crawlResult.map(x => {
            const isExist = config.containers[account].filter(ele => ele.tweetId === x.tweetId).length !== 0
            if (!isExist) {
                config.containers[account].push(x)
                if (config.argv.verbose) {
                    console.error(`[MainInfo] Add https://twitter.com/${account}/status/${x.tweetId}`)
                }
            }
        })

    } catch (err) {
        console.error(`Error occurs on ${account}: ${err.message}`)
        console.error(err.stack)
    }
}

async function UpdateMainInfoSync (config) {
    for (const user of config.data) {
        await UpdateUserMainInfo(config, user)
    }
}

async function UpdateMainInfo (config) {
    const tasks = config.data.map(user => UpdateUserMainInfo(config, user))
    return Promise.all(tasks).catch(console.error)
}
