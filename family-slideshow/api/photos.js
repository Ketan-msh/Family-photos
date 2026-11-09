/**
 * Vercel Serverless Function / Local API endpoint: GET /api/photos
 * Lists albums and photos from a public Google Drive folder using Google Drive API v3.
 */

var DEFAULT_FOLDER_ID = '15otliIkybVKJrKDPUTKKi3_2J7JPzlvk';
var DEFAULT_API_KEY = 'AIzaSyDkGhXhiqn92nXu-xWwvaF1aMPMluZ-8qk';

function parsePhotoTime(file) {
  var meta = file.imageMediaMetadata;
  if (meta && meta.time && typeof meta.time === 'string') {
    var rawTime = meta.time.trim();
    if (rawTime.indexOf('0000:') !== 0) {
      var parts = rawTime.split(' ');
      if (parts.length === 2) {
        var datePart = parts[0].replace(/:/g, '-');
        var parsed = Date.parse(datePart + 'T' + parts[1]);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
      var genericParse = Date.parse(rawTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
      if (!isNaN(genericParse) && genericParse > 0) {
        return genericParse;
      }
    }
  }
  if (file.createdTime) {
    var parsedCreated = Date.parse(file.createdTime);
    if (!isNaN(parsedCreated) && parsedCreated > 0) {
      return parsedCreated;
    }
  }
  return 0;
}

function normalizeItem(item) {
  var isFolder = item.mimeType === 'application/vnd.google-apps.folder';
  var isImage = item.mimeType && item.mimeType.indexOf('image/') === 0;
  var targetId = item.id;

  if (item.mimeType === 'application/vnd.google-apps.shortcut' && item.shortcutDetails) {
    var smt = item.shortcutDetails.targetMimeType;
    if (smt === 'application/vnd.google-apps.folder') {
      isFolder = true;
      targetId = item.shortcutDetails.targetId;
    } else if (smt && smt.indexOf('image/') === 0) {
      isImage = true;
      targetId = item.shortcutDetails.targetId;
    }
  }

  return {
    id: targetId,
    name: item.name,
    isFolder: isFolder,
    isImage: isImage,
    createdTime: item.createdTime,
    imageMediaMetadata: item.imageMediaMetadata
  };
}

async function listFolderChildren(folderId, apiKey) {
  var allFiles = [];
  var pageToken = null;

  do {
    var queryParams = new URLSearchParams({
      q: "'" + folderId + "' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.shortcut' or mimeType contains 'image/')",
      fields: 'nextPageToken, files(id, name, mimeType, createdTime, imageMediaMetadata(time), shortcutDetails(targetId, targetMimeType))',
      pageSize: '1000',
      orderBy: 'name_natural',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      key: apiKey
    });

    if (pageToken) {
      queryParams.set('pageToken', pageToken);
    }

    var url = 'https://www.googleapis.com/drive/v3/files?' + queryParams.toString();
    var response = await fetch(url);

    if (!response.ok) {
      var errData = null;
      try {
        errData = await response.json();
      } catch (e) {
        // ignore JSON parse error
      }
      var errMsg = (errData && errData.error && errData.error.message) || ('Google Drive API returned status ' + response.status);
      var err = new Error(errMsg);
      err.status = response.status;
      throw err;
    }

    var data = await response.json();
    if (data.files && Array.isArray(data.files)) {
      for (var i = 0; i < data.files.length; i++) {
        allFiles.push(normalizeItem(data.files[i]));
      }
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return allFiles;
}

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'Method Not Allowed', hint: 'Only GET requests are supported.' }));
    return;
  }

  var apiKey = process.env.GOOGLE_API_KEY || DEFAULT_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({
      error: 'Missing GOOGLE_API_KEY environment variable.',
      hint: 'Add GOOGLE_API_KEY in Vercel > Settings > Environment Variables (or in .env.local for local testing) and redeploy.'
    }));
    return;
  }
  apiKey = apiKey.trim();

  var rootFolderId = process.env.DRIVE_FOLDER_ID;
  if (!rootFolderId || typeof rootFolderId !== 'string' || rootFolderId.trim() === '') {
    rootFolderId = DEFAULT_FOLDER_ID;
  }
  rootFolderId = rootFolderId.trim();

  try {
    // Step 1: Unwrap wrapper folders (repeat up to 3 times)
    var currentRootId = rootFolderId;
    var rootChildren = [];

    for (var w = 0; w < 3; w++) {
      rootChildren = await listFolderChildren(currentRootId, apiKey);
      var imgCount = 0;
      var subFolders = [];

      for (var i = 0; i < rootChildren.length; i++) {
        var item = rootChildren[i];
        if (item.isFolder) {
          subFolders.push(item);
        } else if (item.isImage) {
          imgCount++;
        }
      }

      if (imgCount === 0 && subFolders.length === 1) {
        currentRootId = subFolders[0].id;
      } else {
        break;
      }
    }

    // Step 2: Identify top-level sub-folders as albums and root images
    var topLevelAlbums = [];
    var rootImages = [];

    for (var i = 0; i < rootChildren.length; i++) {
      var file = rootChildren[i];
      if (file.isFolder) {
        topLevelAlbums.push({
          id: file.id,
          name: file.name
        });
      } else if (file.isImage) {
        rootImages.push(file);
      }
    }

    var allPhotos = [];

    // Step 4: Images directly in the root go into an extra album "_root" named "Other photos"
    if (rootImages.length > 0) {
      for (var r = 0; r < rootImages.length; r++) {
        allPhotos.push({
          id: rootImages[r].id,
          a: '_root',
          t: parsePhotoTime(rootImages[r])
        });
      }
    }

    // Step 3: Walk all nested sub-folders breadth-first (max depth 8, max 800 folders, max 8 concurrent Drive requests)
    var queue = [];
    var visitedFolders = new Set();
    visitedFolders.add(currentRootId);

    for (var t = 0; t < topLevelAlbums.length; t++) {
      visitedFolders.add(topLevelAlbums[t].id);
      queue.push({
        folderId: topLevelAlbums[t].id,
        albumId: topLevelAlbums[t].id,
        depth: 1
      });
    }

    var totalFoldersListed = 0;
    var maxFolders = 800;
    var maxConcurrency = 8;
    var queueIndex = 0;
    var activeWorkers = 0;

    await new Promise(function(resolve, reject) {
      if (queue.length === 0) {
        return resolve();
      }
      var hasError = false;

      function next() {
        if (hasError) return;
        if (queueIndex >= queue.length && activeWorkers === 0) {
          return resolve();
        }

        while (activeWorkers < maxConcurrency && queueIndex < queue.length) {
          if (totalFoldersListed >= maxFolders) {
            queueIndex = queue.length;
            if (activeWorkers === 0) return resolve();
            break;
          }

          var task = queue[queueIndex++];
          totalFoldersListed++;
          activeWorkers++;

          (function(currentTask) {
            listFolderChildren(currentTask.folderId, apiKey)
              .then(function(children) {
                activeWorkers--;
                for (var c = 0; c < children.length; c++) {
                  var child = children[c];
                  if (child.isFolder) {
                    if (currentTask.depth + 1 <= 8 && !visitedFolders.has(child.id) && (totalFoldersListed + (queue.length - queueIndex)) < maxFolders) {
                      visitedFolders.add(child.id);
                      queue.push({
                        folderId: child.id,
                        albumId: currentTask.albumId,
                        depth: currentTask.depth + 1
                      });
                    }
                  } else if (child.isImage) {
                    allPhotos.push({
                      id: child.id,
                      a: currentTask.albumId,
                      t: parsePhotoTime(child)
                    });
                  }
                }
                next();
              })
              .catch(function(err) {
                activeWorkers--;
                if (!hasError) {
                  hasError = true;
                  reject(err);
                }
              });
          })(task);
        }
      }

      next();
    });

    // Step 6: Sort all photos by t ascending (with stable secondary sort by id)
    allPhotos.sort(function(p1, p2) {
      if (p1.t !== p2.t) {
        return p1.t - p2.t;
      }
      return p1.id.localeCompare(p2.id);
    });

    // Step 7: For each album, compute count and cover (id of its first photo). Drop empty albums.
    var finalAlbums = [];
    for (var a = 0; a < topLevelAlbums.length; a++) {
      var alb = topLevelAlbums[a];
      var albPhotos = allPhotos.filter(function(p) { return p.a === alb.id; });
      if (albPhotos.length > 0) {
        finalAlbums.push({
          id: alb.id,
          name: alb.name,
          count: albPhotos.length,
          cover: albPhotos[0].id
        });
      }
    }

    if (rootImages.length > 0) {
      var rootPhotos = allPhotos.filter(function(p) { return p.a === '_root'; });
      if (rootPhotos.length > 0) {
        finalAlbums.push({
          id: '_root',
          name: 'Other photos',
          count: rootPhotos.length,
          cover: rootPhotos[0].id
        });
      }
    }

    var result = {
      albums: finalAlbums,
      photos: allPhotos,
      updated: new Date().toISOString()
    };

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    res.end(JSON.stringify(result));
  } catch (err) {
    var status = (err.status === 400 || err.status === 403) ? 502 : 502;
    var hint = (err.status === 400 || err.status === 403)
      ? "Check the API key and ensure 'Google Drive API' is enabled in your Google Cloud project."
      : "Check that the Drive folder ID is correct and shared as 'Anyone with the link: Viewer'.";

    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({
      error: err.message || 'Failed to fetch photos from Google Drive.',
      hint: hint
    }));
  }
}

