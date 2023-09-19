const { LoadConfig } = require('../config')
const Table = require('easy-table')

module.exports = {
    command: 'list',
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
}

/**
 * @param {*} argv
 */
async function handler (argv) {

    if (argv.verbose) {
        console.error('============================================')
        console.error('                LIST DATA')
        console.error('============================================')
    }

    const configs = await LoadConfig(argv)
    ListData(configs)
}

function ListData (configs) {
    const t = new Table()

    configs.data.forEach(d => {
        const omitPrefix = `${(d.ignore && d.ignore === true) ? '** ' : ''}`
        t.cell('Twitter Id (** For Omitted)', omitPrefix + d.id)
        t.cell('Create Date', d.createDate)
        t.cell('Start Date', d.startDate)
        t.newRow()
    })

    console.log(t.toString())
}
