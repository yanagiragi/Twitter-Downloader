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

    if (argv.overrideConfig) {
        const config = JSON.parse(argv.overrideConfig)
        return Object.assign(config, { argv })
    }

    const useRemoteStorage = argv.useRemoteStorage
    const useShuffle = argv.shuffle
    const mode = argv._

    let storagePath = (useRemoteStorage === 'true' ? path.join(__dirname, '/Storage_Remote') : path.join(__dirname, '/Storage'))
    let dataFolderPath = (useRemoteStorage === 'true' ? path.join(__dirname, '/Storage_Remote') : path.join(__dirname, 'data'))
    let dataPath = path.join(dataFolderPath, 'data.json')
    let processedPath = path.join(dataFolderPath, 'processed.json')
    let corruptedPath = path.join(dataFolderPath, 'corrupted.json')
    let skipContainerPath = path.join(dataFolderPath, 'skip.json')
    let containerPath = path.join(dataFolderPath, 'container.json')

    const currentDate = DateFormat(new Date())
    const remoteStorageCache = useRemoteStorage ? UpdateRemoteStorageCache() : []

    let data = []
    let originalOrder = []
    let processed = []
    let containers = {}
    let skipUrls = []

    if (!argv.outputConfig) {
        fs.ensureDirSync(storagePath)
    }

    if (!argv.overrideData && await !fs.exists(dataPath)) {
        console.error(`${dataPath} does not exists. Abort.`)
        process.exit()
    }

    let overrideData = argv.overrideData
    try {
        if (overrideData) {
            JSON.parse(overrideData)
        }
    }
    catch (error) {
        const filepath = path.join(dataFolderPath, overrideData)
        if (await fs.exists(filepath)) {
            if (argv.verbose) {
                console.error(`Override dataPath to ${filepath}`)
            }
            dataPath = filepath
            overrideData = await fs.readFile(filepath)
        }
    }

    const rawData = overrideData ?? await fs.readFile(dataPath)

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
        console.error(`Failed Parsing dataPath: ${(argv.overrideData ?? dataPath)}, error = ${err}`)
        process.exit()
    }

    var corrupted = []
    if (fs.existsSync(corruptedPath)) {
        const rawCorrupted = await fs.readFile(corruptedPath)
        try {
            corrupted = JSON.parse(rawCorrupted)
        } catch (err) {
            console.error(`Failed Parsing corruptedPath: ${corruptedPath}, error = ${err}`)
            process.exit()
        }
    }

    if (fs.existsSync(processedPath)) {
        const rawProcessed = await fs.readFile(processedPath)
        try {
            processed = JSON.parse(rawProcessed)
            processed = processed.filter(x => !corrupted.includes(x))
        } catch (err) {
            console.error(`Failed Parsing processedPath: ${processedPath}, error = ${err}`)
            process.exit()
        }
    }

    let overrideContainer = argv.overrideContainer
    try {
        if (overrideContainer) {
            JSON.parse(overrideContainer)
        }
    }
    catch (error) {
        const filepath = path.join(dataFolderPath, overrideContainer)
        if (await fs.exists(filepath)) {
            if (argv.verbose) {
                console.error(`Override containerPath to ${filepath}`)
            }
            containerPath = filepath
            overrideContainer = await fs.readFile(filepath)
        }
    }

    const rawContainer = overrideContainer ?? await fs.readFile(containerPath)
    try {
        containers = JSON.parse(rawContainer)
    } catch (err) {
        console.error(`Failed Parsing containerPath: ${containerPath}, error = ${err}`)
        process.exit()
    }

    if (fs.existsSync(skipContainerPath)) {
        const rawContainer = await fs.readFile(skipContainerPath)
        try {
            skipUrls = JSON.parse(rawContainer)
        } catch (err) {
            console.error(`Failed Parsing skipContainerPath: ${skipContainerPath}, error = ${err}`)
            process.exit()
        }
    }

    const config = {
        storagePath,
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

    return Object.assign(config, { argv })
}

async function SaveConfig (config) {

    if (config == null) {
        console.error("Detect config is null. Abort.")
        return
    }

    const mode = config.argv._

    if (config.argv.useRemoteStorage === 'true') {
        console.error('Saving ...')
    }

    if (config.argv.shuffle) {
        config.data.sort((a, b) => config.originalOrder.indexOf(a.id) - config.originalOrder.indexOf(b.id))
    }

    // if (UpdateDate) {
    //     config.data.forEach(x => x.startDate = currentDate)
    // }

    for (const key in config.containers) {
        const ele = config.containers[key]
        ele.map(x => {
            x.timestamp = FormatTwitterTimestamp(x.timestamp)
        })
        ele.sort((a, b) => FormatDate(a.timestamp) < FormatDate(b.timestamp) ? 1 : -1)
    }

    if (config.argv.outputConfig) {
        console.log(JSON.stringify(config))
        return
    }

    if (JSON.stringify(config.data) != JSON.stringify(config.originalData)) {
        if (config.argv.verbose) {
            console.error(`Save ${config.dataPath}.`)
        }
        await fs.writeFile(config.dataPath, JSON.stringify(config.data, null, 4))
    }

    if (JSON.stringify(config.containers) != JSON.stringify(config.originalContainers)) {
        await fs.writeFile(config.containerPath, JSON.stringify(config.containers, null, 4))
        if (config.argv.verbose) {
            console.error(`Save ${config.containerPath}.`)
        }
    }

    if (JSON.stringify(config.processed) != JSON.stringify(config.originalProcessed)) {
        await fs.writeFile(config.processedPath, JSON.stringify(config.processed, null, 4))
        if (config.argv.verbose) {
            console.error(`Save ${config.processedPath}.`)
        }
    }

    if (mode === 'image') {
        await fs.writeFile(config.corruptedPath, JSON.stringify([], null, 4))
        if (config.argv.verbose) {
            console.error(`Save ${config.corruptedPath}.`)
        }
    }

    if (config.argv.verbose) {
        console.error('Save Done.')
    }
}

async function SaveData (config) {
    if (config == null) {
        console.error("Detect config is null. Abort.")
        return
    }
    await fs.writeFile(config.dataPath, JSON.stringify(config.data, null, 4))
    if (config.argv.verbose) {
        console.error(`Save ${config.dataPath}.`)
    }
}

async function SaveContainer (config) {
    if (config == null) {
        console.error("Detect config is null. Abort.")
        return
    }
    await fs.writeFile(config.containerPath, JSON.stringify(config.containers, null, 4))
    if (config.argv.verbose) {
        console.error(`Save ${config.containerPath}.`)
    }
}

exports.LoadConfig = LoadConfig
exports.SaveConfig = SaveConfig
exports.SaveContainer = SaveContainer
exports.SaveData = SaveData