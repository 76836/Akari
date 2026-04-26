// settings.js

const STORAGE_URLS = 'akari:automata_urls';
const STORAGE_BLACKLIST = 'akari:automata_blacklist';

function getUrls() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_URLS)) || [];
    } catch { return []; }
}

function saveUrls(urls) {
    localStorage.setItem(STORAGE_URLS, JSON.stringify(urls));
    renderUrls();
    window.parent.postMessage({ action: 'automata_update' }, '*');
}

function quickInstall(url) {
    const urls = getUrls();
    if (!urls.includes(url)) {
        urls.push(url);
        saveUrls(urls);
        alert('Installed: ' + url);
    } else {
        alert('Package already installed.');
    }
}

function setupAkariDefaults() {
    localStorage.setItem('selectedBKGURL', 'https://76836.github.io/Akari/wallpapers/snow.png');
    
    const urls = getUrls();
    let changed = false;
    if (!urls.includes('core_scripts.atpk') && !urls.includes('./core_scripts.atpk')) { urls.push('./core_scripts.atpk'); changed = true; }
    if (!urls.includes('akari_winter.atpk') && !urls.includes('./akari_winter.atpk')) { urls.push('./akari_winter.atpk'); changed = true; }
    
    if (changed) saveUrls(urls);
    else window.parent.postMessage({ action: 'automata_update' }, '*');
    
    window.parent.postMessage({ action: 'apply_visuals' }, '*');
    alert('Akari default preset applied!');
}

function addUrl() {
    const input = document.getElementById('new-url');
    const val = input.value.trim();
    if (val) {
        quickInstall(val);
        input.value = '';
    }
}

function removeUrl(url) {
    const urls = getUrls().filter(u => u !== url);
    saveUrls(urls);
}

function renderUrls() {
    const list = document.getElementById('url-list');
    list.innerHTML = '';
    const urls = getUrls();
    
    if (urls.length === 0) {
        list.innerHTML = '<div style="color:#aaa; font-size: 0.85rem;">No packages configured.</div>';
        return;
    }

    urls.forEach(url => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <span style="font-size: 0.85rem;">${url}</span>
            <button class="setbutton setbutton-danger" style="width: auto; padding: 6px 12px; margin: 0;" onclick="removeUrl('${url}')">Remove</button>
        `;
        list.appendChild(div);
    });
}

function getBlacklist() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_BLACKLIST)) || [];
    } catch { return []; }
}

function toggleBlacklist(name, isEnabled) {
    let bl = getBlacklist();
    if (isEnabled) {
        bl = bl.filter(n => n !== name);
    } else {
        if (!bl.includes(name)) bl.push(name);
    }
    localStorage.setItem(STORAGE_BLACKLIST, JSON.stringify(bl));
    
    if (isEnabled) {
        window.parent.postMessage({ action: 'automata_update' }, '*');
    } else {
        window.parent.postMessage({ action: 'automata_kill', name: name }, '*');
    }
}

function restartAutomaton(name) {
    if (window.parent) {
        window.parent.postMessage({ action: 'automata_restart', name: name }, '*');
    }
}

function refreshAutomata() {
    const list = document.getElementById('automata-list');
    list.innerHTML = '<div style="color:#aaa;">Requesting status...</div>';
    window.parent.postMessage({ action: 'request_automata_list' }, '*');
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.action === 'automata_list') {
        renderAutomataList(e.data.automata);
    }
});

function renderAutomataList(automata) {
    const list = document.getElementById('automata-list');
    list.innerHTML = '';
    const blacklist = getBlacklist();

    if (automata.length === 0) {
        list.innerHTML = '<div style="color:#aaa; font-size:0.85rem;">No automata currently loaded. Check if packages are installed.</div>';
        return;
    }

    automata.forEach(a => {
        const isEnabled = !blacklist.includes(a.name);
        const div = document.createElement('div');
        div.className = 'list-item';
        div.style.flexDirection = 'column';
        div.style.alignItems = 'stretch';
        if (!isEnabled) div.style.filter = 'grayscale(1) opacity(0.5)';

        div.innerHTML = `
            <div class="flex-row" style="margin-bottom: 0;">
                <div>
                    <span style="color:var(--cyan); font-weight:bold;">${a.name}</span> <span style="font-size:0.75rem; color:#aaa;">v${a.version}</span>
                    <div style="font-size:0.75rem; color:#888;">Pri: ${a.priority} | ${a.description}</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="setbutton" style="width:auto; padding:6px 12px; margin:0;" onclick="restartAutomaton('${a.name}')">Restart</button>
                    <label class="switch">
                        <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleBlacklist('${a.name}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
}

// Wallpaper and Screensaver functionality
function handlePreview(url) {
    document.getElementById('bkgurl').value = url;
}

function applyBKG(url) {
    if (url) {
        localStorage.setItem('selectedBKGURL', url);
    } else {
        localStorage.removeItem('selectedBKGURL');
    }
    window.parent.postMessage({ action: 'apply_visuals' }, '*');
    alert("Wallpaper set.");
}

function saveScreensaverSettings() {
    const url = document.getElementById('screensaverurl').value.trim();
    const timeout = parseInt(document.getElementById('screensavertimeout').value, 10) || 120;
    const enabled = document.getElementById('screensaverenabled').checked;

    if (url) localStorage.setItem('selectedScreensaverURL', url);
    else localStorage.removeItem('selectedScreensaverURL');

    localStorage.setItem('selectedScreensaverTimeout', String(timeout));
    localStorage.setItem('selectedScreensaverEnabled', enabled ? 'true' : 'false');
    window.parent.postMessage({ action: 'apply_visuals' }, '*');
    alert("Screensaver settings saved.");
}

function updatePriority(name, val) {
    if (val === '') {
        localStorage.removeItem('index_' + name);
    } else {
        localStorage.setItem('index_' + name, val);
    }
}

function loadConfigs() {
    const list = document.getElementById('priority-list');
    list.innerHTML = '';
    const known = [
        'akari-reflex', 'akari-pollinations', 'akari-gemini', 
        'akari-lcpp', 'akari-kittentts', 'akari-webspeechtts',
        'akari-webspeechstt', 'akari-audioconsole', 'akari-winter'
    ];
    
    known.forEach(name => {
        const val = localStorage.getItem('index_' + name) || '';
        list.innerHTML += `
            <div class="flex-row">
                <span style="font-size:0.85rem;">${name}</span>
                <input type="number" class="box" value="${val}" placeholder="Default" style="width:100px; margin:0;" onchange="updatePriority('${name}', this.value)">
            </div>
        `;
    });

    // Load Visual settings
    document.getElementById('bkgurl').value = localStorage.getItem('selectedBKGURL') || "";
    document.getElementById('screensaverurl').value = localStorage.getItem('selectedScreensaverURL') || "";
    document.getElementById('screensavertimeout').value = localStorage.getItem('selectedScreensaverTimeout') || "120";
    document.getElementById('screensaverenabled').checked = localStorage.getItem('selectedScreensaverEnabled') === "true";
}

function clearAllData() {
    if (confirm("Are you sure you want to wipe all Automata settings? This cannot be undone.")) {
        localStorage.removeItem(STORAGE_URLS);
        localStorage.removeItem(STORAGE_BLACKLIST);
        renderUrls();
        alert("Settings cleared. Please reload AkariNet to apply changes.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderUrls();
    loadConfigs();
    setTimeout(refreshAutomata, 500); 
});
