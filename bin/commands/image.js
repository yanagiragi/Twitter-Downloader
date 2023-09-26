const { FetchImage } = require('../utils')
const { LoadConfig, SaveConfig } = require('../config')
const fs = require('fs-extra')
const path = require('path')
const pMap = require('p-map')

module.exports = {
    command: 'image',
    builder,
    handler
}

/** @param {import('yargs').Argv} yargs */
function builder (yargs) {
    yargs
        .usage('Fetch images in container.json')
        .option('useRemoteStorage', {
            default: false,
            type: 'boolean',
        })
        .option('useProcessedJson', {
            default: true,
            type: 'boolean',
        })
        .option('verbose', {
            default: true,
            type: 'boolean',
        })

}

/**
 * @param {*} argv
 */
async function handler (argv) {

    if (argv.verbose) {
        console.error('============================================')
        console.error('             UPDATE  IMAGE')
        console.error('============================================')
    }

    const configs = await LoadConfig(argv)

    const result = await UpdateImage(argv, configs)
    const doneCount = result.filter(Boolean).length

    if (result.length > 0) {
        console.log(`Done/Failed: ${doneCount}/${result.length - doneCount}`)
    }

    if (doneCount > 0) {
        await SaveConfig(argv, configs)
    }
}

async function UpdateImage (argv, configs) {
    const tasks = []
    for (let i = 0; i < configs.data.length; ++i) {
        const user = configs.data[i]

        await fs.ensureDir(`${configs.StoragePath}/${user.id}`)

        const imgs = configs.containers[user.id].reduce((acc, ele) => {
            if (ele.hasPhoto) { return acc.concat([...ele.photos]) } else { return acc }
        }, [])

        for (let j = 0; j < imgs.length; ++j) {
            const img = imgs[j]

            // remove :orig when saving
            const filename = path.join(configs.StoragePath, user.id, img.replace(':orig', '').substring(img.lastIndexOf('/') + 1))
            const key = path.join(user.id, img.replace(':orig', '').substring(img.lastIndexOf('/') + 1))

            if (!argv.useRemoteStorage) {
                const existInCache = argv.useProcessedJson && configs.processed.includes(key)
                const existInDisk = await fs.exists(filename)
                if (existInCache || existInDisk) {
                    continue
                }
            }
            else if (remoteStorageCache.includes(filename)) {
                continue
            }

            if (!configs.skipUrls.includes(img)) {
                tasks.push({ index: tasks.length, img: img, filename: filename, key: key })
            }
        }
    }

    return pMap(tasks, async task => {
        if (argv.verbose) {
            console.error(`Running ${task.index}/${tasks.length}: ${task.img}`)
        }

        const result = await FetchImage(task.img, task.filename)
        if (result) {
            configs.processed.push(task.key)
            console.log(`Successfully Download ${task.img} as ${task.filename}`)
        }

        return result
    }, { concurrency: 10 })
}