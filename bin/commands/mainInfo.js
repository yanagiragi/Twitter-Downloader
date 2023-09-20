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

    const configs = await LoadConfig(argv)

    if (argv.sync) {
        await UpdateMainInfoSync(argv, configs)
    } else {
        await UpdateMainInfo(argv, configs)
    }

    await SaveConfig(argv, configs)
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

async function UpdateUserMainInfo (argv, configs, user) {
    const account = user.id

    if (configs.containers[account] === undefined) {
        configs.containers[account] = []
    }

    let updateCount = 1
    if (argv.verbose) { console.error(`Fetching ${account} MainInfo`) }

    const breakHandler = argv.deep
        ? (instance, resultContainers) => NoEarlyBreak(instance, resultContainers)
        : (instance, resultContainers) => EarlyBreak(instance, resultContainers, configs)

    try {
        const [crawlResult, crawlRetweets] = await new TwitterCrawler(account, argv.cookie, argv.verbose, breakHandler, argv.maxDepth).CrawlFromMainPage()

        crawlResult.map(x => {
            const isExist = configs.containers[account].filter(ele => ele.tweetId === x.tweetId).length !== 0
            if (!isExist) {
                configs.containers[account].push(x)
                if (argv.verbose) { console.error(`update https://twitter.com/${account}/status/${x.tweetId}`) }
                updateCount += 1
            }
        })

        if (updateCount > argv.saveDuration) {
            await SaveContainer(argv, configs)
            updateCount = 0
        }
    } catch (err) {
        console.error(`Error occurs on ${account}: ${err.message}`)
        if (err.message.toString().trim() != 'Rate limit exceeded') {
            console.error(err.stack)
        }
    }
}

async function UpdateMainInfoSync (argv, configs) {
    for (const user of configs.data) {
        await UpdateUserMainInfo(argv, configs, user)
    }
}

async function UpdateMainInfo (argv, configs) {
    const tasks = configs.data.map(user => UpdateUserMainInfo(argv, configs, user))
    return Promise.all(tasks).catch(console.error)
}
