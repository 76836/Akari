/**
 * AKARINET AUDIO CONSOLE — ADAPTER v4.2.1
 * Bridges AkariNet Audio Console v4.2.1 into the Akari PWA UI.
 * Includes autopilot status updates for wake / listen / process / downloads.
 * v4.1.1: Firefox-safe AudioBus (hardware-rate context + worklet resample).
 * Also emits akari:user-input on wake/speech/result so VRM hibernate can wake.
 */

(function () {
    'use strict';

    const ls = (k, d) => localStorage.getItem(k) || d;
    const lsBool = (k, d) => ls(k, d) === 'true';
    const lsNum = (k, d) => { const v = parseFloat(ls(k, '')); return isNaN(v) ? d : v; };

    const wakeThreshold = lsNum('ac41_owwThreshold', lsNum('wakeSense', 0.5));

    const config = {
        wakeWordProvider: ls('ac41_wakeProvider', 'openwakeword'),
        openWakeWord: {
            keywordURL: ls('ac41_owwUrl', 'https://76836.github.io/Akari/engine/models/v2_hey_A_kar_e.onnx'),
            detectionThreshold: wakeThreshold
        },
        wakesoundURL: ls('ac41_tmUrl', 'https://teachablemachine.withgoogle.com/models/SwNFRUBwu/'),
        wakesoundThreshold: wakeThreshold,
        wakesoundIndex: 2,
        wakesoundDuration: 8000,
        wakesoundDelay: 5000,
        manualListenMs: lsNum('ac41_manualListenMs', 12000),
        requireWakeSound: lsBool('ac41_requireWake', true),
        continuedConversation: lsBool('ac41_continuedConversation', false),
        continuedMs: lsNum('ac41_continuedMs', 7000),

        speechRecognitionProvider: ls('ac41_srProvider', 'vosk'),
        modelId: ls('ac41_transformersModel', 'onnx-community/moonshine-base-ONNX'),
        modelQuantization: 'q8',
        whisperCpp: ls('ac41_whisperUrl', '') ? { baseUrl: ls('ac41_whisperUrl', '') } : null,
        webSpeech: { lang: ls('ac41_webspeechLang', 'en-US') },
        vosk: {
            modelUrl: ls('ac41_voskModelUrl', 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz')
        },

        vadThreshold: lsNum('ac41_vadThreshold', 0.5),
        // Longer end-of-speech silence so pauses mid-utterance stay one segment (~1.6s)
        vadRedemptionMs: lsNum('ac41_vadRedemptionMs', 1600),
        wakewords: (ls('ac41_wakewords', 'hey akari,akari')).split(',').map(s => s.trim()).filter(Boolean),
        cleanup: false,
        debugWakeSound: lsBool('ac41_debug', false),

        unifiedMic: true,
        liveCacheMs: 2000,
        xlCache: lsBool('ac41_xlEnabled', false) ? {
            enabled: true,
            durationMs: Math.max(1000, Math.min(3600000, lsNum('ac41_xlDuration', 60000))),
            vadOnly: lsBool('ac41_xlVadOnly', false)
        } : null
    };

    function apStatus(text, opts) {
        if (window.AkariAutopilot) {
            window.AkariAutopilot.setStatus(text, opts || {});
            return;
        }
        window.dispatchEvent(new CustomEvent('akari:autopilot', { detail: Object.assign({ text: text }, opts || {}) }));
    }
    function apDownloadStart(text) {
        if (window.AkariAutopilot) window.AkariAutopilot.beginDownload(text);
        else window.dispatchEvent(new CustomEvent('akari:autopilot', { detail: { text: text, downloadStart: true } }));
    }
    function apDownloadEnd(text) {
        if (window.AkariAutopilot) window.AkariAutopilot.endDownload(text);
        else window.dispatchEvent(new CustomEvent('akari:autopilot', { detail: { text: text, downloadEnd: true } }));
    }

    // Tiny wake signal for VRM hibernate (CDN engine early-outs; shell polls this key)
    function pulseVrmWake(source) {
        try {
            var cur = (localStorage.getItem('v2emote') || '').toLowerCase();
            if (cur === 'hibernate' || !cur) localStorage.setItem('v2emote', 'neutral');
            localStorage.setItem('akari:vrm-wake', String(Date.now()) + '|' + (source || 'voice'));
        } catch (e) {}
        try {
            window.dispatchEvent(new CustomEvent('akari:user-input', { detail: { source: source || 'audioConsole-voice' } }));
        } catch (e) {}
    }

    let visualState = 'idle';
    let wakeResetTimer = null;
    let resultFlashTimer = null;

    const style = document.createElement('style');
    style.textContent = `
        #audio-status-bar {
            position: fixed; bottom: 0; left: 0; width: 100%; height: 6px;
            z-index: 9999; opacity: 0; transition: opacity 0.3s, height 0.3s; pointer-events: none;
        }
        #audio-status-bar.active { opacity: 1; height: 8px; }
        #audio-status-bar.listening {
            background: linear-gradient(90deg, #00ccff, #00ff66, #00ccff);
            background-size: 200% 100%; animation: ac41-flow 1.8s linear infinite;
        }
        #audio-status-bar.wake {
            background: linear-gradient(90deg, #800080, #cc66ff, #800080);
            background-size: 200% 100%; animation: ac41-flow 1.2s linear infinite; height: 10px;
        }
        #audio-status-bar.processing {
            background: linear-gradient(90deg, #ff9900, #ffcc00, #ff9900);
            background-size: 200% 100%; animation: ac41-flow 2.5s linear infinite; height: 8px;
        }
        #audio-status-bar.result { background: #00ff66; height: 10px; opacity: 1; }
        @keyframes ac41-flow {
            from { background-position: 0% 0%; }
            to { background-position: 200% 0%; }
        }
    `;
    document.head.appendChild(style);

    const statusBar = document.createElement('div');
    statusBar.id = 'audio-status-bar';
    function attachStatusBar() {
        if (!document.body) { setTimeout(attachStatusBar, 50); return; }
        document.body.appendChild(statusBar);
    }
    attachStatusBar();

    function setVisualState(state, detail = {}) {
        visualState = state;
        if (wakeResetTimer && state !== 'wake') {
            clearTimeout(wakeResetTimer);
            wakeResetTimer = null;
        }
        const btn = document.getElementById('micbutton');
        statusBar.classList.remove('active', 'listening', 'wake', 'processing', 'result');

        switch (state) {
            case 'idle':
                statusBar.classList.remove('active');
                if (btn) { btn.className = 'button-long'; btn.innerText = 'voice'; }
                apStatus('Audio Console idle', { busy: false, idle: true });
                break;
            case 'wake':
                statusBar.classList.add('active', 'wake');
                if (btn) {
                    btn.className = 'button-long mic-on';
                    const pct = detail.score != null ? `(${(detail.score * 100).toFixed(0)}%)` : '';
                    btn.innerText = `● Akari ${pct}`.trim();
                }
                apStatus('Wake detected — listening for command', { busy: false });
                wakeResetTimer = setTimeout(() => setVisualState('idle'), 6000);
                break;
            case 'listening':
                statusBar.classList.add('active', 'listening');
                if (btn) { btn.className = 'button-long mic-on'; btn.innerText = 'Listening...'; }
                apStatus('Listening…', { busy: true });
                break;
            case 'processing':
                statusBar.classList.add('active', 'processing');
                if (btn) { btn.className = 'button-long mic-on'; btn.innerText = 'Processing...'; }
                apStatus('Transcribing speech…', { busy: true });
                break;
            case 'result':
                statusBar.classList.add('active', 'result');
                if (btn) { btn.className = 'button-long mic-on'; btn.innerText = '✓'; }
                apStatus('Command received', { busy: false, idle: true });
                if (resultFlashTimer) clearTimeout(resultFlashTimer);
                resultFlashTimer = setTimeout(() => setVisualState('idle'), 800);
                break;
        }
    }

    function resetVisuals() {
        if (resultFlashTimer) { clearTimeout(resultFlashTimer); resultFlashTimer = null; }
        if (wakeResetTimer) { clearTimeout(wakeResetTimer); wakeResetTimer = null; }
        visualState = 'idle';
        statusBar.classList.remove('active', 'listening', 'wake', 'processing', 'result');
        if (window.app?.ui?.resetMic) app.ui.resetMic();
        else {
            const btn = document.getElementById('micbutton');
            if (btn) { btn.className = 'button-long'; btn.innerText = 'voice'; }
        }
        apStatus('Audio Console idle', { busy: false, idle: true });
    }

    let wakeAudio = null;
    function initWakeAudio() {
        wakeAudio = new Audio('https://76836.github.io/Akari/characters/akari/Summon.mp3');
        wakeAudio.preload = 'auto';
        wakeAudio.volume = 1.0;
    }
    const WAKE_GREETINGS = ["what's up?", "hey", "hello", "hi", "yeah?"];
    /** Resolves when the wake chime / greeting has finished (event-driven, no fixed lag guess). */
    function playWakeSound() {
        return new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                resolve();
            };
            if (lsBool('ac41_ttsGreeting', false) && typeof window.speak === 'function') {
                const phrase = WAKE_GREETINGS[Math.floor(Math.random() * WAKE_GREETINGS.length)];
                const onEnd = () => finish();
                window.addEventListener('akari:tts-end', onEnd, { once: true });
                try { window.speak(phrase); } catch (e) {
                    console.log('Wake TTS greeting failed:', e);
                    finish();
                    return;
                }
                // Safety only if TTS never signals end
                setTimeout(finish, 15000);
                return;
            }
            if (!wakeAudio) { finish(); return; }
            try {
                wakeAudio.onended = finish;
                wakeAudio.onerror = finish;
                wakeAudio.currentTime = 0;
                wakeAudio.play().catch((err) => {
                    console.log('Wake sound playback failed:', err);
                    finish();
                });
            } catch (e) {
                finish();
            }
        });
    }

    // Gate ASR until after wake chime/greeting so only post-wake speech is transcribed
    window.__ac41AsrBlocked = false;

    let voiceInstance = null;
    let processingSafetyTimer = null;
    let continuedArmTimer = null;
    let continuedEnabled = () => lsBool('ac41_continuedConversation', false);
    let continuedMs = () => lsNum('ac41_continuedMs', 7000);
    let manualListenMs = () => lsNum('ac41_manualListenMs', 12000);

    function clearProcessingSafety() {
        if (processingSafetyTimer) {
            clearTimeout(processingSafetyTimer);
            processingSafetyTimer = null;
        }
    }

    function armProcessingSafety(ms) {
        clearProcessingSafety();
        processingSafetyTimer = setTimeout(() => {
            processingSafetyTimer = null;
            console.warn('[AudioConsole] Processing safety timeout — forcing cancel');
            if (voiceInstance && typeof voiceInstance.cancelProcessing === 'function') {
                voiceInstance.cancelProcessing();
            } else if (voiceInstance) {
                voiceInstance._isProcessing = false;
                try { voiceInstance.dispatchEvent(new Event('processingend')); } catch (_) {}
            }
            resetVisuals();
            apStatus('Listening timed out', { busy: false, idle: true });
        }, ms || 15000);
    }

    /** Re-arm listening without wake word after Akari fully finishes speaking. */
    function armContinuedListen() {
        if (!continuedEnabled()) return;
        if (!voiceInstance) return;
        // Wait until tool turns and TTS are idle
        if (window.AkariActions && window.AkariActions.state && window.AkariActions.state.running) {
            setTimeout(armContinuedListen, 250);
            return;
        }
        if (window.__ac41TtsBusy) {
            setTimeout(armContinuedListen, 250);
            return;
        }
        const ms = continuedMs();
        if (continuedArmTimer) clearTimeout(continuedArmTimer);
        continuedArmTimer = setTimeout(() => {
            continuedArmTimer = null;
            if (!continuedEnabled() || !voiceInstance) return;
            try {
                window.__ac41AsrBlocked = false;
                voiceInstance.activateWakeWord({ listenMs: ms, kind: 'continued' });
                // Same visual as "Hey Akari" — stay lit for the full grace window
                setVisualState('wake');
                if (wakeResetTimer) { clearTimeout(wakeResetTimer); wakeResetTimer = null; }
                wakeResetTimer = setTimeout(() => {
                    if (visualState === 'wake' || visualState === 'listening') resetVisuals();
                }, ms);
                apStatus('Continued listening…', { busy: true });
            } catch (e) {
                console.warn('[AudioConsole] continued arm failed', e);
            }
        }, 200);
    }


    function injectGreenDot() {
        if (!config.xlCache || !config.xlCache.enabled) return;
        if (document.getElementById('ac41-mic-dot')) return;
        const dotStyle = document.createElement('style');
        dotStyle.textContent = `
            #ac41-mic-dot {
                position: fixed; top: 12px; right: 12px; width: 12px; height: 12px;
                border-radius: 50%; background: #00e676;
                box-shadow: 0 0 8px #00e676; z-index: 9998; cursor: pointer;
                animation: ac41-dot-pulse 2s ease-in-out infinite;
            }
            @keyframes ac41-dot-pulse {
                0%, 100% { opacity: 1; } 50% { opacity: 0.6; }
            }
            #ac41-buffer-menu {
                position: fixed; top: 34px; right: 12px; width: 300px; max-width: 90vw;
                background: #1e1e1e; border: 1px solid #00e676; border-radius: 12px;
                padding: 16px; z-index: 9999; color: #fff; font-family: system-ui, sans-serif;
                font-size: 13px; display: none;
            }
            #ac41-buffer-menu.open { display: block; }
            #ac41-buffer-menu button {
                background: #00e676; color: #000; border: none; border-radius: 6px;
                padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600;
                width: 100%; margin-top: 4px;
            }
            #ac41-buffer-menu input[type=range] { width: 100%; accent-color: #00e676; }
        `;
        document.head.appendChild(dotStyle);
        const dot = document.createElement('div');
        dot.id = 'ac41-mic-dot';
        document.body.appendChild(dot);
        const menu = document.createElement('div');
        menu.id = 'ac41-buffer-menu';
        menu.innerHTML = `
            <div style="color:#00e676;margin-bottom:8px;">Audio Buffer
              <button style="width:auto;float:right;background:transparent;color:#888;border:1px solid #444;" onclick="document.getElementById('ac41-buffer-menu').classList.remove('open')">✕</button>
            </div>
            <div id="ac41-buf-info" style="opacity:.7;font-size:11px;margin-bottom:10px;">Buffer: —</div>
            <input type="range" id="ac41-play-slider" min="1" max="60" value="10">
            <button id="ac41-play-btn">Play last N s</button>
            <button id="ac41-send-btn">Transcribe & Send</button>
            <button id="ac41-save-btn">Download WAV</button>
            <div id="ac41-send-msg" style="font-size:11px;color:#ffcc66;min-height:14px;"></div>
        `;
        document.body.appendChild(menu);
        dot.onclick = (e) => {
            e.stopPropagation();
            menu.classList.toggle('open');
            if (menu.classList.contains('open') && voiceInstance?.xlCache) {
                document.getElementById('ac41-buf-info').textContent =
