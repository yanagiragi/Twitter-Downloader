const { LoadConfig, SaveData } = require('../config')

module.exports = {
    command: 'clear',
    builder,
    handler
}

/** @param {import('yargs').Argv} yargs */
function builder (yargs) {
    yargs
        .usage('Reset startDate to createDate of an user in data.json')
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
        console.error('             CLEAR DATA')
        console.error('============================================')
    }

    const config = await LoadConfig(argv)

    for (const user of config.data) {
        if (user.createDate) {
            const startDate = user.startDate
            user.startDate = user.createDate
            console.log(`Reset startDate (${startDate}) to createDate (${user.startDate}) of ${user.id}`)
        }
    }

    await SaveData(config)
}
