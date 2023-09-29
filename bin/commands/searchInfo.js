const { TwitterCrawler } = require('../..')
const { LoadConfig, SaveConfig, SaveData, SaveContainer } = require('../config')
const { FormatDate, IncreaseDate } = require('../utils')

module.exports = {
    command: 'searchInfo',
    builder,
    handler
}

/** @param {import('yargs').Argv} yargs */
function builder (yargs) {
    yargs
        .usage('Fetch tweets from advanced search')
        .option('sync', {
            default: false,
            type: 'boolean',
        })
        .option('useRemoteStorage', {
            default: false,
            type: 'boolean',
        })
        .option('oneShot', {
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
        .option('daySkip', {
            default: 1,
            type: 'integer',
        })
        .option('maxDepth', {
            default: 50,
            type: 'integer',
        })
        .option('overrideData', {
            default: null,
            type: 'string',
        })
        .option('overrideConfig', {
            default: null,
            type: 'string',
        })
        .option('overrideContainer', {
            default: null,
            description: 'An option to override container.json by args',
            type: 'string',
        })
        .option('outputConfig', {
            default: false,
            type: 'boolean',
        })
        .option('cookie', {
            demandOption: true,
            type: 'string',
        })
        .alias('s', 'sync')
        .alias('c', 'cookie')
}

/**
 * @param {*} argv
 */
async function handler (argv) {

    if (argv.verbose) {
        console.error('============================================')
        console.error('             UPDATE  SEARCH INFO')
        console.error('============================================')
    }

    const config = await LoadConfig(argv)

    if (config.argv.sync) {
        await UpdateSearchInfoSync(config)
    } else {
        await UpdateSearchInfo(config)
    }

    await SaveConfig(config)
}


async function UpdateUserSearchInfo (config, user) {

    const account = user.id
    let startDate = user.startDate

    if (config.containers[account] === undefined) {
        config.containers[account] = []
    }

    if (startDate === config.currentDate) {
        if (config.argv.verbose) {
            console.error(`${account} Already up to date. Skip.`)
        }
        return false
    } else {
        let updateCount = 1
        const crawler = new TwitterCrawler(account, config.argv.cookie, config.argv.verbose, () => false, config.argv.maxDepth)
        while (FormatDate(startDate) < FormatDate(config.currentDate)) {
            const nextDate = IncreaseDate(startDate, config.argv.daySkip)
            if (config.argv.verbose) {
                console.error(`Fetching ${account}, Date = ${startDate} ~ ${nextDate}`)
            }
            try {
                const crawlResult = await crawler.CrawlFromAdvancedSearch(startDate, nextDate)

                const tweetResult = crawlResult[0]
                tweetResult.map(x => {
                    const isExist = config.containers[account].filter(ele => ele.tweetId === x.tweetId).length !== 0
                    if (!isExist) {
                        config.containers[account].push(x)
                        if (config.argv.verbose) {
                            console.error(`add https://twitter.com/${account}/status/${x.tweetId} into ${user.id}`)
                        }
                        // update with double weight when new tweet is found
                        updateCount += 2
                    }

                    // update with weight 1
                    updateCount += 1
                })

                // update anyway, force no data stills increase updateCount
                updateCount += 1

                if (updateCount > config.argv.saveDuration) {
                    user.startDate = startDate
                    await SaveData(argv, config)
                    await SaveContainer(argv, config)
                    console.error(`Save Snapshot: ${user.id} ${startDate}`)
                    updateCount = 0
                }

                startDate = nextDate

                if (config.argv.useOneShot) {
                    break
                }

            } catch (err) {
                console.error(`Error occurs on ${account}: ${err.message}`)
                break
            }

            // update anyway, force to save current date when error occurs
            user.startDate = startDate
        }
    }

    user.startDate = startDate
    return true
}

async function UpdateSearchInfoSync (config) {
    for (const user of config.data) {
        const hasChange = await UpdateUserSearchInfo(config, user)
        if (config.argv.useOneShot && hasChange) {
            break
        }
    }
}

async function UpdateSearchInfo (config) {
    const tasks = config.data.map(user => UpdateUserSearchInfo(config, user))
    return Promise.all(tasks)
}
