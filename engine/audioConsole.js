(function () {
    'use strict';

    let currentTheme = 'normal';
    let purpleTimeout = null;

    const style = document.createElement('style');
    style.textContent = `
        :root {
            --glow-speed: 6s;
            --glow-thickness: 500px;
            --glow-softness: 20px;
            --glow-opacity: 0.75;
        }
        .vignette {
            position: fixed;
            top: calc(var(--glow-thickness) * -1);
            left: calc(var(--glow-thickness) * -1);
            right: calc(var(--glow-thickness) * -1);
            bottom: calc(var(--glow-thickness) * -1);
            pointer-events: none;
            z-index: 500;
            border: var(--glow-thickness) solid;
            border-image-source: conic-gradient(from var(--angle),
                    red, orange, yellow, green, cyan, white, grey, darkgray);
            border-image-slice: 1;
            opacity: 0;
            filter: blur(var(--glow-softness));
            animation: rotate-glow var(--glow-speed) linear infinite;
            transition: opacity 0.3s ease-in-out;
        }
        .vignette.active {
            opacity: var(--glow-opacity);
        }
        .vignette.purple-theme {
            border-image-source: conic-gradient(from var(--angle),
                    #800080, #ffffff, #00aaaa);
            opacity: 1;
            animation: rotate-glow 3s linear infinite;
            --glow-softness: 80px;
        }
        @property --angle {
            syntax: '<angle>';
            initial-value: 0deg;
            inherits: false;
        }
        @keyframes rotate-glow {
            from {
                --angle: 0deg;
            }
            to {
                --angle: 360deg;
            }
        }
    `;
    document.head.appendChild(style);

    const glowEffect = document.createElement('div');
    glowEffect.className = 'vignette';
    glowEffect.id = 'audio-console-glow';
    document.body.appendChild(glowEffect);

    function initAudioConsole() {
        if (window.voiceInit) return;
        window.voiceInit = true;

        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `
            import { AkarinetVoice } from 'https://76836.github.io/AkariNet-AudioConsole/audioConsole-3.3.0.js';
            
            const config = {
                modelId: "onnx-community/moonshine-base-ONNX",
                modelQuantization: "q8",
                wakewords: [],
                wakesoundURL: "https://teachablemachine.withgoogle.com/models/SwNFRUBwu/",
                wakesoundThreshold: ${localStorage.getItem('wakeSense') || "0.75"},
                wakesoundIndex: 2,
                wakesoundDuration: 750,
                wakesoundDelay: 5000,
                requireWakeSound: true,
                vadThreshold: 0.75,
                cleanup: false,
                debugWakeSound: false
            };
            
            const assistant = new AkarinetVoice(config);
            
            assistant.addEventListener('ready', () => {
                window.dispatchEvent(new CustomEvent('audioConsoleReady'));
            });
            
            assistant.addEventListener('speechstart', () => {
                window.dispatchEvent(new CustomEvent('audioConsoleSpeechStart'));
            });
            
            assistant.addEventListener('speechend', () => {
                window.dispatchEvent(new CustomEvent('audioConsoleSpeechEnd'));
            });
            
            assistant.addEventListener('wakesound', (e) => {
                window.dispatchEvent(new CustomEvent('audioConsoleWakeSound', { detail: e.detail }));
            });
            
            assistant.addEventListener('speechdiscarded', () => {
                window.dispatchEvent(new CustomEvent('audioConsoleSpeechDiscarded'));
            });
            
            assistant.addEventListener('result', (e) => {
                window.dispatchEvent(new CustomEvent('audioConsoleResult', { detail: e.detail }));
            });
            
            assistant.addEventListener('error', (e) => {
                window.dispatchEvent(new CustomEvent('audioConsoleError', { detail: e.detail }));
            });
            
            await assistant.init();
        `;
        document.head.appendChild(script);
    }

    window.addEventListener('audioConsoleReady', () => {

        app.notify('AkariNet', 'Audio Console (adapter v1.0) has started successfully!', {
            borderColors: ['#00ccff', '#00FF00']
        });

    });

    window.addEventListener('audioConsoleSpeechStart', () => {
        if (purpleTimeout) {
            clearTimeout(purpleTimeout);
            purpleTimeout = null;
        }
        glowEffect.classList.add('active');
        if (currentTheme === 'purple') {
            glowEffect.classList.add('purple-theme');
        }
    });

    window.addEventListener('audioConsoleSpeechEnd', () => {
        if (currentTheme === 'purple') {
            if (purpleTimeout) clearTimeout(purpleTimeout);
            purpleTimeout = setTimeout(() => {
                glowEffect.classList.remove('active');
                if (currentTheme === 'purple') {
                    glowEffect.classList.remove('purple-theme');
                    currentTheme = 'normal';
                }
                purpleTimeout = null;
            }, 5000);
        } else {
            glowEffect.classList.remove('active');
            if (currentTheme === 'purple') {
                glowEffect.classList.remove('purple-theme');
                currentTheme = 'normal';
            }
        }

        app.ui.resetMic();
    });

    window.addEventListener('audioConsoleSpeechDiscarded', () => {
        if (currentTheme === 'purple') {
            if (purpleTimeout) clearTimeout(purpleTimeout);
            purpleTimeout = setTimeout(() => {
                glowEffect.classList.remove('active');
                if (currentTheme === 'purple') {
                    glowEffect.classList.remove('purple-theme');
                    currentTheme = 'normal';
                }
                purpleTimeout = null;
            }, 5000);
        } else {
            glowEffect.classList.remove('active');
            if (currentTheme === 'purple') {
                glowEffect.classList.remove('purple-theme');
                currentTheme = 'normal';
            }
        }

        if (window.app && window.app.ui && window.app.ui.resetMic) {
            app.ui.resetMic();
        }
    });

    window.addEventListener('audioConsoleWakeSound', (e) => {
        glowEffect.classList.add('purple-theme');
        currentTheme = 'purple';
        if (purpleTimeout) {
            clearTimeout(purpleTimeout);
            purpleTimeout = null;
        }

        const btn = document.getElementById('micbutton');
        if (btn && btn.innerText === 'voice') {
            btn.className = 'button-long mic-on';
            btn.innerText = `hey Akari (${(e.detail.score * 100).toFixed(0)}%)`;
        }
    });

    window.addEventListener('audioConsoleResult', (e) => {
        const result = e.detail.text;

        if (window.app) {
            app.isSilentMode = false;
        }
        if (window.bubble_incoming) {
            window.bubble_incoming(result);
        }
        if (window.app && window.app.ui && window.app.ui.setTyping) {
            app.ui.setTyping('Akari');
        }
        if (window.respond) {
            window.respond(result);
        }
    });

    window.addEventListener('audioConsoleError', (e) => {
        console.error('Audio Console Error:', e.detail);

        glowEffect.classList.remove('active');
        if (currentTheme === 'purple') {
            glowEffect.classList.remove('purple-theme');
            currentTheme = 'normal';
        }

        if (window.app && window.app.ui && window.app.ui.resetMic) {
            app.ui.resetMic();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAudioConsole);
    } else {
        initAudioConsole();
    }
})();
