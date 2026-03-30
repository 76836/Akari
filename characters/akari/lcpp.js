var CloudAI = false;

(function () {
  // --- Parse available servers from scanner ---
  function getServers() {
    try {
      return JSON.parse(localStorage.getItem('lcpp_servers') || '[]');
    } catch (e) {
      return [];
    }
  }

  function buildOptions(servers) {
    const saved = localStorage.getItem('lcpp_selected_server');
    if (!servers.length) return '<option value="">No servers found</option>';
    return servers.map(s => {
      const label = `${s.model} — ${s.url}`;
      const status = s.online ? '🟢' : '🔴';
      const sel = (s.url === saved) || (!saved && s.online) ? 'selected' : '';
      return `<option value="${s.url}" ${sel}>${status} ${label}</option>`;
    }).join('');
  }

  // --- Render adapter UI into a chat message ---
  function renderUI() {
    const servers = getServers();
    const opts = buildOptions(servers);
    say(`<div style="display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;background:rgba(128,128,128,0.1);font-size:0.85em;font-family:inherit;">
  <span style="font-weight:600;">Llama.cpp adapter connected (v1.0)</span>
  <select id="lcpp-server-select"
    style="font-size:inherit;font-family:inherit;padding:2px 4px;border-radius:4px;border:1px solid rgba(128,128,128,0.4);background:transparent;cursor:pointer;max-width:320px;"
    onchange="lcppSelChange(this.value)">${opts}</select>
  <button
    style="font-size:inherit;font-family:inherit;padding:2px 8px;border-radius:4px;border:1px solid rgba(128,128,128,0.4);background:transparent;cursor:pointer;"
    onclick="lcppRescan()">↺ Resync</button>
</div>`);

    // Set initial saved value if none saved yet
    if (!localStorage.getItem('lcpp_selected_server')) {
      const first = servers.find(s => s.online);
      if (first) localStorage.setItem('lcpp_selected_server', first.url);
    }
  }

  // --- Global: called by dropdown onchange ---
  globalThis.lcppSelChange = function (url) {
    localStorage.setItem('lcpp_selected_server', url);
  };

  // --- Global: called by Rescan button ---
  globalThis.lcppRescan = function () {
    const sel = document.getElementById('lcpp-server-select');
    if (!sel) return;
    const servers = getServers();
    sel.innerHTML = buildOptions(servers);
    // Ensure saved value is honoured after rescan
    const saved = localStorage.getItem('lcpp_selected_server');
    if (saved) sel.value = saved;
  };

  // --- Chat history (persists for session) ---
  const systemPrompt = `Your name is Akari, an AI girl with a vibrant and cheerful personality.
You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
but you're generally kind and respectful to everyone...

System information (in case you need it):
Akari AI with Llama.cpp v1.0
maxOutputTokens: 1000
Persistent chat history: session only
Message rendering method: HTML
Chat is private: True`;

  const history = [{ role: 'system', content: systemPrompt }];

  // --- Main response generator ---
  globalThis.GenerateResponse = async function (hinp) {
    const url = localStorage.getItem('lcpp_selected_server');
    if (!url) {
      say('<i>⚠️ No server selected. Use the dropdown above to pick a Llama.cpp server.</i>');
      return;
    }

    history.push({ role: 'user', content: hinp });

    let data;
    try {
      const res = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local',           // llama.cpp ignores this field
          messages: history,
          max_tokens: 1000,
          stream: false
        })
      });
      data = await res.json();
    } catch (err) {
      say(`<i>⚠️ Could not reach server at <code>${url}</code>: ${err.message}</i>`);
      history.pop(); // remove the unsent user message
      return;
    }

    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      say('<i>⚠️ Received an empty or unexpected response from the server.</i>');
      history.pop();
      return;
    }

    history.push({ role: 'assistant', content: text });
    console.log(text);
    say(text);
    return text;
  };

  // --- Boot ---
  renderUI();
})();
