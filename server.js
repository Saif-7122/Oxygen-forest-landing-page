const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// Only these file types are served; repo files like .py, .gs, package.json stay private.
const PUBLIC_EXT = new Set(Object.keys(MIME).filter((e) => e !== ".json"));

function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const candidates = [p];
  if (!path.extname(p)) candidates.push(p + ".html"); // /thank-you -> thank-you.html

  for (const c of candidates) {
    const file = path.normalize(path.join(ROOT, c));
    if (!file.startsWith(ROOT + path.sep)) continue;
    if (!PUBLIC_EXT.has(path.extname(file).toLowerCase())) continue;
    if (file === __filename) continue;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

http
  .createServer((req, res) => {
    let file;
    try {
      file = resolveFile(req.url);
    } catch {
      file = null;
    }

    if (!file) {
      res.writeHead(302, { Location: "/" });
      return res.end();
    }

    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext],
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`Server running on port ${PORT}`));
