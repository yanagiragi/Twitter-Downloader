const { TwitterCrawler } = require('../..')
const { LoadConfig, SaveConfig, SaveContainer } = require('../config')
const { EarlyBreak, NoEarlyBreak, Dispatch } = require('../utils')

module.exports = {
    command: 'media',
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
            description: '',
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
            default: true,
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

    const configs = await LoadConfig(argv)

    await Dispatch(argv, configs, UpdateUserMediaInfo)

    await SaveConfig(argv, configs)
}

async function UpdateUserMediaInfo (argv, configs, user) {
    const account = user.id

    if (configs.containers[account] === undefined) {
        configs.containers[account] = []
    }

    let updateCount = 1
    if (argv.verbose) { console.error(`Fetching ${account} MediaInfo`) }

    let earlyBreakCount = 0
    const breakHandler = argv.deep
        ? (instance, resultContainers) => {
            if (NoEarlyBreak(instance, resultContainers)) {
                earlyBreakCount += 1
                console.error(`Detect can break in deep mode: ${earlyBreakCount}/${argv.deepTolerance}`)
            }
            if (earlyBreakCount >= argv.deepTolerance) {
                return true
            }
            return false
        }
        : (instance, resultContainers) => EarlyBreak(instance, resultContainers, configs)

    try {
        const crawler = new TwitterCrawler(account, argv.cookie, argv.verbose, breakHandler, argv.maxDepth)
        crawler.displayFetchedTweets = argv.displayFetchedTweets
        if (argv.overrideCursor) {
            crawler.bottomCursor = argv.overrideCursor
        }

        const [crawlResult, crawlRetweets] = await crawler.CrawlFromMedia()

        crawlResult.map(x => {
            const isExist = configs.containers[account].filter(ele => ele.tweetId === x.tweetId).length !== 0
            if (!isExist) {
                configs.containers[account].push(x)
                if (argv.verbose) { console.error(`[MediaInfo] Add https://twitter.com/${account}/status/${x.tweetId}`) }
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