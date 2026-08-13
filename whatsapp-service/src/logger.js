function stamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(level, message, extra) {
  const line = `[WHATSAPP] ${message}`;
  if (extra !== undefined) {
    console[level](`${stamp()} ${line}`, extra);
  } else {
    console[level](`${stamp()} ${line}`);
  }
}

const logger = {
  info: (msg, extra) => log("log", msg, extra),
  warn: (msg, extra) => log("warn", msg, extra),
  error: (msg, extra) => log("error", msg, extra),
};

module.exports = { logger };
