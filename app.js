(function() {
  'use strict';

  // =====================================================================
  // STATE & SETTINGS
  // =====================================================================
  var DEFAULT_SETTINGS = {
    duration: 8,           // seconds (3, 5, 8, 10, 15, 20, 30, 60)
    timer: 0,              // minutes (0, 5, 10, 15, 30, 60, 90, 120)
    order: 'date',         // 'date' or 'shuffle'
    transition: 'zoom',    // 'zoom' or 'fade'
    showCaption: true,     // boolean
    blurBackdrop: true,    // boolean
    autoFullscreen: true   // boolean
  };

  var DURATION_OPTIONS = [3, 5, 8, 10, 15, 20, 30, 60];
  var TIMER_OPTIONS = [0, 5, 10, 15, 30, 60, 90, 120];

  var MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  var settings = Object.assign({}, DEFAULT_SETTINGS);

  function loadSettings() {
    try {
      var saved = localStorage.getItem('family_slideshow_settings');
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          for (var key in DEFAULT_SETTINGS) {
            if (Object.prototype.hasOwnProperty.call(parsed, key)) {
              settings[key] = parsed[key];
            }
          }
        }
      }
    } catch (e) {
      console.warn('localStorage read error:', e);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem('family_slideshow_settings', JSON.stringify(settings));
    } catch (e) {
      console.warn('localStorage write error:', e);
    }
    updateHomeSummary();
    renderSettingsPills();
  }

  function getDurationLabel(sec) {
    return sec >= 60 ? (sec / 60) + ' min' : sec + ' sec';
  }

  function getTimerLabel(min) {
    if (!min || min <= 0) return 'Timer off';
    if (min === 60) return '1 hour';
    if (min === 90) return '1.5 hours';
    if (min === 120) return '2 hours';
    return min + ' min';
  }

  function updateHomeSummary() {
    var summaryEl = document.getElementById('home-settings-summary');
    if (summaryEl) {
      var durText = 'Each photo ' + getDurationLabel(settings.duration);
      var timText = settings.timer > 0 ? 'Timer ' + getTimerLabel(settings.timer) : 'Timer off';
      summaryEl.textContent = durText + ' · ' + timText;
    }
  }

  // =====================================================================
  // DATA MODEL
  // =====================================================================
  var appData = {
    albums: [],
    photos: [],
    albumsMap: {}
  };

  var currentScreen = 'loading';
  var lastFocusedByScreen = {};

  // =====================================================================
  // DOM REFERENCES
  // =====================================================================
  var screens = {
    loading: document.getElementById('screen-loading'),
    error: document.getElementById('screen-error'),
    home: document.getElementById('screen-home'),
    albums: document.getElementById('screen-albums'),
    settings: document.getElementById('screen-settings'),
    player: document.getElementById('screen-player')
  };

  var errorMsgEl = document.getElementById('error-message');
  var errorHintEl = document.getElementById('error-hint');
  var homeSubtitleEl = document.getElementById('home-subtitle');
  var albumsGridEl = document.getElementById('albums-grid');

  // Player DOM
  var layerEls = [
    document.getElementById('player-layer-0'),
    document.getElementById('player-layer-1')
  ];
  var playerHudEl = document.getElementById('player-hud');
  var playerCaptionEl = document.getElementById('player-caption');
  var captionAlbumEl = document.getElementById('caption-album');
  var captionDateEl = document.getElementById('caption-date');
  var captionDotEl = document.getElementById('caption-dot');
  var playerPausedBadge = document.getElementById('player-paused-badge');
  var playerToastEl = document.getElementById('player-toast');
  var progressBarFill = document.getElementById('progress-bar-fill');
  var hudAlbumName = document.getElementById('hud-album-name');
  var hudPhotoCounter = document.getElementById('hud-photo-counter');
  var hudTimerCountdown = document.getElementById('hud-timer-countdown');
  var hudBtnPlayPause = document.getElementById('hud-btn-playpause');
  var hudIconPlay = document.getElementById('hud-icon-play');
  var hudIconPause = document.getElementById('hud-icon-pause');
  var hudLabelPlayPause = document.getElementById('hud-label-playpause');
  var hudLabelDuration = document.getElementById('hud-label-duration');
  var hudLabelTimer = document.getElementById('hud-label-timer');
  var hudLabelFullscreen = document.getElementById('hud-label-fullscreen');
  var playerEndOverlay = document.getElementById('player-end-overlay');

  // =====================================================================
  // IMAGE URL BUILDERS
  // =====================================================================
  function getDeviceDimensions() {
    var dpr = window.devicePixelRatio || 1;
    var sw = (window.screen && window.screen.width) || window.innerWidth || 1920;
    var sh = (window.screen && window.screen.height) || window.innerHeight || 1080;
    var iw = window.innerWidth || sw;
    var ih = window.innerHeight || sh;

    var maxW = Math.max(sw, iw) * dpr;
    var maxH = Math.max(sh, ih) * dpr;

    var W = Math.min(3840, Math.max(1280, Math.round(maxW)));
    var H = Math.min(2160, Math.max(720, Math.round(maxH)));
    return { W: W, H: H };
  }

  function getMainPhotoUrl(fileId) {
    var dims = getDeviceDimensions();
    return 'https://lh3.googleusercontent.com/d/' + fileId + '=w' + dims.W + '-h' + dims.H;
  }

  function getFallbackPhotoUrl(fileId) {
    var dims = getDeviceDimensions();
    return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + dims.W;
  }

  function getAlbumCoverUrl(fileId) {
    return 'https://lh3.googleusercontent.com/d/' + fileId + '=w600';
  }

  function getBackdropUrl(fileId) {
    return 'https://lh3.googleusercontent.com/d/' + fileId + '=w64';
  }

  // =====================================================================
  // SCREEN TRANSITIONS & NAVIGATION
  // =====================================================================
  function showScreen(name, pushHistory) {
    if (pushHistory === undefined) pushHistory = true;

    // Save focused element for current screen
    var activeEl = document.activeElement;
    if (activeEl && activeEl.hasAttribute('data-nav') && screens[currentScreen] && screens[currentScreen].contains(activeEl)) {
      lastFocusedByScreen[currentScreen] = activeEl;
    }

    // Leaving player screen cleanup
    if (currentScreen === 'player' && name !== 'player') {
      stopSlideshow();
    }

    // Hide all screens
    for (var key in screens) {
      if (screens[key]) {
        screens[key].classList.add('screen-hidden');
      }
    }

    // Show target screen
    if (screens[name]) {
      screens[name].classList.remove('screen-hidden');
      currentScreen = name;
    }

    if (pushHistory) {
      try {
        history.pushState({ screen: name }, '');
      } catch (e) {
        // ignore
      }
    }

    // Restore focus
    setTimeout(function() {
      restoreFocusForScreen(name);
    }, 50);
  }

  function restoreFocusForScreen(screenName) {
    var screenEl = screens[screenName];
    if (!screenEl) return;

    var remembered = lastFocusedByScreen[screenName];
    if (remembered && document.body.contains(remembered) && isElementVisible(remembered)) {
      focusElement(remembered);
      return;
    }

    // Default: find first visible data-nav element
    var navElements = screenEl.querySelectorAll('[data-nav]');
    for (var i = 0; i < navElements.length; i++) {
      if (isElementVisible(navElements[i])) {
        focusElement(navElements[i]);
        return;
      }
    }
  }

  function focusElement(el) {
    if (!el) return;
    el.focus();
    if (typeof el.scrollIntoViewIfNeeded === 'function') {
      el.scrollIntoViewIfNeeded(false);
    } else if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function isElementVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) &&
      window.getComputedStyle(el).visibility !== 'hidden' &&
      !el.disabled;
  }

  // =====================================================================
  // SPATIAL NAVIGATION ENGINE
  // =====================================================================
  function getVisibleNavCandidates() {
    var container = screens[currentScreen];
    if (!container) return [];

    if (currentScreen === 'player') {
      if (!playerEndOverlay.classList.contains('player-end-hidden')) {
        container = playerEndOverlay;
      } else if (!playerHudEl.classList.contains('player-hud-hidden')) {
        container = playerHudEl;
      } else {
        return [];
      }
    }

    var all = container.querySelectorAll('[data-nav]');
    var candidates = [];
    for (var i = 0; i < all.length; i++) {
      var item = all[i];
      if (isElementVisible(item)) {
        candidates.push(item);
      }
    }
    return candidates;
  }

  function navigateDirection(direction) {
    var candidates = getVisibleNavCandidates();
    if (candidates.length === 0) return;

    var currentEl = document.activeElement;
    if (!currentEl || !currentEl.hasAttribute('data-nav') || candidates.indexOf(currentEl) === -1) {
      focusElement(candidates[0]);
      return;
    }

    var currRect = currentEl.getBoundingClientRect();
    var bestCandidate = null;
    var bestScore = Infinity;

    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i];
      if (cand === currentEl) continue;

      var candRect = cand.getBoundingClientRect();
      var valid = false;
      var edgeGap = 0;
      var crossAxisDist = 0;

      if (direction === 'right') {
        if (candRect.left >= currRect.right - 10) {
          valid = true;
          edgeGap = candRect.left - currRect.right;
          var vOverlap = Math.max(currRect.top, candRect.top) < Math.min(currRect.bottom, candRect.bottom);
          crossAxisDist = vOverlap ? 0 : Math.abs((currRect.top + currRect.bottom) / 2 - (candRect.top + candRect.bottom) / 2);
        }
      } else if (direction === 'left') {
        if (candRect.right <= currRect.left + 10) {
          valid = true;
          edgeGap = currRect.left - candRect.right;
          var vOverlapL = Math.max(currRect.top, candRect.top) < Math.min(currRect.bottom, candRect.bottom);
          crossAxisDist = vOverlapL ? 0 : Math.abs((currRect.top + currRect.bottom) / 2 - (candRect.top + candRect.bottom) / 2);
        }
      } else if (direction === 'down') {
        if (candRect.top >= currRect.bottom - 10) {
          valid = true;
          edgeGap = candRect.top - currRect.bottom;
          var hOverlap = Math.max(currRect.left, candRect.left) < Math.min(currRect.right, candRect.right);
          crossAxisDist = hOverlap ? 0 : Math.abs((currRect.left + currRect.right) / 2 - (candRect.left + candRect.right) / 2);
        }
      } else if (direction === 'up') {
        if (candRect.bottom <= currRect.top + 10) {
          valid = true;
          edgeGap = currRect.top - candRect.bottom;
          var hOverlapU = Math.max(currRect.left, candRect.left) < Math.min(currRect.right, candRect.right);
          crossAxisDist = hOverlapU ? 0 : Math.abs((currRect.left + currRect.right) / 2 - (candRect.left + candRect.right) / 2);
        }
      }

      if (valid) {
        var score = Math.max(0, edgeGap) * 4 + crossAxisDist;
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = cand;
        }
      }
    }

    if (bestCandidate) {
      focusElement(bestCandidate);
    }
  }

  // =====================================================================
  // DATA FETCHING & INITIALIZATION
  // =====================================================================
  function loadPhotosData() {
    showScreen('loading', false);

    fetch('/api/photos')
      .then(function(res) {
        if (!res.ok) {
          return res.json().catch(function() { return {}; }).then(function(errData) {
            var err = new Error((errData && errData.error) || ('Server returned HTTP ' + res.status));
            err.hint = errData && errData.hint;
            throw err;
          });
        }
        return res.json();
      })
      .then(function(data) {
        if (!data || !data.photos || data.photos.length === 0) {
          var noPhotosErr = new Error('No photos found in the Google Drive folder.');
          noPhotosErr.hint = 'Make sure the folder contains image files (JPG, PNG, HEIC) or subfolders with images, and is shared as "Anyone with the link: Viewer".';
          throw noPhotosErr;
        }

        appData.albums = data.albums || [];
        appData.photos = data.photos || [];
        appData.albumsMap = {};
        for (var i = 0; i < appData.albums.length; i++) {
          appData.albumsMap[appData.albums[i].id] = appData.albums[i];
        }

        // Update home screen info
        var totalPhotos = appData.photos.length;
        var totalAlbums = appData.albums.length;
        var subtitle = totalPhotos.toLocaleString() + ' photos in ' + totalAlbums + (totalAlbums === 1 ? ' album' : ' albums');
        if (homeSubtitleEl) homeSubtitleEl.textContent = subtitle;

        renderAlbums();
        updateHomeSummary();

        try {
          history.replaceState({ screen: 'home' }, '');
        } catch (e) {
          // ignore
        }

        showScreen('home', false);
      })
      .catch(function(err) {
        showErrorScreen(err.message, err.hint);
      });
  }

  function showErrorScreen(message, hint) {
    if (errorMsgEl) errorMsgEl.textContent = message || 'Could not connect to Google Drive.';
    if (errorHintEl) {
      if (hint) {
        errorHintEl.textContent = hint;
        errorHintEl.classList.add('show');
      } else {
        errorHintEl.classList.remove('show');
      }
    }
    showScreen('error', false);
  }

  // =====================================================================
  // ALBUMS RENDERING
  // =====================================================================
  function renderAlbums() {
    if (!albumsGridEl) return;
    albumsGridEl.innerHTML = '';

    for (var i = 0; i < appData.albums.length; i++) {
      var album = appData.albums[i];
      var card = document.createElement('button');
      card.className = 'album-card';
      card.setAttribute('data-nav', '');
      card.setAttribute('data-album-id', album.id);

      var coverUrl = album.cover ? getAlbumCoverUrl(album.cover) : '';

      var countText = album.count + (album.count === 1 ? ' photo' : ' photos');

      card.innerHTML =
        '<div class="album-card-thumb-wrap">' +
          (coverUrl ? '<img class="album-card-thumb" src="' + coverUrl + '" alt="' + escapeHtml(album.name) + '" loading="lazy">' : '') +
        '</div>' +
        '<div class="album-card-info">' +
          '<div class="album-card-title">' + escapeHtml(album.name) + '</div>' +
          '<div class="album-card-count">' + countText + '</div>' +
        '</div>';

      (function(targetAlbum) {
        card.addEventListener('click', function() {
          startSlideshow({ mode: 'album', albumId: targetAlbum.id });
        });
      })(album);

      albumsGridEl.appendChild(card);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // =====================================================================
  // SETTINGS RENDERING & INTERACTIONS
  // =====================================================================
  function renderSettingsPills() {
    var pillButtons = document.querySelectorAll('.pill-btn');
    for (var i = 0; i < pillButtons.length; i++) {
      var btn = pillButtons[i];
      var key = btn.getAttribute('data-key');
      var valStr = btn.getAttribute('data-val');

      var currentVal = settings[key];
      var isSelected = false;

      if (typeof currentVal === 'boolean') {
        isSelected = (valStr === 'true') === currentVal;
      } else if (typeof currentVal === 'number') {
        isSelected = parseInt(valStr, 10) === currentVal;
      } else {
        isSelected = valStr === currentVal;
      }

      if (isSelected) {
        btn.classList.add('pill-selected');
      } else {
        btn.classList.remove('pill-selected');
      }
    }
  }

  function setupSettingsEvents() {
    var pillButtons = document.querySelectorAll('.pill-btn');
    for (var i = 0; i < pillButtons.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var key = btn.getAttribute('data-key');
          var valStr = btn.getAttribute('data-val');

          if (valStr === 'true') settings[key] = true;
          else if (valStr === 'false') settings[key] = false;
          else if (!isNaN(Number(valStr))) settings[key] = Number(valStr);
          else settings[key] = valStr;

          saveSettings();
        });
      })(pillButtons[i]);
    }
  }

  // =====================================================================
  // FULLSCREEN & WAKE LOCK
  // =====================================================================
  function toggleFullscreen() {
    var doc = document;
    var docEl = doc.documentElement;
    var isFs = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

    if (!isFs) {
      var req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
      if (req) {
        try {
          req.call(docEl);
        } catch (e) {
          // ignore
        }
      }
    } else {
      var exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (exit) {
        try {
          exit.call(doc);
        } catch (e) {
          // ignore
        }
      }
    }
  }

  function updateFullscreenLabels() {
    var isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    var text = isFs ? 'Exit full screen' : 'Full screen';
    if (hudLabelFullscreen) hudLabelFullscreen.textContent = text;
    var homeFsLabel = document.getElementById('home-fs-label');
    if (homeFsLabel) homeFsLabel.textContent = text;
  }

  document.addEventListener('fullscreenchange', updateFullscreenLabels);
  document.addEventListener('webkitfullscreenchange', updateFullscreenLabels);

  var wakeLockSentinel = null;

  function requestWakeLock() {
    if ('wakeLock' in navigator && typeof navigator.wakeLock.request === 'function') {
      navigator.wakeLock.request('screen').then(function(lock) {
        wakeLockSentinel = lock;
        lock.addEventListener('release', function() {
          if (wakeLockSentinel === lock) {
            wakeLockSentinel = null;
          }
        });
      }).catch(function() {
        // ignore
      });
    }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel && typeof wakeLockSentinel.release === 'function') {
      try {
        wakeLockSentinel.release();
      } catch (e) {
        // ignore
      }
      wakeLockSentinel = null;
    }
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && currentScreen === 'player') {
      requestWakeLock();
    }
  });

  // =====================================================================
  // SLIDESHOW ENGINE
  // =====================================================================
  var slideshow = {
    playlist: [],
    currentIndex: -1,
    isPlaying: false,
    timerId: null,
    photoStartTime: 0,
    remainingTime: 0,
    currentDuration: 8000,
    loadToken: 0,
    currentLayerIdx: 0,
    consecutiveFailures: 0,
    kenBurnsCounter: 0,
    mode: 'album',        // 'album' or 'shuffle'
    currentAlbumId: null,
    hudVisible: false,
    hudTimerId: null,
    sleepTimerEndAt: 0,
    sleepTimerIntervalId: null,
    isEndOverlayVisible: false
  };

  function startSlideshow(options) {
    if (settings.autoFullscreen) {
      toggleFullscreen();
    }

    slideshow.mode = options.mode;
    slideshow.currentAlbumId = options.albumId || null;

    buildPlaylist();

    if (slideshow.playlist.length === 0) {
      showToast('No photos available to play');
      return;
    }

    showScreen('player', true);
    requestWakeLock();

    // Reset layers
    layerEls[0].className = 'player-layer hidden-layer';
    layerEls[1].className = 'player-layer hidden-layer';
    slideshow.currentLayerIdx = 0;
    slideshow.currentIndex = -1;
    slideshow.consecutiveFailures = 0;
    slideshow.kenBurnsCounter = 0;
    slideshow.isEndOverlayVisible = false;
    playerEndOverlay.classList.add('player-end-hidden');

    // Blur backdrop setting class
    if (settings.blurBackdrop) {
      screens.player.classList.remove('player-no-blur');
    } else {
      screens.player.classList.add('player-no-blur');
    }

    // Initialize sleep timer
    initSleepTimer();

    // Set duration
    slideshow.currentDuration = settings.duration * 1000;
    updateHudDurationLabel();
    updateHudTimerLabel();

    // Show initial photo
    slideshow.isPlaying = true;
    updatePlayPauseControls();
    nextPhoto(1);

    // Initial HUD show (3.5s auto-hide)
    showHud(3500);
  }

  function stopSlideshow() {
    slideshow.isPlaying = false;
    clearTimeout(slideshow.timerId);
    slideshow.timerId = null;
    clearTimeout(slideshow.hudTimerId);
    slideshow.hudTimerId = null;
    clearInterval(slideshow.sleepTimerIntervalId);
    slideshow.sleepTimerIntervalId = null;
    releaseWakeLock();
    document.body.classList.remove('hide-cursor');
  }

  function buildPlaylist() {
    var list = [];
    if (slideshow.mode === 'album') {
      var targetId = slideshow.currentAlbumId;
      for (var i = 0; i < appData.photos.length; i++) {
        if (appData.photos[i].a === targetId) {
          list.push(appData.photos[i]);
        }
      }
      if (settings.order === 'shuffle') {
        shuffleArray(list);
      }
    } else {
      // Shuffle all photos
      list = appData.photos.slice();
      shuffleArray(list);
    }
    slideshow.playlist = list;
  }

  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
  }

  function nextPhoto(direction) {
    if (direction === undefined) direction = 1;
    if (slideshow.playlist.length === 0) return;

    clearTimeout(slideshow.timerId);
    slideshow.timerId = null;

    var newIndex = slideshow.currentIndex + direction;
    if (newIndex >= slideshow.playlist.length) {
      if (slideshow.mode === 'shuffle') {
        // Reshuffle and ensure next photo is not the one just shown
        var lastPhoto = slideshow.playlist[slideshow.currentIndex];
        buildPlaylist();
        if (slideshow.playlist.length > 1 && slideshow.playlist[0].id === lastPhoto.id) {
          // swap 0 with random other index
          var swapIdx = 1 + Math.floor(Math.random() * (slideshow.playlist.length - 1));
          var tmp = slideshow.playlist[0];
          slideshow.playlist[0] = slideshow.playlist[swapIdx];
          slideshow.playlist[swapIdx] = tmp;
        }
      }
      newIndex = 0;
    } else if (newIndex < 0) {
      newIndex = slideshow.playlist.length - 1;
    }

    loadAndShowPhoto(newIndex, direction);
  }

  function loadAndShowPhoto(photoIndex, direction) {
    var photo = slideshow.playlist[photoIndex];
    if (!photo) return;

    var token = ++slideshow.loadToken;
    var incomingLayerIdx = slideshow.currentLayerIdx === 0 ? 1 : 0;
    var incomingLayer = layerEls[incomingLayerIdx];
    var currentLayer = layerEls[slideshow.currentLayerIdx];

    var mainImg = incomingLayer.querySelector('.player-img');
    var backdrop = incomingLayer.querySelector('.player-backdrop');

    // Reset incoming layer classes with transitions disabled so nothing flashes
    incomingLayer.className = 'player-layer hidden-layer';
    mainImg.className = 'player-img';
    mainImg.style.animation = 'none';

    var mainUrl = getMainPhotoUrl(photo.id);
    var backdropUrl = getBackdropUrl(photo.id);
    var fallbackUrl = getFallbackPhotoUrl(photo.id);

    // Watchdog timer (20 seconds)
    var watchdogTimer = setTimeout(function() {
      if (token === slideshow.loadToken) {
        handlePhotoLoadFailure(photoIndex, direction, 'Photo loading timed out.');
      }
    }, 20000);

    var triedFallback = false;

    function onLoadSuccess() {
      clearTimeout(watchdogTimer);
      if (token !== slideshow.loadToken) return;

      slideshow.consecutiveFailures = 0;
      slideshow.currentIndex = photoIndex;

      // Update captions and HUD info
      updatePhotoInfoDisplay(photo);

      // Ken Burns setup
      slideshow.kenBurnsCounter = (slideshow.kenBurnsCounter % 4) + 1;
      if (settings.transition === 'zoom') {
        var durationSec = (slideshow.currentDuration / 1000) + 2;
        mainImg.style.animationDuration = durationSec + 's';
        mainImg.classList.add('kb-' + slideshow.kenBurnsCounter);
      }

      // Old layer stays fully visible underneath with class "behind" (no transition)
      currentLayer.className = 'player-layer behind';

      // Force layout reflow before triggering fade-in transition
      void incomingLayer.offsetWidth;

      // Incoming layer fades in on top
      incomingLayer.className = 'player-layer fade-in';

      // Update current active layer
      slideshow.currentLayerIdx = incomingLayerIdx;

      // Start photo timer once visible
      slideshow.photoStartTime = Date.now();
      slideshow.remainingTime = slideshow.currentDuration;
      startProgressBar(slideshow.currentDuration);

      if (slideshow.isPlaying) {
        slideshow.timerId = setTimeout(function() {
          nextPhoto(1);
        }, slideshow.currentDuration);
      }

      // Preload next 2 photos
      preloadNextPhotos(photoIndex, 2);

      // Clean up previous layer after transition (1000ms)
      setTimeout(function() {
        if (token === slideshow.loadToken) {
          incomingLayer.className = 'player-layer active';
          currentLayer.className = 'player-layer hidden-layer';
        }
      }, 1050);
    }

    function tryFallbackOrFailed() {
      if (!triedFallback) {
        triedFallback = true;
        mainImg.src = fallbackUrl;
      } else {
        clearTimeout(watchdogTimer);
        if (token === slideshow.loadToken) {
          handlePhotoLoadFailure(photoIndex, direction, 'Failed to load photo.');
        }
      }
    }

    mainImg.onload = onLoadSuccess;
    mainImg.onerror = tryFallbackOrFailed;

    // Set backdrop background image
    if (settings.blurBackdrop) {
      backdrop.style.backgroundImage = 'url("' + backdropUrl + '")';
    }

    mainImg.src = mainUrl;
  }

  function handlePhotoLoadFailure(photoIndex, direction, reason) {
    slideshow.consecutiveFailures++;
    console.warn(reason + ' (Consecutive failures: ' + slideshow.consecutiveFailures + ')');

    if (slideshow.consecutiveFailures >= 12) {
      pauseSlideshow();
      showToast('Could not load photos. Please check your internet connection.', 5000);
      return;
    }

    // Skip to next photo in the same direction
    nextPhoto(direction || 1);
  }

  function preloadNextPhotos(fromIndex, count) {
    var len = slideshow.playlist.length;
    if (len <= 1) return;

    for (var i = 1; i <= count; i++) {
      var nextIdx = (fromIndex + i) % len;
      var p = slideshow.playlist[nextIdx];
      if (p) {
        var img = new Image();
        img.src = getMainPhotoUrl(p.id);
        if (settings.blurBackdrop) {
          var bg = new Image();
          bg.src = getBackdropUrl(p.id);
        }
      }
    }
  }

  function updatePhotoInfoDisplay(photo) {
    var album = appData.albumsMap[photo.a];
    var albumTitle = album ? album.name : (slideshow.mode === 'shuffle' ? 'All Photos' : 'Album');

    // Date taken
    var dateStr = '';
    if (photo.t && photo.t > 0) {
      var d = new Date(photo.t);
      if (!isNaN(d.getTime())) {
        var day = d.getDate();
        var month = MONTH_NAMES[d.getMonth()];
        var year = d.getFullYear();
        dateStr = day + ' ' + month + ' ' + year;
      }
    }

    // Caption
    if (settings.showCaption) {
      if (captionAlbumEl) captionAlbumEl.textContent = albumTitle;
      if (captionDateEl) {
        captionDateEl.textContent = dateStr;
        if (captionDotEl) captionDotEl.style.display = dateStr ? 'inline' : 'none';
      }
      if (!slideshow.hudVisible) {
        playerCaptionEl.classList.remove('caption-hidden');
      }
    } else {
      playerCaptionEl.classList.add('caption-hidden');
    }

    // HUD top bar
    if (hudAlbumName) hudAlbumName.textContent = albumTitle;
    if (hudPhotoCounter) {
      var counterText = 'Photo ' + (slideshow.currentIndex + 1) + ' of ' + slideshow.playlist.length;
      hudPhotoCounter.textContent = counterText;
    }
  }

  function startProgressBar(durationMs) {
    progressBarFill.className = 'progress-bar-fill';
    void progressBarFill.offsetWidth;
    progressBarFill.style.animationDuration = durationMs + 'ms';
    progressBarFill.className = 'progress-bar-fill running';
    if (!slideshow.isPlaying) {
      progressBarFill.style.animationPlayState = 'paused';
    }
  }

  function pauseSlideshow() {
    if (!slideshow.isPlaying) return;
    slideshow.isPlaying = false;

    clearTimeout(slideshow.timerId);
    slideshow.timerId = null;

    var elapsed = Date.now() - slideshow.photoStartTime;
    slideshow.remainingTime = Math.max(0, slideshow.remainingTime - elapsed);

    screens.player.classList.add('player-paused');
    updatePlayPauseControls();

    if (!slideshow.hudVisible) {
      playerPausedBadge.classList.remove('player-paused-hidden');
    }
    showToast('Paused');
  }

  function resumeSlideshow() {
    if (slideshow.isPlaying) return;
    slideshow.isPlaying = true;

    screens.player.classList.remove('player-paused');
    playerPausedBadge.classList.add('player-paused-hidden');
    updatePlayPauseControls();

    slideshow.photoStartTime = Date.now();
    progressBarFill.style.animationPlayState = 'running';

    var timeToWait = slideshow.remainingTime > 200 ? slideshow.remainingTime : slideshow.currentDuration;
    slideshow.timerId = setTimeout(function() {
      nextPhoto(1);
    }, timeToWait);

    showToast('Resumed');
  }

  function togglePlayPause() {
    if (slideshow.isPlaying) {
      pauseSlideshow();
    } else {
      resumeSlideshow();
    }
  }

  function updatePlayPauseControls() {
    if (slideshow.isPlaying) {
      hudIconPlay.classList.add('icon-hidden');
      hudIconPause.classList.remove('icon-hidden');
      hudLabelPlayPause.textContent = 'Pause';
    } else {
      hudIconPlay.classList.remove('icon-hidden');
      hudIconPause.classList.add('icon-hidden');
      hudLabelPlayPause.textContent = 'Play';
    }
  }

  // =====================================================================
  // SLEEP TIMER
  // =====================================================================
  function initSleepTimer() {
    clearInterval(slideshow.sleepTimerIntervalId);
    slideshow.sleepTimerIntervalId = null;

    if (settings.timer > 0) {
      slideshow.sleepTimerEndAt = Date.now() + (settings.timer * 60 * 1000);
      updateSleepTimerDisplay();
      slideshow.sleepTimerIntervalId = setInterval(updateSleepTimerDisplay, 1000);
    } else {
      slideshow.sleepTimerEndAt = 0;
      if (hudTimerCountdown) hudTimerCountdown.textContent = '';
    }
  }

  function updateSleepTimerDisplay() {
    if (!slideshow.sleepTimerEndAt || settings.timer <= 0) {
      if (hudTimerCountdown) hudTimerCountdown.textContent = '';
      return;
    }

    var msRemaining = slideshow.sleepTimerEndAt - Date.now();
    if (msRemaining <= 0) {
      // Timer finished!
      onSleepTimerFinished();
      return;
    }

    var totalSec = Math.ceil(msRemaining / 1000);
    var mins = Math.floor(totalSec / 60);
    var secs = totalSec % 60;
    var formatted = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;

    if (hudTimerCountdown) {
      hudTimerCountdown.textContent = 'Stops in ' + formatted;
    }
  }

  function onSleepTimerFinished() {
    clearInterval(slideshow.sleepTimerIntervalId);
    slideshow.sleepTimerIntervalId = null;
    if (hudTimerCountdown) hudTimerCountdown.textContent = '';

    pauseSlideshow();
    releaseWakeLock();
    hideHud();

    // Show end overlay
    slideshow.isEndOverlayVisible = true;
    playerEndOverlay.classList.remove('player-end-hidden');

    var resumeBtn = document.getElementById('btn-end-resume');
    if (resumeBtn) focusElement(resumeBtn);
  }

  // =====================================================================
  // HUD CONTROLS VISIBILITY & CYCLING
  // =====================================================================
  function showHud(timeoutMs) {
    if (timeoutMs === undefined) timeoutMs = 5000;
    slideshow.hudVisible = true;
    playerHudEl.classList.remove('player-hud-hidden');
    playerCaptionEl.classList.add('caption-hidden');
    playerPausedBadge.classList.add('player-paused-hidden');
    document.body.classList.remove('hide-cursor');

    resetHudTimer(timeoutMs);
  }

  function hideHud() {
    slideshow.hudVisible = false;
    playerHudEl.classList.add('player-hud-hidden');
    clearTimeout(slideshow.hudTimerId);
    slideshow.hudTimerId = null;

    if (settings.showCaption) {
      playerCaptionEl.classList.remove('caption-hidden');
    }
    if (!slideshow.isPlaying) {
      playerPausedBadge.classList.remove('player-paused-hidden');
    }
    document.body.classList.add('hide-cursor');
  }

  function resetHudTimer(timeoutMs) {
    if (!slideshow.hudVisible) return;
    if (timeoutMs === undefined) timeoutMs = 5000;
    clearTimeout(slideshow.hudTimerId);
    slideshow.hudTimerId = setTimeout(function() {
      hideHud();
    }, timeoutMs);
  }

  function cycleDuration() {
    var cur = settings.duration;
    var idx = DURATION_OPTIONS.indexOf(cur);
    var nextIdx = (idx + 1) % DURATION_OPTIONS.length;
    settings.duration = DURATION_OPTIONS[nextIdx];
    saveSettings();

    slideshow.currentDuration = settings.duration * 1000;
    updateHudDurationLabel();
    showToast('Each photo: ' + getDurationLabel(settings.duration));

    // Restart timer for current photo
    clearTimeout(slideshow.timerId);
    slideshow.photoStartTime = Date.now();
    slideshow.remainingTime = slideshow.currentDuration;
    startProgressBar(slideshow.currentDuration);

    if (slideshow.isPlaying) {
      slideshow.timerId = setTimeout(function() {
        nextPhoto(1);
      }, slideshow.currentDuration);
    }
  }

  function cycleTimer() {
    var cur = settings.timer;
    var idx = TIMER_OPTIONS.indexOf(cur);
    var nextIdx = (idx + 1) % TIMER_OPTIONS.length;
    settings.timer = TIMER_OPTIONS[nextIdx];
    saveSettings();

    updateHudTimerLabel();
    initSleepTimer();

    if (settings.timer > 0) {
      showToast('Slideshow stops in ' + getTimerLabel(settings.timer));
    } else {
      showToast('Timer turned off');
    }
  }

  function updateHudDurationLabel() {
    if (hudLabelDuration) {
      hudLabelDuration.textContent = getDurationLabel(settings.duration);
    }
  }

  function updateHudTimerLabel() {
    if (hudLabelTimer) {
      hudLabelTimer.textContent = settings.timer > 0 ? getTimerLabel(settings.timer) : 'Timer: off';
    }
  }

  // =====================================================================
  // TOAST NOTIFICATIONS
  // =====================================================================
  var toastTimerId = null;

  function showToast(message, durationMs) {
    if (durationMs === undefined) durationMs = 2200;
    if (!playerToastEl) return;

    playerToastEl.textContent = message;
    playerToastEl.classList.remove('player-toast-hidden');

    clearTimeout(toastTimerId);
    toastTimerId = setTimeout(function() {
      playerToastEl.classList.add('player-toast-hidden');
    }, durationMs);
  }

  // =====================================================================
  // REMOTE CONTROL & KEYBOARD HANDLING
  // =====================================================================
  var popstateHandledTime = 0;

  window.addEventListener('popstate', function(e) {
    popstateHandledTime = Date.now();
    var state = e.state;
    var target = (state && state.screen) || 'home';
    if (target === 'player') {
      showScreen('home', false);
    } else {
      showScreen(target, false);
    }
  });

  function handleBackKey(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    if (currentScreen === 'player') {
      if (slideshow.isEndOverlayVisible) {
        showScreen('home', true);
        return;
      }
      if (slideshow.hudVisible && (e && (e.key === 'Escape' || e.keyCode === 27 || e.key === 'Backspace' || e.keyCode === 8))) {
        hideHud();
        return;
      }
      showScreen('home', true);
      return;
    }

    if (currentScreen === 'albums' || currentScreen === 'settings') {
      var triggeredTime = Date.now();
      setTimeout(function() {
        if (Date.now() - popstateHandledTime > 250) {
          try {
            history.back();
          } catch (err) {
            showScreen('home', false);
          }
        }
      }, 200);
      return;
    }

    // On home screen, never call history.back()
  }

  document.addEventListener('keydown', function(e) {
    var key = e.key;
    var code = e.keyCode;

    // Normalize keys
    var isLeft = key === 'ArrowLeft' || key === 'Left' || code === 37;
    var isRight = key === 'ArrowRight' || key === 'Right' || code === 39;
    var isUp = key === 'ArrowUp' || key === 'Up' || code === 38;
    var isDown = key === 'ArrowDown' || key === 'Down' || code === 40;
    var isOk = key === 'Enter' || code === 13;
    var isSpace = key === ' ' || key === 'Spacebar' || code === 32;
    var isBack = key === 'Escape' || key === 'Backspace' || key === 'GoBack' || key === 'BrowserBack' ||
                 code === 27 || code === 8 || code === 10009 || code === 461;

    // Media Keys
    var isMediaPlayPause = key === 'MediaPlayPause' || key === 'MediaPlay' || key === 'MediaPause' ||
                           code === 179 || code === 415 || code === 19;
    var isMediaNext = key === 'MediaTrackNext' || key === 'MediaFastForward' || code === 176 || code === 417;
    var isMediaPrev = key === 'MediaTrackPrevious' || key === 'MediaRewind' || code === 177 || code === 412;

    if (currentScreen === 'player') {
      resetHudTimer();

      if (isMediaPlayPause) {
        e.preventDefault();
        togglePlayPause();
        return;
      }
      if (isMediaNext) {
        e.preventDefault();
        nextPhoto(1);
        return;
      }
      if (isMediaPrev) {
        e.preventDefault();
        nextPhoto(-1);
        return;
      }

      if (slideshow.isEndOverlayVisible) {
        if (isLeft || isUp) { e.preventDefault(); navigateDirection('left'); return; }
        if (isRight || isDown) { e.preventDefault(); navigateDirection('right'); return; }
        if (isBack) { e.preventDefault(); showScreen('home', true); return; }
        return;
      }

      if (!slideshow.hudVisible) {
        // Controls are hidden
        if (isLeft) {
          e.preventDefault();
          nextPhoto(-1);
          return;
        }
        if (isRight) {
          e.preventDefault();
          nextPhoto(1);
          return;
        }
        if (isSpace) {
          e.preventDefault();
          togglePlayPause();
          return;
        }
        if (isOk || isUp || isDown) {
          e.preventDefault();
          showHud();
          focusElement(hudBtnPlayPause);
          return;
        }
        if (isBack) {
          e.preventDefault();
          handleBackKey(e);
          return;
        }
      } else {
        // Controls are visible
        if (isOk) {
          var activeHudEl = document.activeElement;
          if (activeHudEl && activeHudEl.hasAttribute('data-nav')) {
            e.preventDefault();
            activeHudEl.click();
            return;
          }
        }
        if (isBack) {
          e.preventDefault();
          if (key === 'Escape' || code === 27 || key === 'Backspace' || code === 8) {
            hideHud();
          } else {
            handleBackKey(e);
          }
          return;
        }
        if (isLeft) { e.preventDefault(); navigateDirection('left'); return; }
        if (isRight) { e.preventDefault(); navigateDirection('right'); return; }
        if (isUp) { e.preventDefault(); navigateDirection('up'); return; }
        if (isDown) { e.preventDefault(); navigateDirection('down'); return; }
        if (isSpace) {
          e.preventDefault();
          togglePlayPause();
          return;
        }
      }
      return;
    }

    // Other screens (home, albums, settings, error)
    if (isOk) {
      var currentNavEl = document.activeElement;
      if (currentNavEl && currentNavEl.hasAttribute('data-nav')) {
        e.preventDefault();
        currentNavEl.click();
        return;
      }
    }
    if (isBack) {
      e.preventDefault();
      handleBackKey(e);
      return;
    }
    if (isLeft) { e.preventDefault(); navigateDirection('left'); return; }
    if (isRight) { e.preventDefault(); navigateDirection('right'); return; }
    if (isUp) { e.preventDefault(); navigateDirection('up'); return; }
    if (isDown) { e.preventDefault(); navigateDirection('down'); return; }
  });

  // =====================================================================
  // MOUSE & TOUCH HANDLING
  // =====================================================================
  var lastMouseMoveTime = 0;
  window.addEventListener('mousemove', function() {
    var now = Date.now();
    if (now - lastMouseMoveTime > 200) {
      lastMouseMoveTime = now;
      if (currentScreen === 'player' && !slideshow.isEndOverlayVisible) {
        showHud();
      }
    }
  });

  // Player click zones
  screens.player.addEventListener('click', function(e) {
    if (slideshow.isEndOverlayVisible) return;

    // Check if clicked inside HUD button
    var el = e.target;
    var clickedBtn = false;
    while (el && el !== screens.player) {
      if (el.classList && (el.classList.contains('hud-btn') || el.classList.contains('action-btn'))) {
        clickedBtn = true;
        break;
      }
      el = el.parentElement;
    }
    if (clickedBtn) return;

    var w = window.innerWidth || document.documentElement.clientWidth;
    var x = e.clientX;

    if (!slideshow.hudVisible) {
      if (x < w * 0.2) {
        nextPhoto(-1);
      } else if (x > w * 0.8) {
        nextPhoto(1);
      } else {
        showHud();
        focusElement(hudBtnPlayPause);
      }
    } else {
      hideHud();
    }
  });

  // Touch Swipe Handling
  var touchStartX = 0;
  var touchStartY = 0;
  screens.player.addEventListener('touchstart', function(e) {
    if (e.touches && e.touches[0]) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  screens.player.addEventListener('touchend', function(e) {
    if (slideshow.isEndOverlayVisible) return;
    if (e.changedTouches && e.changedTouches[0]) {
      var diffX = e.changedTouches[0].clientX - touchStartX;
      var diffY = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX < 0) {
          nextPhoto(1); // Swipe left = next
        } else {
          nextPhoto(-1); // Swipe right = prev
        }
      }
    }
  }, { passive: true });

  // =====================================================================
  // DOM BUTTON ACTIONS & EVENT LISTENERS
  // =====================================================================
  function setupDomEventListeners() {
    // Retry button on error screen
    var btnRetry = document.getElementById('btn-error-retry');
    if (btnRetry) {
      btnRetry.addEventListener('click', function() {
        loadPhotosData();
      });
    }

    // Home screen buttons
    var btnChooseAlbum = document.getElementById('btn-choose-album');
    if (btnChooseAlbum) {
      btnChooseAlbum.addEventListener('click', function() {
        showScreen('albums', true);
      });
    }

    var btnShuffleAll = document.getElementById('btn-shuffle-all');
    if (btnShuffleAll) {
      btnShuffleAll.addEventListener('click', function() {
        startSlideshow({ mode: 'shuffle' });
      });
    }

    var btnHomeSettings = document.getElementById('btn-home-settings');
    if (btnHomeSettings) {
      btnHomeSettings.addEventListener('click', function() {
        showScreen('settings', true);
      });
    }

    var btnHomeFullscreen = document.getElementById('btn-home-fullscreen');
    if (btnHomeFullscreen) {
      btnHomeFullscreen.addEventListener('click', function() {
        toggleFullscreen();
      });
    }

    // Back buttons
    var btnAlbumsBack = document.getElementById('btn-albums-back');
    if (btnAlbumsBack) {
      btnAlbumsBack.addEventListener('click', function() {
        showScreen('home', true);
      });
    }

    var btnSettingsBack = document.getElementById('btn-settings-back');
    if (btnSettingsBack) {
      btnSettingsBack.addEventListener('click', function() {
        showScreen('home', true);
      });
    }

    // HUD buttons
    var hudBtnMenu = document.getElementById('hud-btn-menu');
    if (hudBtnMenu) {
      hudBtnMenu.addEventListener('click', function() {
        showScreen('home', true);
      });
    }

    var hudBtnPrev = document.getElementById('hud-btn-prev');
    if (hudBtnPrev) {
      hudBtnPrev.addEventListener('click', function() {
        nextPhoto(-1);
      });
    }

    if (hudBtnPlayPause) {
      hudBtnPlayPause.addEventListener('click', function() {
        togglePlayPause();
      });
    }

    var hudBtnNext = document.getElementById('hud-btn-next');
    if (hudBtnNext) {
      hudBtnNext.addEventListener('click', function() {
        nextPhoto(1);
      });
    }

    var hudBtnDuration = document.getElementById('hud-btn-duration');
    if (hudBtnDuration) {
      hudBtnDuration.addEventListener('click', function() {
        cycleDuration();
      });
    }

    var hudBtnTimer = document.getElementById('hud-btn-timer');
    if (hudBtnTimer) {
      hudBtnTimer.addEventListener('click', function() {
        cycleTimer();
      });
    }

    var hudBtnFullscreen = document.getElementById('hud-btn-fullscreen');
    if (hudBtnFullscreen) {
      hudBtnFullscreen.addEventListener('click', function() {
        toggleFullscreen();
      });
    }

    // End overlay buttons
    var btnEndResume = document.getElementById('btn-end-resume');
    if (btnEndResume) {
      btnEndResume.addEventListener('click', function() {
        slideshow.isEndOverlayVisible = false;
        playerEndOverlay.classList.add('player-end-hidden');
        settings.timer = 0;
        saveSettings();
        updateHudTimerLabel();
        resumeSlideshow();
        requestWakeLock();
      });
    }

    var btnEndMenu = document.getElementById('btn-end-menu');
    if (btnEndMenu) {
      btnEndMenu.addEventListener('click', function() {
        showScreen('home', true);
      });
    }

    setupSettingsEvents();
  }

  // =====================================================================
  // INITIALIZATION ON LOAD
  // =====================================================================
  document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    setupDomEventListeners();
    renderSettingsPills();
    loadPhotosData();
  });

})();
