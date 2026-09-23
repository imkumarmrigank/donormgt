const path = require("path");

function sanitizeFileName(fileName = "file") {
  const ext = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "file"}${ext}`;
}

function sanitizePathSegment(value = "general") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "general";
}

module.exports = {
  sanitizeFileName,
  sanitizePathSegment
};
