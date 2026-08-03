const { backup } = require('./commands/backup');
const { init } = require('./commands/init');
const { restore } = require('./commands/restore');

module.exports = { backup, init, restore };
