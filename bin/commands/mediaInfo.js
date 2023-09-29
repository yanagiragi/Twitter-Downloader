const { TwitterCrawler } = require('../..')
const { LoadConfig, SaveConfig, SaveContainer } = require('../config')
const { EarlyBreak, NoEarlyBreak, Dispatch } = require('../utils')

module.exports = {
    command: 'mediaInfo',
    builder,
    handler
}

/** @param {import('yargs').Argv} yargs */
function builder (yargs) {
    yargs
        .usage('\nCommand Description: Fetch tweets from media')
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
        .option('overrideContainer', {
            default: null,
            description: 'An option to override container.json by args',
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
        console.error('             UPDATE  MEDIA  INFO')
        console.error('============================================')
        console.error(`Deep = ${argv.deep}`)
    }

    const config = await LoadConfig(argv)

    await Dispatch(config, UpdateUserMediaInfo)

    await SaveConfig(config)
}

async function UpdateUserMediaInfo (config, user) {
    const account = user.id

    if (config.containers[account] === undefined) {
        config.containers[account] = []
    }

    if (config.argv.verbose) {
        console.error(`Fetching ${account} MediaInfo`)
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
        crawler.saveSnapShot = async () => SaveContainer(config)
        crawler.bottomCursor = config.argv.overrideCursor ?? ''

        const [crawlResult, crawlRetweets] = await crawler.CrawlFromMedia()

        crawlResult.map(x => {
            const isExist = config.containers[account].filter(ele => ele.tweetId === x.tweetId).length !== 0
            if (!isExist) {
                config.containers[account].push(x)
                if (config.argv.verbose) {
                    console.error(`[MediaInfo] Add https://twitter.com/${account}/status/${x.tweetId}`)
                }
            }
        })

    } catch (err) {
        console.error(`Error occurs on ${account}: ${err.message}`)
        console.error(err.stack)
    }
}