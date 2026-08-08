/**
 * AKARINET AUDIO CONSOLE — ADAPTER v4.1.1
 * Bridges AkariNet Audio Console v4.1.1 into the Akari PWA UI.
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
        wakesoundDuration: 2750,
        wakesoundDelay: 5000,
        requireWakeSound: lsBool('ac41_requireWake', true),

        speechRecognitionProvider: ls('ac41_srProvider', 'transformers'),
        modelId: ls('ac41_transformersModel', 'onnx-community/moonshine-base-ONNX'),
        modelQuantization: 'q8',
        whisperCpp: ls('ac41_whisperUrl', '') ? { baseUrl: ls('ac41_whisperUrl', '') } : null,
        webSpeech: { lang: ls('ac41_webspeechLang', 'en-US') },

        vadThreshold: lsNum('ac41_vadThreshold', 0.5),
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
                    const pct = detail.score != null ? \`(\${(detail.score * 100).toFixed(0)}%)\` : '';
                    btn.innerText = \`● Akari \${pct}\`.trim();
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
    function playWakeSound() {
        if (!wakeAudio) return;
        wakeAudio.currentTime = 0;
        wakeAudio.play().catch(err => console.log('Wake sound playback failed:', err));
    }

    let voiceInstance = null;

    function injectGreenDot() {
        if (!config.xlCache || !config.xlCache.enabled) return;
        if (document.getElementById('ac41-mic-dot')) return;
        const dotStyle = document.createElement('style');
        dotStyle.textContent = \`
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
        \`;
        document.head.appendChild(dotStyle);
        const dot = document.createElement('div');
        dot.id = 'ac41-mic-dot';
        document.body.appendChild(dot);
        const menu = document.createElement('div');
        menu.id = 'ac41-buffer-menu';
        menu.innerHTML = \`
            <div style="color:#00e676;margin-bottom:8px;">Audio Buffer
              <button style="width:auto;float:right;background:transparent;color:#888;border:1px solid #444;" onclick="document.getElementById('ac41-buffer-menu').classList.remove('open')">✕</button>
            </div>
            <div id="ac41-buf-info" style="opacity:.7;font-size:11px;margin-bottom:10px;">Buffer: —</div>
            <input type="range" id="ac41-play-slider" min="1" max="60" value="10">
            <button id="ac41-play-btn">Play last N s</button>
            <button id="ac41-send-btn">Transcribe & Send</button>
            <button id="ac41-save-btn">Download WAV</button>
            <div id="ac41-send-msg" style="font-size:11px;color:#ffcc66;min-height:14px;"></div>
        \`;
        document.body.appendChild(menu);
        dot.onclick = (e) => {
            e.stopPropagation();
            menu.classList.toggle('open');
            if (menu.classList.contains('open') && voiceInstance?.xlCache) {
                document.getElementById('ac41-buf-info').textContent =
                    'Buffer: ' + Math.floor(voiceInstance.xlCache.availableMs / 1000) + 's available';
            }
        };
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== dot) menu.classList.remove('open');
        });
        document.getElementById('ac41-play-btn').onclick = () => {
            if (!voiceInstance?.xlCache) return;
            const ms = parseInt(document.getElementById('ac41-play-slider').value, 10) * 1000;
            try {
                const clip = voiceInstance.retrieveCache({ fromMsAgo: ms, format: 'wav' });
                const url = URL.createObjectURL(clip.audio);
                const audio = new Audio(url);
                audio.onended = () => URL.revokeObjectURL(url);
                audio.play();
            } catch (e) { console.error(e); }
        };
        document.getElementById('ac41-send-btn').onclick = async () => {
            if (!voiceInstance?.srProvider || voiceInstance.srProvider.isSessionBased) return;
            const ms = parseInt(document.getElementById('ac41-play-slider').value, 10) * 1000;
            const msg = document.getElementById('ac41-send-msg');
            try {
                const clip = voiceInstance.retrieveCache({ fromMsAgo: ms, format: 'float32' });
                const text = await voiceInstance.srProvider.transcribe(clip.audio);
                if (text && text.trim()) {
                    msg.textContent = 'Heard: ' + text.slice(0, 40);
                    if (window.bubble_incoming) window.bubble_incoming(text);
                    if (window.respond) window.respond(text);
                    window.dispatchEvent(new CustomEvent('akari:user-input', { detail: { source: 'audioConsole-buffer', value: text } }));
                } else msg.textContent = 'Nothing recognized.';
            } catch (e) { msg.textContent = String(e.message || e); }
        };
        document.getElementById('ac41-save-btn').onclick = () => {
            if (!voiceInstance?.xlCache) return;
            const ms = parseInt(document.getElementById('ac41-play-slider').value, 10) * 1000;
            try {
                const clip = voiceInstance.retrieveCache({ fromMsAgo: ms, format: 'wav' });
                const url = URL.createObjectURL(clip.audio);
                const a = document.createElement('a');
                a.href = url; a.download = 'akari-clip-' + Date.now() + '.wav';
                a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) { console.error(e); }
        };
    }

    function initAudioConsole() {
        if (window.voiceInit) return;
        window.voiceInit = true;
        initWakeAudio();
        apDownloadStart('Loading Audio Console models…');
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = \`
            import { AkarinetVoice } from 'https://76836.github.io/AkariNet-AudioConsole/audioConsole-4.1.1.js';
            const config = \${JSON.stringify(config)};
            const assistant = new AkarinetVoice(config);
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
            try {
                await assistant.init();
            } catch (err) {
                window.dispatchEvent(new CustomEvent('audioConsoleError', { detail: err.message || String(err) }));
            }
        \`;
        document.head.appendChild(script);
    }

    window.addEventListener('audioConsoleReady', () => {
        apDownloadEnd('Audio Console ready');
        apStatus('Audio Console ready', { busy: false, idle: true });
        if (window.loadscreen) window.loadscreen('AkariNet Audio Console v4.1.1 ready.');
        if (window.app?.notify) {
            app.notify('AkariNet', 'Audio Console v4.1.1 started successfully!', {
                borderColors: ['#00ccff', '#00FF00']
            });
        }
        voiceInstance = window.__ac41Voice || null;
        if (voiceInstance?.xlCache) injectGreenDot();
    });

    window.addEventListener('audioConsoleWakeSound', (e) => {
        setVisualState('wake', { score: e.detail.score });
        playWakeSound();
        pulseVrmWake('audioConsole-wakesound');
    });
    window.addEventListener('audioConsoleSpeechStart', () => {
        setVisualState('listening');
        pulseVrmWake('audioConsole-speechstart');
    });
    window.addEventListener('audioConsoleSpeechEnd', () => setVisualState('processing'));
    window.addEventListener('audioConsoleProcessing', () => {
        if (visualState !== 'result') setVisualState('processing');
    });
    window.addEventListener('audioConsoleResult', (e) => {
        if (window.app) app.isSilentMode = false;
        if (window.bubble_incoming) window.bubble_incoming(e.detail.text);
        if (window.app?.ui?.setTyping) app.ui.setTyping('Akari');
        if (window.respond) window.respond(e.detail.text);
        setVisualState('result');
        pulseVrmWake('audioConsole-result');
    });
    window.addEventListener('audioConsoleSpeechDiscarded', () => resetVisuals());
    window.addEventListener('audioConsoleProcessingEnd', () => {
        if (visualState === 'processing') resetVisuals();
    });
    window.addEventListener('audioConsoleError', (e) => {
        console.error('Audio Console Error:', e.detail);
        apDownloadEnd('Audio Console error');
        resetVisuals();
        if (window.app?.notify) {
            app.notify('AkariNet', 'Audio Console error: ' + e.detail, {
                borderColors: ['#ff3333', '#ff6666'], duration: 8000
            });
        }
    });

    if (!window.whisperTranscriber) {
        window.whisperTranscriber = {
            start: function () {
                if (window.__ac41Voice) window.__ac41Voice.activateWakeWord();
            },
            stop: function () {}
        };
    }

    if (window.loadscreen) window.loadscreen('AkariNet Audio Console v4.1.1 starting up...');
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAudioConsole);
    } else {
        initAudioConsole();
    }
})();
