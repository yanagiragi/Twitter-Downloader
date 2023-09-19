const fs = require('fs-extra')
const path = require('path')
const { DateFormat, FormatDate, FormatTwitterTimestamp } = require('./utils')

function UpdateRemoteStorageCache () {
    console.error('Updating Remote Storage Cache ...')
    const res = fs.readdirSync(StoragePath)
        .filter(x => x.includes('.json') === false) // filter container.json and data.json
        .map(x => fs.readdirSync(path.join(StoragePath, x))
            .map(ele => path.join(StoragePath, x, ele)))
        .flat()
    console.error('Updating Remote Storage Cache Done, length = ' + res.length)
    return res
}

async function LoadConfig (argv) {
    const useRemoteStorage = argv.useRemoteStorage
    const useShuffle = argv.shuffle
    const mode = argv._

    const StoragePath = (useRemoteStorage === 'true' ? path.join(__dirname, '/Storage_Remote') : path.join(__dirname, '/Storage'))
    const dataFolderPath = (useRemoteStorage === 'true' ? path.join(__dirname, '/Storage_Remote') : path.join(__dirname, 'data'))
    const dataPath = path.join(dataFolderPath, 'data.json')
    const processedPath = path.join(dataFolderPath, 'processed.json')
    const corruptedPath = path.join(dataFolderPath, 'corrupted.json')
    const containerPath = path.join(dataFolderPath, 'container.json')
    const skipContainerPath = path.join(dataFolderPath, 'skip.json')

    const currentDate = DateFormat(new Date())
    const remoteStorageCache = useRemoteStorage ? UpdateRemoteStorageCache() : []

    let data = []
    let originalOrder = []
    let processed = []
    let containers = {}
    let skipUrls = []

    fs.ensureDirSync(StoragePath)

    if (await !fs.exists(dataPath)) {
        console.error(`${dataPath} does not exists. Abort.`)
        process.exit()
    }

    const rawData = await fs.readFile(dataPath)
    try {
        data = JSON.parse(rawData)
        originalOrder = data.map(x => x.id)

        if (useShuffle) {
            data = data.sort(() => Math.random() - 0.5) // shuffle the array
        }

        if (mode !== 'list') {
            data = data.filter(x => typeof x.ignore === 'undefined' && x.ignore !== true)
        }
    } catch (err) {
        console.error(`Failed Parsing ${dataPath}, error = ${err}`)
        process.exit()
    }

    var corrupted = []
    if (fs.existsSync(corruptedPath)) {
        const rawCorrupted = await fs.readFile(corruptedPath)
        try {
            corrupted = JSON.parse(rawCorrupted)
        } catch (err) {
            console.error(`Failed Parsing ${corruptedPath}, error = ${err}`)
            process.exit()
        }
    }

    if (fs.existsSync(processedPath)) {
        const rawProcessed = await fs.readFile(processedPath)
        try {
            processed = JSON.parse(rawProcessed)
            processed = processed.filter(x => !corrupted.includes(x))
        } catch (err) {
            console.error(`Failed Parsing ${processedPath}, error = ${err}`)
            process.exit()
        }
    }

    if (fs.existsSync(containerPath)) {
        const rawContainer = await fs.readFile(containerPath)
        try {
            containers = JSON.parse(rawContainer)
        } catch (err) {
            console.error(`Failed Parsing ${containerPath}, error = ${err}`)
            process.exit()
        }
    }

    if (fs.existsSync(skipContainerPath)) {
        const rawContainer = await fs.readFile(skipContainerPath)
        try {
            skipUrls = JSON.parse(rawContainer)
        } catch (err) {
            console.error(`Failed Parsing ${skipContainerPath}, error = ${err}`)
            process.exit()
        }
    }

    return {
        StoragePath,
        dataFolderPath,
        dataPath,
        processedPath,
        corruptedPath,
        containerPath,
        skipContainerPath,
        currentDate,
        remoteStorageCache,
        data,
        originalOrder,
        processed,
        containers,
        skipUrls,
        originalData: JSON.parse(JSON.stringify(data)), // deep copy
        originalContainers: JSON.parse(JSON.stringify(containers)), // deep copy
        originalProcessed: JSON.parse(JSON.stringify(processed)) // deep copy
    }
}

async function SaveConfig (argv, configs) {

    if (argv == null) {
        console.error("Detect argv is null. Abort.")
        return
    }

    if (configs == null) {
        console.error("Detect configs is null. Abort.")
        return
    }

    const mode = argv._

    if (argv.useRemoteStorage === 'true') {
        console.error('Saving ...')
    }

    if (argv.shuffle) {
        configs.data.sort((a, b) => configs.originalOrder.indexOf(a.id) - configs.originalOrder.indexOf(b.id))
    }

    // if (UpdateDate) {
    //     config.data.forEach(x => x.startDate = currentDate)
    // }

    for (const key in configs.containers) {
        const ele = configs.containers[key]
        ele.map(x => {
            x.timestamp = FormatTwitterTimestamp(x.timestamp)
        })
        ele.sort((a, b) => FormatDate(a.timestamp) < FormatDate(b.timestamp) ? 1 : -1)
    }

    if (JSON.stringify(configs.data) != JSON.stringify(configs.originalData)) {
        if (argv.verbose) {
            console.error(`Save ${configs.dataPath}.`)
        }
        await fs.writeFile(configs.dataPath, JSON.stringify(configs.data, null, 4))
    }

    if (JSON.stringify(configs.containers) != JSON.stringify(configs.originalContainers)) {
        if (argv.verbose) {
            console.error(`Save ${configs.containerPath}.`)
        }
        await fs.writeFile(configs.containerPath, JSON.stringify(configs.containers, null, 4))
    }

    if (JSON.stringify(configs.processed) != JSON.stringify(configs.originalProcessed)) {
        if (argv.verbose) {
            console.error(`Save ${configs.processedPath}.`)
        }
        await fs.writeFile(configs.processedPath, JSON.stringify(configs.processed, null, 4))
    }

    if (mode === 'image') {
        if (argv.verbose) {
            console.error(`Save ${configs.corruptedPath}.`)
        }
        await fs.writeFile(configs.corruptedPath, JSON.stringify([], null, 4))
    }

    if (argv.verbose) {
        console.error('Save Done.')
    }
}

async function SaveData (argv, configs) {
    if (configs == null) {
        console.error("Detect configs is null. Abort.")
        return
    }
    await fs.writeFile(configs.dataPath, JSON.stringify(configs.data, null, 4))
    if (argv.verbose) {
        console.error(`Save ${configs.dataPath}.`)
    }
}

async function SaveContainer (argv, configs) {
    if (configs == null) {
        console.error("Detect configs is null. Abort.")
        return
    }
    await fs.writeFile(configs.containerPath, JSON.stringify(configs.containers, null, 4))
    if (argv.verbose) {
        console.error(`Save ${configs.containerPath}.`)
    }
}

exports.LoadConfig = LoadConfig
exports.SaveConfig = SaveConfig
exports.SaveContainer = SaveContainer
exports.SaveData = SaveData