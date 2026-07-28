/**
 * AkariNet Autopilot bridge
 * - Shared status bus for screensaver / status UI
 * - Download-aware screensaver (autopilot after 15s while busy)
 * - Touch / wake-word activity always resets the idle timer
 */
(function () {
    'use strict';

    var AUTOPILOT_URL = 'https://76836.github.io/Akari/engine/autopilot/status';
    var DOWNLOAD_SS_DELAY_MS = 15000;

    var bc = null;
    try { bc = new BroadcastChannel('akarinet-autopilot'); } catch (e) {}

    var state = {
        downloadCount: 0,
        downloadTimer: null,
        forcedScreensaver: false,
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

    function patchApp(app) {
        if (!app || !app.core || app.core.__autopilotPatched) return;
        app.core.__autopilotPatched = true;
        window.app = app;

        var AUTOPILOT = AUTOPILOT_URL;

        app.core.getScreensaverConfig = function () {
            var timeoutSec = parseInt(localStorage.getItem('selectedScreensaverTimeout') || '120', 10);
            var url = localStorage.getItem('selectedScreensaverURL') || '';
            return {
                enabled: localStorage.getItem('selectedScreensaverEnabled') === 'true',
                url: url,
                timeoutMs: Math.max(10, isNaN(timeoutSec) ? 120 : timeoutSec) * 1000,
                behavior: localStorage.getItem('selectedScreensaverResumeBehavior') || 'destroy'
            };
        };

        app.core.buildScreensaverContent = function (container, url) {
            container.innerHTML = '';
            if (!url) return;
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
            var inputShield = document.createElement('div');
            inputShield.className = 'screensaver-input-shield';
            container.appendChild(inputShield);
        };

        app.core.showScreensaver = function () {
            var container = document.getElementById('screensaver-container');
            if (!container || app.screensaverActive) return;
            var cfg = app.core.getScreensaverConfig();
            if (!cfg.enabled || !cfg.url) return;

            if (!container.firstChild || cfg.behavior === 'destroy' || state.forcedScreensaver) {
                app.core.buildScreensaverContent(container, cfg.url);
            }

            container.style.zIndex = '999998';
            container.classList.add('active');
            app.screensaverActive = true;
            window.emit && window.emit('screensaver_shown', { url: cfg.url, timestamp: Date.now() });
            setTimeout(function () { publish(state.lastStatus); }, 300);
        };

        app.core.showScreensaverForced = function (url) {
            var container = document.getElementById('screensaver-container');
            if (!container) return;
            state.forcedScreensaver = true;
            app.core.buildScreensaverContent(container, url || AUTOPILOT);
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
            container.classList.remove('active');
            if (cfg.behavior !== 'background' || state.forcedScreensaver) {
                container.innerHTML = '';
            }
            state.forcedScreensaver = false;
            app.screensaverActive = false;
            window.emit && window.emit('screensaver_hidden', { source: source, timestamp: Date.now() });
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

            // Any real interaction (tap, key, wake word, voice) dismisses screensaver
            if (source !== 'init') {
                app.core.hideScreensaver(source);
            }

            if (state.downloadCount > 0) {
                armDownloadScreensaver();
                return;
            }

            app.core.armUserScreensaver();
        };

        // Reliable mobile + desktop activity listeners (capture so nothing eats the event)
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
            // Wake word / voice / text input — dismiss like a tap
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

        app.core.armUserScreensaver();
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
