/**
 * AkariNet Autopilot bridge
 * - Shared status bus for screensaver / status UI
 * - Download-aware screensaver (autopilot after 15s while busy)
 * - Fixes normal screensaver so it actually arms and shows
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
        lastStatus: { text: 'Autopilot standby', busy: false, percent: null }
    };

    function publish(msg) {
        state.lastStatus = Object.assign({}, state.lastStatus, msg, { t: Date.now() });
        try {
            localStorage.setItem('akari:autopilot', JSON.stringify(state.lastStatus));
        } catch (e) {}
        if (bc) {
            try { bc.postMessage(state.lastStatus); } catch (e) {}
        }
        // Push into live screensaver iframe if present
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
            text: text || state.lastStatus.text,
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
            setStatus(label || 'Ready', { busy: false, download: false, idle: true, percent: 100 });
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
        // Resume normal idle timer if user has screensaver enabled
        if (window.app && app.core && app.core.armUserScreensaver) {
            app.core.armUserScreensaver();
        }
    }

    function patchApp(app) {
        if (!app || !app.core || app.core.__autopilotPatched) return;
        app.core.__autopilotPatched = true;

        // Expose for modules
        window.app = app;

        var AUTOPILOT = AUTOPILOT_URL;

        app.core.getScreensaverConfig = function () {
            var timeoutSec = parseInt(localStorage.getItem('selectedScreensaverTimeout') || '120', 10);
            var url = localStorage.getItem('selectedScreensaverURL') || '';
            // Don't fall back to broken relative bg paths for screensaver
            if (!url) url = '';
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
                // allow same-origin-ish messaging
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
            // Push latest status into iframe
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
            // While a forced download screensaver is up, ignore soft activity hides
            // except explicit user interaction (pointer/key)
            if (state.forcedScreensaver && state.downloadCount > 0) {
                if (source === 'init' || source === 'akari:user-input') return;
                // pointer/key still dismisses
            }
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
                if (state.downloadCount > 0) return; // download policy owns it
                app.core.showScreensaver();
            }, cfg.timeoutMs);
        };

        app.core.registerUserActivity = function (source) {
            source = source || 'activity';
            clearTimeout(app.screensaverTimer);

            // Always hide on real user input (unless we want download SS sticky until click — click dismisses)
            if (source !== 'init') {
                app.core.hideScreensaver(source);
            }

            // If downloads active, keep download arm instead of user timer
            if (state.downloadCount > 0) {
                armDownloadScreensaver();
                return;
            }

            app.core.armUserScreensaver();
        };

        // Wrap loadModule to report downloads
        var _loadModule = app.core.loadModule.bind(app.core);
        app.core.loadModule = function (key, src, label) {
            if (!src || src === 'off') return _loadModule(key, src, label);
            beginDownload('Loading ' + (label || key) + '…');
            return _loadModule(key, src, label).then(function () {
                endDownload((label || key) + ' ready');
            });
        };

        // Re-bind activity listeners once (initScreensaver may have already run)
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

    // Attach when app appears
    var tries = 0;
    (function wait() {
        if (window.app && window.app.core) {
            patchApp(window.app);
            return;
        }
        // app may be a const — poll after scripts
        tries++;
        if (tries < 200) setTimeout(wait, 50);
    })();

    // Also listen for custom events from adapters
    window.addEventListener('akari:autopilot', function (e) {
        if (e.detail) {
            if (e.detail.downloadStart) beginDownload(e.detail.text);
            else if (e.detail.downloadEnd) endDownload(e.detail.text);
            else setStatus(e.detail.text, e.detail);
        }
    });
})();
