const path = require('path')
const yargs = require('yargs')

/** @param {string} name */
const loadCommand = (name) => {
    const thisFileDir = path.dirname(require.main.filename)
    return require(path.join(thisFileDir, 'commands', `${name}.js`));
};

const commands =
    [
        loadCommand('mainInfo'),
        loadCommand('searchInfo'),
        loadCommand('image'),
        loadCommand('clearData'),
        loadCommand('updateData'),
        loadCommand('listData'),
    ]

let argv = yargs(process.argv.slice(2))
for (const command of commands) {
    argv = argv.command(command)
}
argv = argv.help('h')
    .alias('h', 'help')
    .alias('v', 'version')
    .demandCommand(1, `Possibles commands: [ ${commands.map(x => x.command).join(', ')} ]`)
    .argv;