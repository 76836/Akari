/**
 * AKARINET AUDIO CONSOLE — ADAPTER v4.1 (replaces experimental 4f adapter)
 * ====================================================================
 * Bridges AkariNet Audio Console v4.1.0 into the Akari PWA UI.
 *
 * WHAT THIS ADAPTER DOES:
 *   1. Reads configuration from localStorage (set by settings/voice.html).
 *   2. Imports AkarinetVoice from the v4.1.0 ESM file.
 *   3. Wires every audio-console event to the Akari UI with ACCURATE,
 *      PERSISTENT visuals — the status indicator now stays lit through
 *      the entire wake → listen → process → result cycle, so you always
 *      know whether Akari is still hearing you.
 *   4. Creates the green mic indicator dot (Android-style) when the XL
 *      cache is enabled, with a click-to-open buffer menu (playback,
 *      send-to-Akari, save-clip).
 *   5. Bridges the legacy `whisperTranscriber` interface so existing
 *      Akari code (app.core.toggleVoice, app.ui.resetMic) works unchanged.
 *
 * VISUAL STATE MACHINE (the fix for "lighting effect went away too fast"):
 *
 *   IDLE ──wakesound──► WAKE ──speechstart──► LISTENING ──speechend──►
 *     PROCESSING ──(result|speechdiscarded|error)──► IDLE
 *
 *   The status bar and mic button reflect each state and PERSIST until
 *   the cycle completes. Previously the bar reset on speechend, making
 *   it impossible to tell if Akari was still transcribing. Now it stays
 *   lit through processing and only clears on result/discard/error.
 *
 *   States:
 *     IDLE       — bar hidden,            mic button "voice"
 *     WAKE       — bar purple (pulsing),  mic button "● Akari (XX%)"
 *     LISTENING  — bar RGB flow,          mic button "Listening..."
 *     PROCESSING — bar steady amber,      mic button "Processing..."
 *     RESULT     — brief green flash,     mic button "✓", then → IDLE
 *
 * GREEN MIC DOT (Android-style indicator):
 *   Shown only when XL cache is enabled. A small pulsing green dot
 *   fixed at the top-right of the screen. Click opens a menu:
 *     • Play back  — play the last N seconds from the buffer
 *     • Send clip  — transcribe a clip via the console's ASR and send
 *                    it to Akari as if the user said it
 *     • Save clip  — download a WAV of the last N seconds
 *
 * LOCALSTORAGE KEYS (set by settings/voice.html):
 *   ac41_wakeProvider       'openwakeword'|'teachablemachine'|'none'
 *   ac41_owwUrl             openWakeWord keyword model URL
 *   ac41_owwThreshold       0..1 (falls back to legacy 'wakeSense')
 *   ac41_srProvider         'transformers'|'whispercpp'|'webspeech'|'none'
 *   ac41_transformersModel  HuggingFace model id
 *   ac41_whisperUrl         whisper.cpp server base URL
 *   ac41_webspeechLang      BCP-47 language tag
 *   ac41_vadThreshold       0..1
 *   ac41_requireWake        'true'|'false'
 *   ac41_wakewords          comma-separated text wake words
 *   ac41_xlEnabled          'true'|'false'
 *   ac41_xlDuration         milliseconds (1000..3600000)
 *   ac41_xlVadOnly          'true'|'false'
 *   ac41_debug              'true'|'false'
 *   wakeSense               (legacy) wake sensitivity, used as threshold fallback
 *   selectedWakeScript      path to this adapter file (set by voice panel)
 */

