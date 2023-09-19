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
        .option('deep', {
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
        console.error('             UPDATE  SEARCH INFO')
        console.error('============================================')
        console.error(`Deep = ${argv.deep}`)
    }

    const configs = await LoadConfig(argv)

    if (argv.sync) {
        await UpdateSearchInfoSync(argv, configs)
    } else {
        await UpdateSearchInfo(argv, configs)
    }

    SaveConfig(argv, configs)
}


async function UpdateUserSearchInfo (argv, configs, user) {
    const isVerbose = argv.verbose
    const account = user.id
    let startDate = user.startDate

    if (configs.containers[account] === undefined) {
        configs.containers[account] = []
    }

    if (startDate === configs.currentDate) {
        if (argv.verbose) {
            console.error(`${account} Already up to date. Skip.`)
        }
        return false
    } else {
        let updateCount = 1
        const crawler = new TwitterCrawler(account, argv.cookie, argv.verbose, () => false, argv.maxDepth)
        while (FormatDate(startDate) < FormatDate(configs.currentDate)) {
            const nextDate = IncreaseDate(startDate, argv.daySkip)
            if (argv.verbose) {
                console.error(`Fetching ${account}, Date = ${startDate} ~ ${nextDate}`)
            }
            try {
                const crawlResult = await crawler.CrawlFromAdvancedSearch(startDate, nextDate)

                const tweetResult = crawlResult[0]
                tweetResult.map(x => {
                    const isExist = configs.containers[account].filter(ele => ele.tweetId === x.tweetId).length !== 0
                    if (!isExist) {
                        configs.containers[account].push(x)
                        if (argv.verbose) {
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

                if (updateCount > argv.saveDuration) {
                    user.startDate = startDate
                    SaveData(configs)
                    SaveContainer(configs)
                    console.error(`Save Snapshot: ${user.id} ${startDate}`)
                    updateCount = 0
                }

                startDate = nextDate

                if (argv.useOneShot) {
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

async function UpdateSearchInfoSync (argv, configs) {
    for (const user of configs.data) {
        const hasChange = await UpdateUserSearchInfo(argv, configs, user)
        if (argv.useOneShot && hasChange) {
            break
        }
    }
}

async function UpdateSearchInfo (argv, configs) {
    const tasks = configs.data.map(user => UpdateUserSearchInfo(argv, configs, user))
    return Promise.all(tasks)
}
