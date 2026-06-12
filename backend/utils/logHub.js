const EventEmitter = require("events");

class LogHub extends EventEmitter {}
module.exports = new LogHub();
