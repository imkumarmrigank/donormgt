const levels = ["debug", "info", "http", "warn", "error"];

function write(level, message, meta) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta ? { meta } : {})
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }
  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }
  console.log(JSON.stringify(payload));
}

const logger = levels.reduce((acc, level) => {
  acc[level] = (message, meta) => write(level, message, meta);
  return acc;
}, {});

module.exports = { logger };
