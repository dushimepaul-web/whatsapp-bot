const logger = require("./logger");
const os = require("os");

class Metrics {
  constructor() {
    this.data = {
      moderation: {
        totalActions: 0,
        totalDeletions: 0,
        totalDeletionTimeMs: 0,
        lastDeletionTime: 0,
        deletionsPerMinute: [],
      },
      system: {
        cpuUsage: 0,
        memoryUsage: 0,
        heapUsed: 0,
        heapTotal: 0,
        eventLoopLag: 0,
        uptime: 0,
        mongoStatus: "unknown",
      },
      whatsapp: {
        connected: false,
        connectionUptime: 0,
        lastDisconnect: null,
        messagesReceived: 0,
        messagesSent: 0,
      },
    };
    this.eventLoopLag = 0;
    this._startEventLoopMonitor();
  }

  _startEventLoopMonitor() {
    let lastCheck = Date.now();
    setInterval(() => {
      const now = Date.now();
      this.eventLoopLag = now - lastCheck;
      lastCheck = now;
      if (this.eventLoopLag > 100) {
        logger.warn(`Event loop lag détecté: ${this.eventLoopLag}ms`);
      }
    }, 1000);
  }

  recordModeration(type) {
    this.data.moderation.totalActions++;
    if (type === "deletion") {
      this.data.moderation.totalDeletions++;
      this.data.moderation.lastDeletionTime = Date.now();
    }
    const now = Date.now();
    this.data.moderation.deletionsPerMinute.push(now);
    this.data.moderation.deletionsPerMinute = this.data.moderation.deletionsPerMinute.filter(t => now - t < 60000);
  }

  setWhatsappStatus(connected) {
    this.data.whatsapp.connected = connected;
    if (connected) {
      if (!this.data.whatsapp.connectionUptime) {
        this.data.whatsapp.connectionUptime = Date.now();
      }
    } else {
      this.data.whatsapp.connectionUptime = 0;
      this.data.whatsapp.lastDisconnect = Date.now();
    }
  }

  updateSystemMetrics() {
    this.data.system.cpuUsage = os.loadavg ? os.loadavg()[0] : 0;
    this.data.system.memoryUsage = (os.totalmem() - os.freemem()) / os.totalmem();
    const mem = process.memoryUsage();
    this.data.system.heapUsed = mem.heapUsed;
    this.data.system.heapTotal = mem.heapTotal;
    this.data.system.eventLoopLag = this.eventLoopLag;
    this.data.system.uptime = process.uptime();
  }

  getSnapshot() {
    this.updateSystemMetrics();
    return {
      ...this.data,
      system: { ...this.data.system },
      whatsapp: { ...this.data.whatsapp },
      moderation: {
        ...this.data.moderation,
        deletionsPerMinute: this.data.moderation.deletionsPerMinute.length,
      },
    };
  }

  getHealthStatus() {
    this.updateSystemMetrics();
    const issues = [];
    if (this.data.system.eventLoopLag > 500) issues.push("event_loop_high");
    if (this.data.system.memoryUsage > 0.85) issues.push("memory_critical");
    if (this.data.system.heapUsed / this.data.system.heapTotal > 0.85) issues.push("heap_critical");
    if (!this.data.whatsapp.connected) issues.push("whatsapp_disconnected");
    const status = issues.length === 0 ? "healthy" : issues.length <= 2 ? "degraded" : "critical";
    return { status, issues, metrics: this.getSnapshot() };
  }
}

module.exports = new Metrics();
