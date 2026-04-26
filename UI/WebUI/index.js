(function() {
    'use strict';

    // 1. Global Event Bus (Required by Automata)
    const _eventHandlers = new Map();

    window.on = function(eventName, handler) {
        const handlerId = Math.random().toString(36).substr(2, 9);
        const wrapper = (e) => handler(e.detail);
        if (!_eventHandlers.has(eventName)) _eventHandlers.set(eventName, new Map());
        _eventHandlers.get(eventName).set(handlerId, wrapper);
        window.addEventListener(eventName, wrapper);
        return handlerId;
    };

    window.off = function(eventName, handlerId) {
        const handlers = _eventHandlers.get(eventName);
        if (handlers && handlers.has(handlerId)) {
            window.removeEventListener(eventName, handlers.get(handlerId));
            handlers.delete(handlerId);
        }
    };

    window.emit = function(eventName, data) {
        const event = new CustomEvent(eventName, { detail: data });
        window.dispatchEvent(event);
    };

    window.log = function(level, message, extra) {
        console.log(`[${level.toUpperCase()}]`, message, extra || '');
        const logEl = document.getElementById('boot-log');
        if (logEl) {
            logEl.innerHTML += `${message}<br>`;
        }
    };

    // 2. UI Bindings
    window.showNotification = function(title, message, options = {}) {
        const { duration = 5000, borderColors, borderColor, image } = options;
        const container = document.getElementById('notificationArea');
        const note = document.createElement('div');
        note.className = 'notification-container';

        let colors = borderColors || (borderColor ? [borderColor, borderColor] : null);
        if (colors) {
            note.classList.add('animated-border');
            note.style.setProperty('--border-colors', colors.join(', '));
            const glow = colors[0].match(/\d+/g)?.join(',') || '255,255,255';
            note.style.setProperty('--glow-color', glow);
        }

        note.innerHTML = `
            ${image ? `<img src="${image}" class="notification-image">` : ''}
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-body">${message}</div>
            </div>
            <button class="notification-close" style="position: absolute; top: 12px; right: 12px; width: 20px; height: 20px; border: none; background: none; cursor: pointer; color: white;">✕</button>
        `;

        container.prepend(note);
        requestAnimationFrame(() => note.classList.add('show'));
        const close = () => { note.classList.remove('show'); setTimeout(() => note.remove(), 400); };
        note.querySelector('.notification-close').onclick = close;
        if (duration) setTimeout(close, duration);
    };

    window.say = async function(text, source) {
        window.bubble(text);
        
        const applicants = [];
        window.emit('tts_request', {
            text: text,
            source: source,
            apply: (handler, index) => {
                applicants.push({ handler, index });
            }
        });

        await new Promise(r => setTimeout(r, 50));

        if (applicants.length > 0) {
            applicants.sort((a, b) => b.index - a.index);
            await applicants[0].handler();
        }
    };

    window.bubble = function(text) {
        const container = document.getElementById('messages-container');
        const bubble = document.createElement('div');
        bubble.className = 'responsetxt';
        bubble.innerText = text;
        container.appendChild(bubble);
        container.scrollTop = container.scrollHeight;
    };

    window.bubble_incoming = function(text) {
        const container = document.getElementById('messages-container');
        const bubble = document.createElement('div');
        bubble.className = 'command';
        bubble.innerText = text;
        container.appendChild(bubble);
        container.scrollTop = container.scrollHeight;
    };

    window.newwindow = function(url) {
        const layer = document.getElementById('window-layer');
        layer.innerHTML = `
            <iframe src="${url}" class="windowstyle"></iframe>
            <button class="close-btn" onclick="window.closeWindow()">Close Window</button>
        `;
    };

    window.closeWindow = function() {
        document.getElementById('window-layer').innerHTML = '';
    };

    window.toggleChat = function(forceState) {
        const wrapper = document.getElementById('chat-wrapper');
        const btn = document.getElementById('chatToggle');
        const isClosing = forceState === 'min' || !wrapper.classList.contains('hidden-chat');
        const container = document.getElementById('messages-container');

        if (isClosing) {
            wrapper.classList.add('hidden-chat');
            wrapper.classList.remove('full-view');
            btn.innerText = '+';
        } else {
            wrapper.classList.remove('hidden-chat');
            wrapper.classList.add('full-view');
            btn.innerText = '-';
        }
        container.scrollTop = container.scrollHeight;
    };

    let isVoiceActive = false;

    window.setVoiceStatus = function(status, label) {
        const btn = document.getElementById('micbutton');
        if (!btn) return;
        if (status === 'active') {
            btn.className = 'button-long mic-on';
            btn.innerText = label || 'listening...';
        } else if (status === 'processing') {
            btn.className = 'button-long mic-on';
            btn.innerText = label || 'processing...';
            btn.style.background = 'purple';
        } else {
            btn.className = 'button-long';
            btn.innerText = label || 'voice';
            btn.style.background = 'crimson';
        }
    };

    window.toggleVoice = function() {
        const btn = document.getElementById('micbutton');
        isVoiceActive = !isVoiceActive;
        if (isVoiceActive) {
            window.setVoiceStatus('active', 'voice');
            window.emit('voice_toggle_on', {});
        } else {
            window.setVoiceStatus('idle', 'voice');
            window.emit('voice_toggle_off', {});
        }
    };

    window.requestHandling = async function(eventName, payload) {
        const applicants = [];
        window.emit(eventName, {
            ...payload,
            apply: (handler, index) => {
                applicants.push({ handler, index });
            }
        });

        await new Promise(r => setTimeout(r, 50));

        if (applicants.length > 0) {
            applicants.sort((a, b) => b.index - a.index);
            await applicants[0].handler();
        } else {
            window.say("I have no automata available to process this request.");
        }
    };

    window.handleInput = async function() {
        const box = document.getElementById('box');
        const text = box.value.trim();
        if (text) {
            window.bubble_incoming(text);
            box.value = '';
            await window.requestHandling('message_sent', { message: text, source: 'text' });
        }
    };

    // 3. Automata Loader Integration
    async function initAkariAutomata() {
        if (typeof AutomatonLoader === 'undefined') {
            console.error("AutomatonLoader class is missing!");
            return;
        }

        const loader = new AutomatonLoader();
        window.automatonLoader = loader;

        // Default demo
        const defaultUrls = [
            'https://76836.github.io/AkariNet-Automata/demo.atpk'
        ];
        let urls = loader.getAutomataUrls();

        if (urls.length === 0) {
            urls = defaultUrls;
            loader.setAutomataUrls(urls);
        }

        window.log('info', "Waking up the automata...");
        await loader.loadAll();
        console.log("Loaded automata:", loader.list());
        
        setTimeout(() => {
            const overlay = document.getElementById('overlay');
            if (overlay) overlay.classList.add('fade-out');
            window.say("Akari Automata System Initialized.", 'text');
        }, 1000);
    }

    // Visuals Support (Wallpapers & Screensaver)
    window.applyVisuals = function() {
        const bkg = localStorage.getItem('selectedBKGURL');
        if (bkg) {
            const isLive = bkg.includes('bubbles') || bkg.includes('.html');
            document.getElementById('bkg-container').innerHTML = isLive
                ? `<iframe src="${bkg}" class="iframe-container"></iframe>`
                : `<img src="${bkg}" style="width:100%;height:100%;object-fit:cover;">`;
        } else {
            document.getElementById('bkg-container').innerHTML = '';
        }
    };
    window.applyVisuals();

    let ssTimer = null;
    function resetScreensaver() {
        clearTimeout(ssTimer);
        const ssDiv = document.getElementById('screensaver-container');
        if (ssDiv && ssDiv.classList.contains('active')) {
            ssDiv.classList.remove('active');
            const behavior = localStorage.getItem('selectedScreensaverResumeBehavior') || 'destroy';
            if (behavior === 'destroy') ssDiv.innerHTML = '';
        }

        if (localStorage.getItem('selectedScreensaverEnabled') === 'true') {
            const to = parseInt(localStorage.getItem('selectedScreensaverTimeout')) || 120;
            ssTimer = setTimeout(triggerScreensaver, to * 1000);
        }
    }

    function triggerScreensaver() {
        const ssDiv = document.getElementById('screensaver-container');
        const url = localStorage.getItem('selectedScreensaverURL') || localStorage.getItem('selectedBKGURL');
        if (!url) return;
        
        if (ssDiv.innerHTML === '' || localStorage.getItem('selectedScreensaverResumeBehavior') === 'destroy') {
            const isLive = url.includes('bubbles') || url.includes('.html');
            ssDiv.innerHTML = isLive
                ? `<iframe src="${url}" class="iframe-container" style="pointer-events:none;"></iframe>`
                : `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
        }
        ssDiv.classList.add('active');
    }

    window.addEventListener('mousemove', resetScreensaver);
    window.addEventListener('keydown', resetScreensaver);
    window.addEventListener('click', resetScreensaver);
    resetScreensaver();

    // Cross-origin iframe communication
    window.addEventListener('message', async (e) => {
        if (!e.data || !e.data.action) return;
        
        const iframe = document.querySelector('.windowstyle');
        const respond = (data) => {
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage(data, '*');
            }
        };

        if (e.data.action === 'request_automata_list') {
            const list = window.automatonLoader ? window.automatonLoader.listAll() : [];
            respond({ action: 'automata_list', automata: list });
        } 
        else if (e.data.action === 'automata_update') {
            if (window.automatonLoader) {
                const urls = JSON.parse(localStorage.getItem('akari:automata_urls') || '[]');
                const bl = JSON.parse(localStorage.getItem('akari:automata_blacklist') || '[]');
                window.automatonLoader.setAutomataUrls(urls);
                window.automatonLoader.setBlacklist(bl);
                await window.automatonLoader.loadAll();
                respond({ action: 'automata_list', automata: window.automatonLoader.listAll() });
            }
        }
        else if (e.data.action === 'automata_kill') {
            if (window.automatonLoader) {
                window.automatonLoader.setBlacklist(JSON.parse(localStorage.getItem('akari:automata_blacklist') || '[]'));
                window.automatonLoader.kill(e.data.name);
                respond({ action: 'automata_list', automata: window.automatonLoader.listAll() });
            }
        }
        else if (e.data.action === 'automata_restart') {
            if (window.automatonLoader) {
                await window.automatonLoader.restart(e.data.name);
                respond({ action: 'automata_list', automata: window.automatonLoader.listAll() });
            }
        }
        else if (e.data.action === 'apply_visuals') {
            window.applyVisuals();
        }
    });

    if (document.readyState === 'complete') {
        initAkariAutomata();
    } else {
        window.addEventListener('load', initAkariAutomata);
    }
})();
