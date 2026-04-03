(function () {
    'use strict';

    let currentTheme = 'normal';
    let purpleTimeout = null;

    const style = document.createElement('style');
    style.textContent = `
        #audio-status-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 5px;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
            background: linear-gradient(90deg, red, orange, yellow, green, cyan, blue, violet, red);
            background-size: 200% 100%;
        }
        #audio-status-bar.active {
            opacity: 1;
            animation: rgb-flow 3s linear infinite;
        }
        #audio-status-bar.purple-theme {
            background: linear-gradient(90deg, #800080, #ffffff, #00aaaa, #800080);
            background-size: 200% 100%;
            height: 10px;
            animation: rgb-flow 1.5s linear infinite;
        }
        @keyframes rgb-flow {
            from { background-position: 0% 0%; }
            to { background-position: 200% 0%; }
        }
    `;
    document.head.appendChild(style);

    const statusBar = document.createElement('div');
    statusBar.id = 'audio-status-bar';
    document.body.appendChild(statusBar);

    let wakeAudio = null;

function initWakeAudio() {
    // Create audio element for wake sound
    wakeAudio = new Audio();
    wakeAudio.src = 'https://76836.github.io/Akari/characters/akari/Summon.mp3';
    wakeAudio.preload = 'auto'; // Load in background
    wakeAudio.volume = 1.0;
    document.body.appendChild(wakeAudio);
}

    function initAudioConsole() {
        if (window.voiceInit) return;
        window.voiceInit = true;

        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `
            import { AkarinetVoice } from 'https://76836.github.io/AkariNet-AudioConsole/audioConsole-3.4.0.js';
            const config = {
                modelId: "onnx-community/moonshine-base-ONNX",
                modelQuantization: "q8",
                wakewords: [],
                wakesoundURL: "https://teachablemachine.withgoogle.com/models/SwNFRUBwu/",
                wakesoundThreshold: ${localStorage.getItem('wakeSense') || "0.85"},
                wakesoundIndex: 2,
                wakesoundDuration: 750,
                wakesoundDelay: 5000,
                requireWakeSound: true,
                vadThreshold: 0.85,
                cleanup: false,
                debugWakeSound: false
            };
            const assistant = new AkarinetVoice(config);
            assistant.addEventListener('ready', () => window.dispatchEvent(new CustomEvent('audioConsoleReady')));
            assistant.addEventListener('speechstart', () => window.dispatchEvent(new CustomEvent('audioConsoleSpeechStart')));
            assistant.addEventListener('speechend', () => window.dispatchEvent(new CustomEvent('audioConsoleSpeechEnd')));
            assistant.addEventListener('wakesound', (e) => window.dispatchEvent(new CustomEvent('audioConsoleWakeSound', { detail: e.detail })));
            assistant.addEventListener('speechdiscarded', () => window.dispatchEvent(new CustomEvent('audioConsoleSpeechDiscarded')));
            assistant.addEventListener('result', (e) => window.dispatchEvent(new CustomEvent('audioConsoleResult', { detail: e.detail })));
            assistant.addEventListener('error', (e) => window.dispatchEvent(new CustomEvent('audioConsoleError', { detail: e.detail })));
            await assistant.init();
        `;
        document.head.appendChild(script);
        initWakeAudio();
    }

    window.addEventListener('audioConsoleReady', () => {
        app.notify('AkariNet', 'Audio Console (adapter v2.1) has started successfully!', {
            borderColors: ['#00ccff', '#00FF00']
        });
    });

    window.addEventListener('audioConsoleSpeechStart', () => {
        if (purpleTimeout) { clearTimeout(purpleTimeout); purpleTimeout = null; }
        statusBar.classList.add('active');
        if (currentTheme === 'purple') statusBar.classList.add('purple-theme');
    });

    const resetVisuals = () => {
        statusBar.classList.remove('active', 'purple-theme');
        currentTheme = 'normal';
        app.ui.resetMic();
    };

    const handleEndSequence = () => {
        if (currentTheme === 'purple') {
            if (purpleTimeout) clearTimeout(purpleTimeout);
            purpleTimeout = setTimeout(resetVisuals, 5000);
        } else {
            resetVisuals();
        }
    };

    window.addEventListener('audioConsoleSpeechEnd', handleEndSequence);
    window.addEventListener('audioConsoleSpeechDiscarded', resetVisuals);

    window.addEventListener('audioConsoleWakeSound', (e) => {
    statusBar.classList.add('active', 'purple-theme');
    currentTheme = 'purple';
    if (purpleTimeout) { clearTimeout(purpleTimeout); purpleTimeout = null; }

    // Play the wake sound from the beginning
    if (wakeAudio) {
        wakeAudio.currentTime = 0; // Reset to beginning
        wakeAudio.play().catch(err => console.log('Audio playback failed:', err));
    }

    const btn = document.getElementById('micbutton');
    if (btn && (btn.innerText === 'voice' || btn.classList.contains('mic-off'))) {
        btn.className = 'button-long mic-on';
        btn.innerText = `hey Akari (${(e.detail.score * 100).toFixed(0)}%)`;
    }
});

    window.addEventListener('audioConsoleResult', (e) => {
        if (window.app) app.isSilentMode = false;
        if (window.bubble_incoming) window.bubble_incoming(e.detail.text);
        if (window.app?.ui?.setTyping) app.ui.setTyping('Akari');
        if (window.respond) window.respond(e.detail.text);
    });

    window.addEventListener('audioConsoleError', (e) => {
        console.error('Audio Console Error:', e.detail);
        resetVisuals();
    });

    // Create a dummy whisperTranscriber object if it doesn't exist
if (!window.whisperTranscriber) {
    window.whisperTranscriber = {
        start: function (isTrue) {
            console.log('Intercepted whisperTranscriber.start(), executed with:', isTrue);
            voice.activateWakeWord();
        }
    };
}
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAudioConsole);
    } else {
        initAudioConsole();
    }
})();
