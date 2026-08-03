/**
 * AkariNet Autopilot bridge
 * - Shared status bus for screensaver / status UI
 * - Download-aware screensaver (autopilot after 15s while busy)
 * - Touch / wake-word activity always resets the idle timer
 * - Night Mode: time-window interactive screensaver that keeps background (audio survives)
 */
(function () {
    'use strict';

    var AUTOPILOT_URL = 'https://76836.github.io/Akari/engine/autopilot/status';
    // Resolve nightmode.html from Akari root (works when host page is under /UI/, etc.)
    var NIGHTMODE_URL = (function () {
        try {
            var scripts = document.getElementsByTagName('script');
            for (var i = scripts.length - 1; i >= 0; i--) {
                var src = scripts[i].src || '';
                if (/\/engine\/autopilot\/bridge\.js/i.test(src)) {
                    return src.replace(/engine\/autopilot\/bridge\.js.*$/i, '') + 'nightmode.html';
                }
            }
        } catch (e) {}
        return './nightmode.html';
    })();
    var DOWNLOAD_SS_DELAY_MS = 15000;

    var bc = null;
    try { bc = new BroadcastChannel('akarinet-autopilot'); } catch (e) {}

    var state = {
        downloadCount: 0,
        downloadTimer: null,
        forcedScreensaver: false,
        nightModeActive: false,
        nightModeRestoreTimer: null,
        lastStatus: { text: '', busy: false, idle: true, percent: null }
    };

    function publish(msg) {
        state.lastStatus = Object.assign({}, state.lastStatus, msg, { t: Date.now() });
        try {
            localStorage.setItem('akari:autopilot', JSON.stringify(state.lastStatus));
        } catch (e) {}
        if (bc) {
            try { bc.postMessage(state.lastStatus); } catch (e) {}
        }
        var iframe = document.querySelector('#screensaver-container iframe.screensaver-media');
        if (iframe && iframe.contentWindow) {
            try {
                iframe.contentWindow.postMessage(
                    Object.assign({ channel: 'akarinet-autopilot' }, state.lastStatus),
                    '*'
                );
            } catch (e) {}
        }
    }

    function setStatus(text, opts) {
        opts = opts || {};
        publish({
            text: text || '',
            percent: opts.percent != null ? opts.percent : null,
            busy: !!opts.busy,
            download: !!opts.download,
            idle: !!opts.idle
        });
    }

    function beginDownload(label) {
        state.downloadCount++;
        setStatus(label || 'Downloading…', { busy: true, download: true, percent: null });
        armDownloadScreensaver();
    }

    function endDownload(label) {
        state.downloadCount = Math.max(0, state.downloadCount - 1);
        if (state.downloadCount === 0) {
            setStatus('', { busy: false, download: false, idle: true, percent: 100 });
            clearDownloadScreensaver();
        } else {
            setStatus(label || ('Working… (' + state.downloadCount + ')'), { busy: true, download: true });
        }
    }

    function armDownloadScreensaver() {
        if (state.downloadTimer) return;
        state.downloadTimer = setTimeout(function () {
            state.downloadTimer = null;
            if (state.downloadCount > 0 && window.app && app.core) {
                app.core.showScreensaverForced(AUTOPILOT_URL);
            }
        }, DOWNLOAD_SS_DELAY_MS);
    }

    function clearDownloadScreensaver() {
        if (state.downloadTimer) {
            clearTimeout(state.downloadTimer);
            state.downloadTimer = null;
        }
        if (state.forcedScreensaver && window.app && app.core) {
            app.core.hideScreensaverForced();
        }
        if (window.app && app.core && app.core.armUserScreensaver) {
            app.core.armUserScreensaver();
        }
    }

    // ——— Night Mode helpers ———
    function parseTimeToMinutes(str) {
        if (!str || typeof str !== 'string') return 0;
        var parts = str.split(':');
        var h = parseInt(parts[0], 10) || 0;
        var m = parseInt(parts[1], 10) || 0;
        return h * 60 + m;
    }

    function isInsideNightWindow() {
        if (localStorage.getItem('selectedNightModeEnabled') !== 'true') return false;
        var start = parseTimeToMinutes(localStorage.getItem('selectedNightModeStart') || '22:00');
        var end = parseTimeToMinutes(localStorage.getItem('selectedNightModeEnd') || '07:00');
        var now = new Date();
        var cur = now.getHours() * 60 + now.getMinutes();
        if (start === end) return true;
        if (start < end) return cur >= start && cur < end;
        return cur >= start || cur < end;
    }

    function getNightModeRestoreMs() {
        var sec = parseInt(localStorage.getItem('selectedNightModeRestore') || '10', 10);
        return Math.max(5, isNaN(sec) ? 10 : sec) * 1000;
    }

    function shouldExitOnWake() {
        return localStorage.getItem('selectedNightModeExitWake') !== 'false';
    }

    function shouldFullscreenLock() {
        return localStorage.getItem('selectedNightModeFullscreen') === 'true';
    }

    function tryRequestFullscreen() {
        if (!shouldFullscreenLock()) return;
        if (!(state.nightModeActive || (window.app && app.screensaverActive && isInsideNightWindow()))) return;
        try {
            var el = document.documentElement;
            if (document.fullscreenElement || document.webkitFullscreenElement) return;
            var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
            if (req) req.call(el).catch(function () {});
        } catch (e) {}
    }

    function isNightModeUrl(url) {
        if (!url) return false;
        return /nightmode\.html/i.test(url) || url.indexOf('nightmode') !== -1;
    }

    function patchApp(app) {
        if (!app || !app.core || app.core.__autopilotPatched) return;
        app.core.__autopilotPatched = true;
        window.app = app;

        var AUTOPILOT = AUTOPILOT_URL;

        app.core.getScreensaverConfig = function () {
            if (state.nightModeActive || (isInsideNightWindow() && !state.forcedScreensaver)) {
                return {
                    enabled: true,
                    url: NIGHTMODE_URL,
                    timeoutMs: getNightModeRestoreMs(),
                    behavior: 'background',
                    interactive: true,
                    isNightMode: true
                };
            }
            var timeoutSec = parseInt(localStorage.getItem('selectedScreensaverTimeout') || '120', 10);
            var url = localStorage.getItem('selectedScreensaverURL') || '';
            return {
                enabled: localStorage.getItem('selectedScreensaverEnabled') === 'true',
                url: url,
                timeoutMs: Math.max(10, isNaN(timeoutSec) ? 120 : timeoutSec) * 1000,
                behavior: localStorage.getItem('selectedScreensaverResumeBehavior') || 'destroy',
                interactive: isNightModeUrl(url),
                isNightMode: false
            };
        };

        app.core.buildScreensaverContent = function (container, url, opts) {
            opts = opts || {};
            container.innerHTML = '';
            if (!url) return;
            // Resolve root-relative paths when host page is not at site root (e.g. /UI/beta)
            if (url && url.charAt(0) === '.' && !/^(https?:|data:|blob:|\/\/)/i.test(url)) {
                try {
                    var scripts = document.getElementsByTagName('script');
                    for (var si = scripts.length - 1; si >= 0; si--) {
                        var ssrc = scripts[si].src || '';
                        if (/\/engine\/autopilot\/bridge\.js/i.test(ssrc)) {
                            var root = ssrc.replace(/engine\/autopilot\/bridge\.js.*$/i, '');
                            url = root + url.replace(/^\.\//, '');
                            break;
                        }
                    }
                } catch (e) {}
            }
            if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) {
                var img = document.createElement('img');
                img.className = 'screensaver-media';
                img.src = url;
                img.alt = 'Screensaver';
                container.appendChild(img);
            } else {
                var ifr = document.createElement('iframe');
                ifr.className = 'screensaver-media';
                ifr.src = url;
                container.appendChild(ifr);
            }
            var interactive = opts.interactive || isNightModeUrl(url);
            if (!interactive) {
                var inputShield = document.createElement('div');
                inputShield.className = 'screensaver-input-shield';
                container.appendChild(inputShield);
            }
        };

        app.core.showScreensaver = function () {
            var container = document.getElementById('screensaver-container');
            if (!container || app.screensaverActive) return;
            var cfg = app.core.getScreensaverConfig();
            if (!cfg.enabled || !cfg.url) return;

            if (cfg.isNightMode) state.nightModeActive = true;

            if (!container.firstChild || cfg.behavior === 'destroy' || state.forcedScreensaver) {
                app.core.buildScreensaverContent(container, cfg.url, { interactive: cfg.interactive });
            }

            container.style.zIndex = '999998';
            container.classList.add('active');
            app.screensaverActive = true;
            window.emit && window.emit('screensaver_shown', { url: cfg.url, nightMode: !!cfg.isNightMode, timestamp: Date.now() });
            if (cfg.isNightMode) tryRequestFullscreen();
            setTimeout(function () { publish(state.lastStatus); }, 300);
        };

        app.core.showScreensaverForced = function (url) {
            var container = document.getElementById('screensaver-container');
            if (!container) return;
            state.forcedScreensaver = true;
            state.nightModeActive = false;
            app.core.buildScreensaverContent(container, url || AUTOPILOT, { interactive: false });
            container.style.zIndex = '999998';
            container.classList.add('active');
            app.screensaverActive = true;
            setTimeout(function () { publish(state.lastStatus); }, 300);
        };

        app.core.hideScreensaverForced = function () {
            state.forcedScreensaver = false;
            var container = document.getElementById('screensaver-container');
            if (!container) return;
            container.classList.remove('active');
            container.innerHTML = '';
            app.screensaverActive = false;
        };

        app.core.hideScreensaver = function (source) {
            source = source || 'activity';
            var container = document.getElementById('screensaver-container');
            if (!container || !app.screensaverActive) return;

            var cfg = app.core.getScreensaverConfig();
            var wasNight = state.nightModeActive || cfg.isNightMode;

            container.classList.remove('active');
            if ((cfg.behavior !== 'background' && !wasNight) || state.forcedScreensaver) {
                container.innerHTML = '';
            }
            state.forcedScreensaver = false;
            app.screensaverActive = false;
            window.emit && window.emit('screensaver_hidden', { source: source, nightMode: wasNight, timestamp: Date.now() });

            if (wasNight && isInsideNightWindow()) {
                clearTimeout(state.nightModeRestoreTimer);
                state.nightModeRestoreTimer = setTimeout(function () {
                    state.nightModeRestoreTimer = null;
                    if (isInsideNightWindow() && !app.screensaverActive && state.downloadCount === 0) {
                        state.nightModeActive = true;
                        app.core.showScreensaver();
                    }
                }, getNightModeRestoreMs());
            } else {
                state.nightModeActive = false;
            }
        };

        app.core.armUserScreensaver = function () {
            clearTimeout(app.screensaverTimer);
            var cfg = app.core.getScreensaverConfig();
            if (!cfg.enabled || !cfg.url) return;
            app.screensaverTimer = setTimeout(function () {
                if (state.downloadCount > 0) return;
                app.core.showScreensaver();
            }, cfg.timeoutMs);
        };

        app.core.registerUserActivity = function (source) {
            source = source || 'activity';
            clearTimeout(app.screensaverTimer);
            clearTimeout(state.nightModeRestoreTimer);

            var cfg = app.core.getScreensaverConfig();
            var isNight = state.nightModeActive || cfg.isNightMode;

            if (isNight && source !== 'init') {
                tryRequestFullscreen();
            }

            if (isNight && app.screensaverActive) {
                var isWake = source === 'akari:user-input' || source === 'wake-word' || source === 'speech';
                var isExit = source === 'nightmode-button';
                if (isExit || (isWake && shouldExitOnWake())) {
                    app.core.hideScreensaver(source);
                }
            } else if (source !== 'init') {
                app.core.hideScreensaver(source);
            }

            if (state.downloadCount > 0) {
                armDownloadScreensaver();
                return;
            }

            if (!isInsideNightWindow()) {
                app.core.armUserScreensaver();
            }
        };

        if (!app.core.__nightMsgBound) {
            app.core.__nightMsgBound = true;
            window.addEventListener('message', function (e) {
                if (e.data && e.data.type === 'akari-exit-nightmode') {
                    app.core.registerUserActivity('nightmode-button');
                }
            });
        }

        if (!app.core.__nightPoll) {
            app.core.__nightPoll = setInterval(function () {
                if (state.downloadCount > 0 || state.forcedScreensaver) return;
                if (isInsideNightWindow()) {
                    if (!app.screensaverActive) {
                        state.nightModeActive = true;
                        app.core.showScreensaver();
                    }
                } else if (state.nightModeActive && app.screensaverActive) {
                    state.nightModeActive = false;
                    app.core.hideScreensaver('night-window-end');
                    app.core.armUserScreensaver();
                }
            }, 30000);
        }

        if (!app.core.__ssListenersBound) {
            app.core.__ssListenersBound = true;
            var activityEvents = [
                'pointerdown', 'pointerup', 'touchstart', 'touchend',
                'mousedown', 'mouseup', 'keydown', 'click'
            ];
            activityEvents.forEach(function (evt) {
                document.addEventListener(evt, function () {
                    app.core.registerUserActivity(evt);
                }, { passive: true, capture: true });
            });
            window.addEventListener('akari:user-input', function () {
                app.core.registerUserActivity('akari:user-input');
            });
            window.addEventListener('audioConsoleWakeSound', function () {
                app.core.registerUserActivity('wake-word');
            });
            window.addEventListener('audioConsoleSpeechStart', function () {
                app.core.registerUserActivity('speech');
            });
        }

        var _loadModule = app.core.loadModule.bind(app.core);
        app.core.loadModule = function (key, src, label) {
            if (!src || src === 'off') return _loadModule(key, src, label);
            beginDownload('Loading ' + (label || key) + '…');
            return _loadModule(key, src, label).then(function () {
                endDownload((label || key) + ' ready');
            });
        };

        if (isInsideNightWindow()) {
            state.nightModeActive = true;
            setTimeout(function () { app.core.showScreensaver(); }, 800);
        } else {
            app.core.armUserScreensaver();
        }
    }

    window.AkariAutopilot = {
        setStatus: setStatus,
        beginDownload: beginDownload,
        endDownload: endDownload,
        publish: publish,
        attach: patchApp,
        get state() { return state; }
    };

    var tries = 0;
    (function wait() {
        if (window.app && window.app.core) {
            patchApp(window.app);
            return;
        }
        tries++;
        if (tries < 200) setTimeout(wait, 50);
    })();

    window.addEventListener('akari:autopilot', function (e) {
        if (e.detail) {
            if (e.detail.downloadStart) beginDownload(e.detail.text);
            else if (e.detail.downloadEnd) endDownload(e.detail.text);
            else setStatus(e.detail.text, e.detail);
        }
    });
})();
