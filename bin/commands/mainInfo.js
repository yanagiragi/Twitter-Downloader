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
        .usage('Fetch tweets from main page waterfall')
        .option('sync', {
            default: false,
            type: 'boolean',
        })
        .option('deep', {
            default: false,
            type: 'boolean',
        })
        .option('useRemoteStorage', {
            default: false,
            type: 'boolean',
        })
        .option('shuffle', {
            default: false,
            type: 'boolean',
        })
        .option('verbose', {
            default: true,
            type: 'boolean',
        })
        .option('saveDuration', {
            default: 50,
            type: 'integer',
        })
        .option('maxDepth', {
            default: 1e9,
            type: 'integer',
        })
        .option('cookie', {
            demandOption: true,
            type: 'string',
        })
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

    const breakHandler = configs.deep
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
        console.error(err.stack)
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
