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

    // 3.5 Task Manager Sidebar
    const STORAGE_URLS = 'akari:automata_urls';
    const STORAGE_BLACKLIST = 'akari:automata_blacklist';
    const tmState = { events: [] };

    function readJSONList(key) {
        try {
            const val = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(val) ? val : [];
        } catch {
            return [];
        }
    }

    function writeJSONList(key, values) {
        localStorage.setItem(key, JSON.stringify(Array.isArray(values) ? values : []));
    }

    function tmLog(line) {
        tmState.events.unshift(`[${new Date().toLocaleTimeString()}] ${line}`);
        tmState.events = tmState.events.slice(0, 60);
        const logEl = document.getElementById('tm-event-log');
        if (logEl) logEl.textContent = tmState.events.join('\n');
    }

    function formatMeta(a) {
        const tags = [];
        if (a.respondsto?.length) tags.push(`responds: ${a.respondsto.join(', ')}`);
        if (a.controls?.length) tags.push(`controls: ${a.controls.join(', ')}`);
        if (a.dependencies?.length) tags.push(`deps: ${a.dependencies.join(', ')}`);
        return tags.join(' | ');
    }

    function renderUrlList() {
        const urls = readJSONList(STORAGE_URLS);
        const list = document.getElementById('tm-url-list');
        if (!list) return;
        list.innerHTML = '';
        if (!urls.length) {
            list.innerHTML = `<div class="tm-item tm-meta">No package URLs configured.</div>`;
            return;
        }

        urls.forEach((url) => {
            const node = document.createElement('div');
            node.className = 'tm-item';
            node.innerHTML = `
                <div style="word-break:break-word; font-size:0.78rem;">${url}</div>
                <div class="tm-row" style="margin-top:8px;">
                    <button class="tm-btn" data-tm-action="reload-url" data-url="${url}">Reload</button>
                    <button class="tm-btn danger" data-tm-action="remove-url" data-url="${url}">Remove</button>
                </div>
            `;
            list.appendChild(node);
        });
    }

    function renderAutomataList() {
        const listEl = document.getElementById('tm-automata-list');
        if (!listEl) return;
        const loader = window.automatonLoader;
        const blacklist = readJSONList(STORAGE_BLACKLIST);
        const automata = loader ? loader.listAll() : [];
        const sortBy = document.getElementById('tm-sort')?.value || 'priority';
        const conflicts = loader ? loader.getConflicts() : [];
        const conflictNames = new Set(conflicts.flatMap(c => c.automata));

        automata.sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            if (sortBy === 'source') return String(a.sourceUrl).localeCompare(String(b.sourceUrl));
            return (a.priority ?? 100) - (b.priority ?? 100);
        });

        document.getElementById('tm-stat-loaded').textContent = String(automata.length);
        document.getElementById('tm-stat-blacklisted').textContent = String(blacklist.length);
        document.getElementById('tm-stat-packages').textContent = String(readJSONList(STORAGE_URLS).length);
        document.getElementById('tm-stat-conflicts').textContent = String(conflicts.length);
        document.getElementById('tm-live-count').textContent = `${automata.length} online`;

        if (!automata.length) {
            listEl.innerHTML = `<div class="tm-item tm-meta">No automata loaded.</div>`;
            return;
        }

        listEl.innerHTML = '';
        automata.forEach((a) => {
            const blacklisted = blacklist.includes(a.name);
            const item = document.createElement('div');
            item.className = 'tm-item';
            item.style.opacity = blacklisted ? '0.55' : '1';
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; gap:8px;">
                    <div>
                        <div>${a.name} <span class="tm-pill">v${a.version}</span>${conflictNames.has(a.name) ? '<span class="tm-pill" style="background:#5d341f;color:#ffceaa;">Conflict</span>' : ''}</div>
                        <div class="tm-meta">priority: ${a.priority} | source: ${a.sourceUrl || 'unknown'}</div>
                        <div class="tm-meta">${a.description || ''}</div>
                        <div class="tm-meta">${formatMeta(a)}</div>
                    </div>
                </div>
                <div class="tm-row" style="margin-top:8px;">
                    <button class="tm-btn" data-tm-action="restart" data-name="${a.name}">Restart</button>
                    <button class="tm-btn danger" data-tm-action="kill" data-name="${a.name}">Kill</button>
                    <button class="tm-btn subtle" data-tm-action="toggle" data-name="${a.name}">
                        ${blacklisted ? 'Enable' : 'Disable'}
                    </button>
                </div>
            `;
            listEl.appendChild(item);
        });
    }

    async function refreshTaskManager(note) {
        renderUrlList();
        renderAutomataList();
        if (note) tmLog(note);
    }

    window.toggleTaskManager = function(forceState) {
        const sidebar = document.getElementById('task-manager-sidebar');
        if (!sidebar) return;
        const shouldOpen = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('open');
        sidebar.classList.toggle('open', shouldOpen);
        if (shouldOpen) refreshTaskManager('Task manager opened');
    };

    window.taskManagerRefresh = async function() {
        await refreshTaskManager('Status refreshed');
    };

    window.taskManagerAddUrl = async function() {
        const input = document.getElementById('tm-new-url');
        const url = input?.value?.trim();
        if (!url) return;
        const urls = readJSONList(STORAGE_URLS);
        if (!urls.includes(url)) {
            urls.push(url);
            writeJSONList(STORAGE_URLS, urls);
            tmLog(`Package URL added: ${url}`);
        } else {
            tmLog(`Package URL already exists: ${url}`);
        }
        if (input) input.value = '';
        await window.taskManagerReloadAll();
    };

    window.taskManagerReloadAll = async function() {
        if (!window.automatonLoader) return;
        window.automatonLoader.setAutomataUrls(readJSONList(STORAGE_URLS));
        window.automatonLoader.setBlacklist(readJSONList(STORAGE_BLACKLIST));
        await window.automatonLoader.loadAll();
        await refreshTaskManager('Reloaded package URLs');
    };

    window.taskManagerShutdownAll = async function() {
        if (!window.automatonLoader) return;
        const names = window.automatonLoader.list();
        names.forEach((name) => window.automatonLoader.shutdown(name));
        await refreshTaskManager(`Shutdown all automata (${names.length})`);
    };

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-tm-action]');
        if (!btn || !window.automatonLoader) return;

        const action = btn.getAttribute('data-tm-action');
        const name = btn.getAttribute('data-name');
        const url = btn.getAttribute('data-url');
        const blacklist = readJSONList(STORAGE_BLACKLIST);
        const urls = readJSONList(STORAGE_URLS);

        if (action === 'restart' && name) {
            await window.automatonLoader.restart(name);
            tmLog(`Restarted ${name}`);
        } else if (action === 'kill' && name) {
            window.automatonLoader.kill(name);
            tmLog(`Killed ${name}`);
        } else if (action === 'toggle' && name) {
            const idx = blacklist.indexOf(name);
            if (idx >= 0) {
                blacklist.splice(idx, 1);
                writeJSONList(STORAGE_BLACKLIST, blacklist);
                await window.automatonLoader.loadAll();
                tmLog(`Enabled ${name}`);
            } else {
                blacklist.push(name);
                writeJSONList(STORAGE_BLACKLIST, blacklist);
                window.automatonLoader.setBlacklist(blacklist);
                window.automatonLoader.kill(name);
                tmLog(`Disabled ${name}`);
            }
        } else if (action === 'remove-url' && url) {
            writeJSONList(STORAGE_URLS, urls.filter(u => u !== url));
            tmLog(`Removed package URL: ${url}`);
            await window.taskManagerReloadAll();
            return;
        } else if (action === 'reload-url' && url) {
            await window.automatonLoader.loadPackage(url);
            tmLog(`Reloaded package: ${url}`);
        }

        await refreshTaskManager();
    });

    window.on('automaton_loaded', (payload) => tmLog(`Loaded ${payload?.name || 'unknown'}`));
    window.on('automaton_unloaded', (payload) => tmLog(`Unloaded ${payload?.name || 'unknown'} (${payload?.reason || 'n/a'})`));
    window.on('error_occurred', (payload) => tmLog(`Error: ${payload?.message || 'unknown'}`));

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
        refreshTaskManager('Automata initialized');
        
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
                refreshTaskManager('Automata updated from settings');
            }
        }
        else if (e.data.action === 'automata_kill') {
            if (window.automatonLoader) {
                window.automatonLoader.setBlacklist(JSON.parse(localStorage.getItem('akari:automata_blacklist') || '[]'));
                window.automatonLoader.kill(e.data.name);
                respond({ action: 'automata_list', automata: window.automatonLoader.listAll() });
                refreshTaskManager(`Automaton killed from settings: ${e.data.name}`);
            }
        }
        else if (e.data.action === 'automata_restart') {
            if (window.automatonLoader) {
                await window.automatonLoader.restart(e.data.name);
                respond({ action: 'automata_list', automata: window.automatonLoader.listAll() });
                refreshTaskManager(`Automaton restarted from settings: ${e.data.name}`);
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