(function () {
    'use strict';

    // ================================================================
    // CONFIGURATION — read from localStorage with sensible defaults
    // ================================================================

    const ls = (k, d) => localStorage.getItem(k) || d;
    const lsBool = (k, d) => ls(k, d) === 'true';
    const lsNum = (k, d) => { const v = parseFloat(ls(k, '')); return isNaN(v) ? d : v; };

    // Legacy wake sensitivity (0.81 default from the existing voice panel)
    // Used as the wake threshold for whichever provider is selected.
    const wakeThreshold = lsNum('ac41_owwThreshold', lsNum('wakeSense', 0.5));

    const config = {
        // Wake word provider
        wakeWordProvider: ls('ac41_wakeProvider', 'openwakeword'),
        openWakeWord: {
            keywordURL: ls('ac41_owwUrl', 'https://76836.github.io/Akari/engine/models/v2_hey_A_kar_e.onnx'),
            detectionThreshold: wakeThreshold
        },
        // Legacy TM config (only used if wakeWordProvider='teachablemachine')
        wakesoundURL: ls('ac41_tmUrl', 'https://teachablemachine.withgoogle.com/models/SwNFRUBwu/'),
        wakesoundThreshold: wakeThreshold,
        wakesoundIndex: 2,
        wakesoundDuration: 2750,
        wakesoundDelay: 5000,
        requireWakeSound: lsBool('ac41_requireWake', true),

        // Speech recognition provider
        speechRecognitionProvider: ls('ac41_srProvider', 'transformers'),
        modelId: ls('ac41_transformersModel', 'onnx-community/moonshine-base-ONNX'),
        modelQuantization: 'q8',
        whisperCpp: ls('ac41_whisperUrl', '') ? { baseUrl: ls('ac41_whisperUrl', '') } : null,
        webSpeech: { lang: ls('ac41_webspeechLang', 'en-US') },

        // VAD + text wake words
        vadThreshold: lsNum('ac41_vadThreshold', 0.5),
        wakewords: (ls('ac41_wakewords', 'hey akari,akari')).split(',').map(s => s.trim()).filter(Boolean),
        cleanup: false,
        debugWakeSound: lsBool('ac41_debug', false),

        // XL cache
        unifiedMic: true,
        liveCacheMs: 2000,
        xlCache: lsBool('ac41_xlEnabled', false) ? {
            enabled: true,
            durationMs: Math.max(1000, Math.min(3600000, lsNum('ac41_xlDuration', 60000))),
            vadOnly: lsBool('ac41_xlVadOnly', false)
        } : null
    };

    // ================================================================
    // VISUAL STATE MACHINE
    // ================================================================
    //
    // The status bar is a fixed bottom bar. The mic button (#micbutton)
    // is the existing Akari UI element. Both are driven by a single
    // state machine so they never disagree.
    //
    // The bar has three visual themes:
    //   .wake      — purple gradient (wake detected, awaiting speech)
    //   .listening — RGB flow (actively capturing speech)
    //   .processing— steady amber (transcribing)
    //   .result    — brief green flash (success)

    let visualState = 'idle';
    let wakeResetTimer = null;   // clears WAKE state if no speech follows
    let resultFlashTimer = null; // clears the RESULT flash

    // Inject the status bar styles + element
    const style = document.createElement('style');
    style.textContent = `
        #audio-status-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 6px;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.3s, height 0.3s;
            pointer-events: none;
        }
        #audio-status-bar.active { opacity: 1; height: 8px; }

        #audio-status-bar.listening {
            background: linear-gradient(90deg, #00ccff, #00ff66, #00ccff);
            background-size: 200% 100%;
            animation: ac41-flow 1.8s linear infinite;
        }
        #audio-status-bar.wake {
            background: linear-gradient(90deg, #800080, #cc66ff, #800080);
            background-size: 200% 100%;
            animation: ac41-flow 1.2s linear infinite;
            height: 10px;
        }
        #audio-status-bar.processing {
            background: linear-gradient(90deg, #ff9900, #ffcc00, #ff9900);
            background-size: 200% 100%;
            animation: ac41-flow 2.5s linear infinite;
            height: 8px;
        }
        #audio-status-bar.result {
            background: #00ff66;
            height: 10px;
            opacity: 1;
        }
        @keyframes ac41-flow {
            from { background-position: 0% 0%; }
            to { background-position: 200% 0%; }
        }
    `;
    document.head.appendChild(style);

    const statusBar = document.createElement('div');
    statusBar.id = 'audio-status-bar';
    // Insert after the body exists
    function attachStatusBar() {
        if (!document.body) { setTimeout(attachStatusBar, 50); return; }
        document.body.appendChild(statusBar);
    }
    attachStatusBar();

    /** Set the visual state. Manages the status bar + mic button text. */
    function setVisualState(state, detail = {}) {
        visualState = state;

        // Clear any pending wake-reset timer on state change
        if (wakeResetTimer && state !== 'wake') {
            clearTimeout(wakeResetTimer);
            wakeResetTimer = null;
        }

        const btn = document.getElementById('micbutton');

        // Reset all bar classes first
        statusBar.classList.remove('active', 'listening', 'wake', 'processing', 'result');

        switch (state) {
            case 'idle':
                // Full reset — bar hidden, mic button back to default
                statusBar.classList.remove('active');
                if (btn) { btn.className = 'button-long'; btn.innerText = 'voice'; }
                break;

            case 'wake':
                // Wake detected (sound or manual) — purple bar, green button
                statusBar.classList.add('active', 'wake');
                if (btn) {
                    btn.className = 'button-long mic-on';
                    const pct = detail.score != null ? `(${(detail.score * 100).toFixed(0)}%)` : '';
                    btn.innerText = `● Akari ${pct}`.trim();
                }
                // If no speech follows within 6s, fall back to idle
                wakeResetTimer = setTimeout(() => setVisualState('idle'), 6000);
                break;

            case 'listening':
                // VAD detected speech — RGB flow bar
                statusBar.classList.add('active', 'listening');
                if (btn) {
                    btn.className = 'button-long mic-on';
                    btn.innerText = 'Listening...';
                }
                break;

            case 'processing':
                // ASR is transcribing — amber bar, stays lit
                statusBar.classList.add('active', 'processing');
                if (btn) {
                    btn.className = 'button-long mic-on';
                    btn.innerText = 'Processing...';
                }
                break;

            case 'result':
                // Success — brief green flash, then idle
                statusBar.classList.add('active', 'result');
                if (btn) {
                    btn.className = 'button-long mic-on';
                    btn.innerText = '✓';
                }
                if (resultFlashTimer) clearTimeout(resultFlashTimer);
                resultFlashTimer = setTimeout(() => setVisualState('idle'), 800);
                break;
        }
    }

    /** Reset to idle (used on error/discard). Calls app.ui.resetMic for compat. */
    function resetVisuals() {
        if (resultFlashTimer) { clearTimeout(resultFlashTimer); resultFlashTimer = null; }
        if (wakeResetTimer) { clearTimeout(wakeResetTimer); wakeResetTimer = null; }
        visualState = 'idle';
        statusBar.classList.remove('active', 'listening', 'wake', 'processing', 'result');
        // Use Akari's own reset if available (resets button + calls whisperTranscriber.stop)
        if (window.app?.ui?.resetMic) {
            app.ui.resetMic();
        } else {
            const btn = document.getElementById('micbutton');
            if (btn) { btn.className = 'button-long'; btn.innerText = 'voice'; }
        }
    }

    // ================================================================
    // WAKE SOUND — play the summon chime on wake detection
    // ================================================================

    let wakeAudio = null;
    function initWakeAudio() {
        wakeAudio = new Audio('https://76836.github.io/Akari/characters/akari/Summon.mp3');
        wakeAudio.preload = 'auto';
        wakeAudio.volume = 1.0;
    }
    function playWakeSound() {
        if (!wakeAudio) return;
        wakeAudio.currentTime = 0;
        wakeAudio.play().catch(err => console.log('Wake sound playback failed:', err));
    }

    // ================================================================
    // GREEN MIC DOT + BUFFER MENU (only when XL cache is enabled)
    // ================================================================

    let voiceInstance = null; // reference to the AkarinetVoice instance

    function injectGreenDot() {
        if (!config.xlCache || !config.xlCache.enabled) return;
        if (document.getElementById('ac41-mic-dot')) return;

        const dotStyle = document.createElement('style');
        dotStyle.textContent = `
            #ac41-mic-dot {
                position: fixed;
                top: 12px;
                right: 12px;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #00e676;
                box-shadow: 0 0 8px #00e676, 0 0 4px #00e676;
                z-index: 9998;
                cursor: pointer;
                animation: ac41-dot-pulse 2s ease-in-out infinite;
                transition: transform 0.2s;
            }
            #ac41-mic-dot:hover { transform: scale(1.4); }
            @keyframes ac41-dot-pulse {
                0%, 100% { opacity: 1; box-shadow: 0 0 8px #00e676; }
                50% { opacity: 0.6; box-shadow: 0 0 14px #00e676; }
            }
            #ac41-buffer-menu {
                position: fixed;
                top: 34px;
                right: 12px;
                width: 300px;
                max-width: 90vw;
                background: #1e1e1e;
                border: 1px solid #00e676;
                border-radius: 12px;
                padding: 16px;
                z-index: 9999;
                color: #fff;
                font-family: system-ui, sans-serif;
                font-size: 13px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                display: none;
            }
            #ac41-buffer-menu.open { display: block; }
            #ac41-buffer-menu h3 {
                margin: 0 0 4px; font-size: 14px; color: #00e676;
                display: flex; justify-content: space-between; align-items: center;
            }
            #ac41-buffer-menu .buf-info { font-size: 11px; opacity: 0.7; margin-bottom: 14px; }
            #ac41-buffer-menu .buf-section {
                background: rgba(255,255,255,0.05);
                border-radius: 8px; padding: 10px; margin-bottom: 10px;
            }
            #ac41-buffer-menu .buf-label {
                font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
                color: #00e676; margin-bottom: 6px; display: block;
            }
            #ac41-buffer-menu input[type=range] {
                width: 100%; accent-color: #00e676; margin: 6px 0;
            }
            #ac41-buffer-menu .buf-time { font-size: 11px; opacity: 0.8; }
            #ac41-buffer-menu button {
                background: #00e676; color: #000; border: none; border-radius: 6px;
                padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600;
                width: 100%; margin-top: 4px;
            }
            #ac41-buffer-menu button:hover { filter: brightness(1.1); }
            #ac41-buffer-menu button:disabled { opacity: 0.4; cursor: default; }
            #ac41-buffer-menu .buf-close {
                background: transparent; color: #888; border: 1px solid #444;
                width: auto; padding: 2px 8px; font-size: 14px; margin: 0;
            }
            #ac41-buffer-menu .buf-msg { font-size: 11px; color: #ffcc66; margin-top: 6px; min-height: 14px; }
        `;
        document.head.appendChild(dotStyle);

        const dot = document.createElement('div');
        dot.id = 'ac41-mic-dot';
        dot.title = 'Audio buffer is active — click to manage';
        document.body.appendChild(dot);

        const menu = document.createElement('div');
        menu.id = 'ac41-buffer-menu';
        menu.innerHTML = `
            <h3>
                <span>🎙 Audio Buffer</span>
                <button class="buf-close" onclick="document.getElementById('ac41-buffer-menu').classList.remove('open')">✕</button>
            </h3>
            <div class="buf-info" id="ac41-buf-info">Buffer: —</div>

            <div class="buf-section">
                <span class="buf-label">▶ Play Back</span>
                <input type="range" id="ac41-play-slider" min="1" max="60" value="10" step="1">
                <div class="buf-time">Last <span id="ac41-play-time">10</span>s</div>
                <button id="ac41-play-btn">Play</button>
            </div>

            <div class="buf-section">
                <span class="buf-label">➤ Send Clip to Akari</span>
                <input type="range" id="ac41-send-slider" min="1" max="60" value="10" step="1">
                <div class="buf-time">Last <span id="ac41-send-time">10</span>s</div>
                <button id="ac41-send-btn">Transcribe &amp; Send</button>
                <div class="buf-msg" id="ac41-send-msg"></div>
            </div>

            <div class="buf-section">
                <span class="buf-label">💾 Save Clip</span>
                <input type="range" id="ac41-save-slider" min="1" max="60" value="10" step="1">
                <div class="buf-time">Last <span id="ac41-save-time">10</span>s</div>
                <button id="ac41-save-btn">Download WAV</button>
            </div>
        `;
        document.body.appendChild(menu);

        // Toggle menu on dot click
        dot.onclick = (e) => {
            e.stopPropagation();
            menu.classList.toggle('open');
            if (menu.classList.contains('open')) updateBufferInfo();
        };
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== dot) menu.classList.remove('open');
        });

        // Wire slider labels
        const wireSlider = (sliderId, labelId) => {
            const s = document.getElementById(sliderId);
            const l = document.getElementById(labelId);
            s.oninput = () => { l.textContent = s.value; updateSliderMax(); };
        };
        wireSlider('ac41-play-slider', 'ac41-play-time');
        wireSlider('ac41-send-slider', 'ac41-send-time');
        wireSlider('ac41-save-slider', 'ac41-save-time');

        // Wire action buttons
        document.getElementById('ac41-play-btn').onclick = playBackClip;
        document.getElementById('ac41-send-btn').onclick = sendClipToAkari;
        document.getElementById('ac41-save-btn').onclick = saveClip;
    }

    /** Update the "Buffer: Ns available" text and slider maxes. */
    function updateBufferInfo() {
        if (!voiceInstance?.xlCache) return;
        const availMs = voiceInstance.xlCache.availableMs;
        const availSec = Math.floor(availMs / 1000);
        document.getElementById('ac41-buf-info').textContent = `Buffer: ${availSec}s available`;
        updateSliderMax();
    }

    /** Cap all sliders at the available buffer time. */
    function updateSliderMax() {
        if (!voiceInstance?.xlCache) return;
        const availSec = Math.max(1, Math.floor(voiceInstance.xlCache.availableMs / 1000));
        ['ac41-play-slider', 'ac41-send-slider', 'ac41-save-slider'].forEach(id => {
            const s = document.getElementById(id);
            if (!s) return;
            const cap = Math.min(60, availSec);
            s.max = cap;
            if (parseInt(s.value) > cap) s.value = cap;
            const labelId = id.replace('-slider', '-time');
            const l = document.getElementById(labelId);
            if (l) l.textContent = s.value;
        });
    }

    /** Play back the last N seconds from the buffer. */
    function playBackClip() {
        if (!voiceInstance?.xlCache) return;
        const secs = parseInt(document.getElementById('ac41-play-slider').value);
        const ms = secs * 1000;
        try {
            const clip = voiceInstance.retrieveCache({ fromMsAgo: ms, format: 'wav' });
            const url = URL.createObjectURL(clip.audio);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            audio.play().catch(e => console.error('Playback failed:', e));
        } catch (e) {
            console.error('Playback error:', e);
        }
    }

    /**
     * Send a clip to Akari: retrieve from buffer, transcribe via the
     * console's ASR provider, then pass the transcript to window.respond().
     *
     * Uses the SAME ASR backend the user configured (transformers runs
     * in the worker; whispercpp POSTs to the server). For webspeech
     * (session-based, can't transcribe arbitrary audio), falls back to
     * playback with a notice.
     */
    async function sendClipToAkari() {
        if (!voiceInstance) return;
        const btn = document.getElementById('ac41-send-btn');
        const msg = document.getElementById('ac41-send-msg');
        const secs = parseInt(document.getElementById('ac41-send-slider').value);
        const ms = secs * 1000;

        const sr = voiceInstance.srProvider;
        if (!sr) {
            msg.textContent = 'No ASR provider configured.';
            return;
        }
        if (sr.isSessionBased) {
            msg.textContent = 'Web Speech can’t transcribe clips — playing back instead.';
            playBackClip();
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Transcribing...';
        msg.textContent = '';
        try {
            const clip = voiceInstance.retrieveCache({ fromMsAgo: ms, format: 'float32' });
            const text = await sr.transcribe(clip.audio);
            if (text && text.trim()) {
                msg.textContent = `Heard: "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`;
                // Send to Akari as a user message
                if (window.bubble_incoming) window.bubble_incoming(text);
                if (window.app?.ui?.setTyping) app.ui.setTyping('Akari');
                if (window.respond) window.respond(text);
            } else {
                msg.textContent = 'Nothing recognized in that clip.';
            }
        } catch (e) {
            msg.textContent = `Error: ${e.message || e}`;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Transcribe & Send';
        }
    }

    /** Save the last N seconds as a WAV download. */
    function saveClip() {
        if (!voiceInstance?.xlCache) return;
        const secs = parseInt(document.getElementById('ac41-save-slider').value);
        const ms = secs * 1000;
        try {
            const clip = voiceInstance.retrieveCache({ fromMsAgo: ms, format: 'wav' });
            const url = URL.createObjectURL(clip.audio);
            const a = document.createElement('a');
            a.href = url;
            a.download = `akari-clip-${Date.now()}.wav`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            console.error('Save error:', e);
        }
    }

    // ================================================================
    // INITIALIZATION
    // ================================================================

    function initAudioConsole() {
        if (window.voiceInit) return;
        window.voiceInit = true;

        initWakeAudio();

        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `
            import { AkarinetVoice } from 'https://76836.github.io/AkariNet-AudioConsole/audioConsole-4.1.0.js';

            const config = ${JSON.stringify(config)};

            const assistant = new AkarinetVoice(config);

            // Expose globally so the adapter's green-dot menu can access
            // retrieveCache(), srProvider, and xlCache.
            window.__ac41Voice = assistant;

            assistant.addEventListener('ready', () => window.dispatchEvent(new CustomEvent('audioConsoleReady')));
            assistant.addEventListener('speechstart', () => window.dispatchEvent(new CustomEvent('audioConsoleSpeechStart')));
            assistant.addEventListener('speechend', () => window.dispatchEvent(new CustomEvent('audioConsoleSpeechEnd')));
            assistant.addEventListener('wakesound', (e) => window.dispatchEvent(new CustomEvent('audioConsoleWakeSound', { detail: e.detail })));
            assistant.addEventListener('speechdiscarded', (e) => window.dispatchEvent(new CustomEvent('audioConsoleSpeechDiscarded', { detail: e.detail })));
            assistant.addEventListener('processing', () => window.dispatchEvent(new CustomEvent('audioConsoleProcessing')));
            assistant.addEventListener('processingend', () => window.dispatchEvent(new CustomEvent('audioConsoleProcessingEnd')));
            assistant.addEventListener('result', (e) => window.dispatchEvent(new CustomEvent('audioConsoleResult', { detail: e.detail })));
            assistant.addEventListener('error', (e) => window.dispatchEvent(new CustomEvent('audioConsoleError', { detail: e.detail })));

            await assistant.init();
        `;
        document.head.appendChild(script);
    }

    // ================================================================
    // EVENT WIRING — map console events to Akari UI
    // ================================================================

    // Ready — notify + inject green dot if XL cache is on
    window.addEventListener('audioConsoleReady', () => {
        if (window.loadscreen) window.loadscreen('AkariNet Audio Console v4.1 ready.');
        if (window.app?.notify) {
            app.notify('AkariNet', 'Audio Console v4.1 started successfully!', {
                borderColors: ['#00ccff', '#00FF00']
            });
        }
        // Grab the instance reference for the buffer menu
        voiceInstance = window.__ac41Voice || null;
        // Inject the green mic dot (only if XL cache enabled)
        if (voiceInstance?.xlCache) {
            injectGreenDot();
        }
    });

    // Wake detected — purple bar, play chime, show score
    window.addEventListener('audioConsoleWakeSound', (e) => {
        setVisualState('wake', { score: e.detail.score });
        playWakeSound();
    });

    // Speech start — switch to listening theme (clears wake-reset timer)
    window.addEventListener('audioConsoleSpeechStart', () => {
        setVisualState('listening');
    });

    // Speech end — enter processing state (bar STAYS, does NOT reset)
    // This is the key fix: previously the bar reset here, making it look
    // like Akari stopped listening before it even finished transcribing.
    window.addEventListener('audioConsoleSpeechEnd', () => {
        setVisualState('processing');
    });

    // Processing event — ASR is running (redundant with speechend state,
    // but ensures the bar stays lit even if speechend was missed)
    window.addEventListener('audioConsoleProcessing', () => {
        if (visualState !== 'result') setVisualState('processing');
    });

    // Result — success flash, then idle. Send text to Akari.
    window.addEventListener('audioConsoleResult', (e) => {
        if (window.app) app.isSilentMode = false;
        if (window.bubble_incoming) window.bubble_incoming(e.detail.text);
        if (window.app?.ui?.setTyping) app.ui.setTyping('Akari');
        if (window.respond) window.respond(e.detail.text);
        setVisualState('result');
    });

    // Speech discarded — reset to idle (wake not detected, too short, etc.)
    window.addEventListener('audioConsoleSpeechDiscarded', () => {
        resetVisuals();
    });

    // Processing end — ensure reset if no result fired
    window.addEventListener('audioConsoleProcessingEnd', () => {
        // Only reset if we're still in processing (result already handled)
        if (visualState === 'processing') resetVisuals();
    });

    // Error — reset + notify
    window.addEventListener('audioConsoleError', (e) => {
        console.error('Audio Console Error:', e.detail);
        resetVisuals();
        if (window.app?.notify) {
            app.notify('AkariNet', `Audio Console error: ${e.detail}`, {
                borderColors: ['#ff3333', '#ff6666'],
                duration: 8000
            });
        }
    });

    // ================================================================
    // LEGACY BRIDGE — whisperTranscriber shim
    // ================================================================
    //
    // Akari's app.core.toggleVoice() calls whisperTranscriber.start(true)
    // and app.ui.resetMic() calls whisperTranscriber.stop(). We provide
    // a shim that bridges these to the audio console's activateWakeWord().

    if (!window.whisperTranscriber) {
        window.whisperTranscriber = {
            start: function (isTrue) {
                // Called by toggleVoice when user clicks the mic button.
                // Triggers a manual wake — the next utterance is transcribed.
                if (window.__ac41Voice) {
                    window.__ac41Voice.activateWakeWord();
                }
            },
            stop: function () {
                // No-op — the audio console manages its own lifecycle.
                // Visuals are reset by the adapter's event handlers.
            }
        };
    }

    // ================================================================
    // BOOT
    // ================================================================

    if (window.loadscreen) {
        window.loadscreen('AkariNet Audio Console v4.1 starting up...');
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAudioConsole);
    } else {
        initAudioConsole();
    }
})();
