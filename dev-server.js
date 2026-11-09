import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './api/photos.js';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);

function loadEnv(filename) {
  var fullPath = path.join(__dirname, filename);
  if (!fs.existsSync(fullPath)) return;
  try {
    var content = fs.readFileSync(fullPath, 'utf8');
    var lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.indexOf('#') === 0) continue;
      var eq = line.indexOf('=');
      if (eq > 0) {
        var key = line.slice(0, eq).trim();
        var val = line.slice(eq + 1).trim();
        if ((val.indexOf('"') === 0 && val.lastIndexOf('"') === val.length - 1) ||
            (val.indexOf("'") === 0 && val.lastIndexOf("'") === val.length - 1)) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.warn('Could not read ' + filename + ':', err.message);
  }
}

// Load .env.local first, fallback to .env
loadEnv('.env.local');
loadEnv('.env');

var MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

var server = http.createServer(async function(req, res) {
  var parsedUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost:3000'));
  var pathname = parsedUrl.pathname;

  if (pathname === '/api/photos') {
    try {
      loadEnv('.env.local');
      loadEnv('.env');
      await handler(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: err.message, hint: 'Internal server error in photos handler.' }));
      }
    }
    return;
  }

  // Refuse dotfiles (e.g. /.env, /.git)
  var segments = pathname.split('/');
  for (var i = 0; i < segments.length; i++) {
    if (segments[i].indexOf('.') === 0 && segments[i] !== '.' && segments[i] !== '..') {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('403 Forbidden: Dotfiles are not served.');
      return;
    }
  }

  // Prevent directory traversal
  var safePath = pathname === '/' ? '/index.html' : pathname;
  var filePath = path.join(__dirname, safePath);
  var relative = path.relative(__dirname, filePath);

  if (relative.indexOf('..') === 0 || path.isAbsolute(relative)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, function(err, stats) {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('404 Not Found');
      return;
    }

    var ext = path.extname(filePath).toLowerCase();
    var contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
  });
});

var PORT = process.env.PORT || 3000;
server.listen(PORT, function() {
  console.log('Slideshow dev server running on http://localhost:' + PORT);
});

