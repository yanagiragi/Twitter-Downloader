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

    const config = await LoadConfig(argv)

    const result = await UpdateImage(config)
    const doneCount = result.filter(Boolean).length

    if (result.length > 0) {
        console.log(`Done/Failed: ${doneCount}/${result.length - doneCount}`)
    }

    if (doneCount > 0) {
        await SaveConfig(config)
    }
}

async function UpdateImage (config) {
    const tasks = []
    for (let i = 0; i < config.data.length; ++i) {
        const user = config.data[i]

        await fs.ensureDir(`${config.StoragePath}/${user.id}`)

        const imgs = config.containers[user.id].reduce((acc, ele) => {
            if (ele.hasPhoto) { return acc.concat([...ele.photos]) } else { return acc }
        }, [])

        for (let j = 0; j < imgs.length; ++j) {
            const img = imgs[j]

            // remove :orig when saving
            const filename = path.join(config.storagePath, user.id, img.replace(':orig', '').substring(img.lastIndexOf('/') + 1))
            const key = path.join(user.id, img.replace(':orig', '').substring(img.lastIndexOf('/') + 1))

            if (!config.argv.useRemoteStorage) {
                const existInCache = config.argv.useProcessedJson && config.processed.includes(key)
                const existInDisk = await fs.exists(filename)
                if (existInCache || existInDisk) {
                    continue
                }
            }
            else if (remoteStorageCache.includes(filename)) {
                continue
            }

            if (!config.skipUrls.includes(img)) {
                tasks.push({ index: tasks.length, img: img, filename: filename, key: key })
            }
        }
    }

    return pMap(tasks, async task => {
        if (config.argv.verbose) {
            console.error(`Running ${task.index}/${tasks.length}: ${task.img}`)
        }

        const result = await FetchImage(task.img, task.filename)
        if (result) {
            config.processed.push(task.key)
            console.log(`Successfully Download ${task.img} as ${task.filename}`)
        }

        return result
    }, { concurrency: 10 })
}