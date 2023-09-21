const { config } = require('yargs')
const { LoadConfig, SaveData } = require('../config')

module.exports = {
    command: 'data',
    builder,
    handler
}

/** @param {import('yargs').Argv} yargs */
function builder (yargs) {
    yargs
        .usage('Reset currentData in data.json')
        .option('verbose', {
            default: true,
            type: 'boolean',
        })
        .option('id', {
            demandOption: true,
            type: 'string',
        })
        .option('createDate', {
            default: 'NULL',
            type: 'string',
        })
        .option('startDate', {
            default: 'NULL',
            type: 'string',
        })

}

/**
 * @param {*} argv
 */
async function handler (argv) {

    if (argv.verbose) {
        console.error('============================================')
        console.error('             UPDATE DATA')
        console.error('============================================')
    }

    const configs = await LoadConfig(argv)

    const arg = {
        id: argv.id,
        createDate: argv.createDate,
        startDate: argv.startDate
    }

    UpdateData(arg, configs)
    await SaveData(argv, configs)
}

function UpdateData (arg, configs) {
    let isUpdate = false

    for (const user of configs.data) {
        if (user.id === arg.id) {
            if (arg.createDate !== 'NULL') {
                console.error(`Update ${user.id} createDate from ${user.createDate} to ${arg.createDate}`)
                user.createDate = arg.createDate
                isUpdate = true
            }
            if (arg.startDate !== 'NULL') {
                console.error(`Update ${user.id} startDate from ${user.startDate} to ${arg.startDate}`)
                user.startDate = arg.startDate
                isUpdate = true
            }
            break
        }
    }

    if (!isUpdate) {
        if (arg.createDate === 'NULL') {
            console.error(`updateData = ${JSON.stringify(arg)}`)
            console.error('Wrong Format: createDate must be assigned.')
            console.error('Abort.')
            return
        }

        if (arg.startDate === 'NULL') {
            console.error('Detect no assigned startDate, use createDate as default value')
            arg.startDate = arg.createDate
        }
        console.log(`Add ${arg.id}, startDate = ${arg.startDate}, createDate = ${arg.createDate}`)
        configs.data.push(arg)
    }
}
