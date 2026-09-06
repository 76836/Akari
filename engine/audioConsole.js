/**
 * AKARINET AUDIO CONSOLE — ADAPTER v4.2.1
 * Thin bootstrap: loads the known-good v4.2.0 adapter from the pinned commit,
 * rewrites its Audio Console import to v4.2.1 (progressive Vosk), then runs it.
 * Avoids shipping a truncated copy of the large adapter on main.
 */
(function () {
    'use strict';
    const ADAPTER_SRC =
        'https://cdn.jsdelivr.net/gh/76836/Akari@92f1c4a0bc065095342c7c53136bb418eaa4dc4b/engine/audioConsole.js';
    const FROM = 'https://76836.github.io/AkariNet-AudioConsole/audioConsole-4.2.0.js';
    const TO   = 'https://76836.github.io/AkariNet-AudioConsole/audioConsole-4.2.1.js';

    if (window.__ac421Boot) return;
    window.__ac421Boot = true;

    fetch(ADAPTER_SRC, { cache: 'force-cache' })
        .then(function (r) {
            if (!r.ok) throw new Error('adapter fetch ' + r.status);
            return r.text();
        })
        .then(function (src) {
            if (src.indexOf(FROM) === -1) {
                console.warn('[AudioConsole] pinned adapter missing 4.2.0 import; using as-is');
            }
            var patched = src
                .split(FROM).join(TO)
                .replace(/ADAPTER v4\.2\.0/g, 'ADAPTER v4.2.1')
                .replace(/Audio Console v4\.2\.0/g, 'Audio Console v4.2.1');
            // Run as classic script (original adapter is an IIFE, not a module)
            var s = document.createElement('script');
            s.textContent = patched;
            document.head.appendChild(s);
        })
        .catch(function (e) {
            console.error('[AudioConsole] bootstrap failed', e);
            if (window.loadscreen) window.loadscreen('Audio Console failed to load: ' + (e.message || e));
        });
})();
