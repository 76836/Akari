const defaults = {
    automataEnabled: {
        'pollinations.automata': true,
        'gemini.automata': true,
        'audio.console.automata': true,
        'kitten.tts.automata': true,
        'ui.automata': true
    },
    models: {
        pollinationsModel: 'openai-large',
        geminiModel: 'gemini-2.0-flash'
    },
    voice: 'default'
};

const storeKey = 'webui.automata.settings';
const settings = loadSettings();

bindInitialState();
attachEvents();
renderAutomataManager();
renderVoices();

function loadSettings() {
    try {
        const raw = localStorage.getItem(storeKey);
        if (!raw) {
            return structuredClone(defaults);
        }
        const parsed = JSON.parse(raw);
        return {
            automataEnabled: { ...defaults.automataEnabled, ...(parsed.automataEnabled || {}) },
            models: { ...defaults.models, ...(parsed.models || {}) },
            voice: parsed.voice || 'default'
        };
    } catch {
        return structuredClone(defaults);
    }
}

function saveSettings() {
    localStorage.setItem(storeKey, JSON.stringify(settings));
}

function setStatus(text) {
    document.getElementById('status-box').textContent = text;
}

function bindInitialState() {
    document.getElementById('pollinations-model').value = settings.models.pollinationsModel;
    document.getElementById('gemini-model').value = settings.models.geminiModel;
    document.getElementById('voice-select').value = settings.voice;
}

function attachEvents() {
    document.getElementById('back-home').addEventListener('click', () => {
        window.location.href = './index.html';
    });

    document.getElementById('save-models').addEventListener('click', () => {
        settings.models.pollinationsModel = document.getElementById('pollinations-model').value.trim() || defaults.models.pollinationsModel;
        settings.models.geminiModel = document.getElementById('gemini-model').value.trim() || defaults.models.geminiModel;
        saveSettings();
        setStatus('Models saved.');
    });

    document.getElementById('save-key').addEventListener('click', () => {
        const key = document.getElementById('gemini-key').value.trim();
        if (!key) {
            setStatus('Gemini key is empty.');
            return;
        }
        localStorage.setItem('webui.gemini.key', key);
        setStatus('Gemini key saved.');
    });

    document.getElementById('refresh-voices').addEventListener('click', () => {
        renderVoices();
        setStatus('Voices refreshed.');
    });

    document.getElementById('save-audio').addEventListener('click', () => {
        settings.voice = document.getElementById('voice-select').value;
        saveSettings();
        setStatus('Audio settings saved.');
    });

    document.getElementById('save-automata').addEventListener('click', () => {
        const checks = document.querySelectorAll('[data-automata-id]');
        checks.forEach((node) => {
            settings.automataEnabled[node.dataset.automataId] = node.checked;
        });
        saveSettings();
        setStatus('Automata manager settings saved.');
    });
}

function renderAutomataManager() {
    const holder = document.getElementById('automata-manager');
    holder.innerHTML = '';

    Object.keys(settings.automataEnabled).forEach((id) => {
        const row = document.createElement('label');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.marginBottom = '8px';

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.dataset.automataId = id;
        check.checked = !!settings.automataEnabled[id];
        check.style.width = 'auto';

        const text = document.createElement('span');
        text.textContent = id;

        row.appendChild(check);
        row.appendChild(text);
        holder.appendChild(row);
    });
}

function renderVoices() {
    const select = document.getElementById('voice-select');
    const saved = settings.voice;
    const synth = window.speechSynthesis;
    const voices = synth ? synth.getVoices() : [];

    select.innerHTML = '<option value="default">default</option>';
    voices.forEach((voice) => {
        const opt = document.createElement('option');
        opt.value = voice.name;
        opt.textContent = `${voice.name} (${voice.lang})`;
        select.appendChild(opt);
    });

    if ([...select.options].some((o) => o.value === saved)) {
        select.value = saved;
    }
}

window.speechSynthesis?.addEventListener('voiceschanged', renderVoices);
