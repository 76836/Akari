say('Pollinations AI connected (adapter v2.0 · gen.pollinations.ai)');
var CloudAI = true;

if (localStorage.getItem('privacynotice') !== 'hide') {
  try { newwindow('https://76836.github.io/Akari/nonprivate'); } catch (e) {}
}

(function () {
  const BASE = 'https://gen.pollinations.ai';
  let activeModel = 'openai';

  const systemPrompt = `Your name is Akari, an AI girl with a vibrant and cheerful personality.
You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
but you're generally kind and respectful to everyone...

System information:
Akari AI · Pollinations (gen.pollinations.ai) v2.0
Persistent chat history: global (AkariChat)
Message rendering method: HTML
Chat is private: False`;

  function getKey() {
    return localStorage.getItem('pollinations_API_KEY') ||
           localStorage.getItem('genAI_API_KEY') ||
           localStorage.getItem('POLLINATIONS_KEY') || '';
  }

  async function syncModels() {
    try {
      const headers = {};
      const key = getKey();
      if (key) headers['Authorization'] = 'Bearer ' + key;
      const res = await fetch(BASE + '/v1/models', { headers });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.data || data.models || []);
      const names = list.map(m => (typeof m === 'string' ? m : (m.id || m.name || m.model))).filter(Boolean);
      if (names.includes('openai')) activeModel = 'openai';
      else if (names.length) activeModel = names[0];
      console.log('[OK] Pollinations model:', activeModel);
    } catch (err) {
      console.warn('[Pollinations] model sync failed, using', activeModel);
    }
  }

  function ensureSystemInHistory() {
    if (!window.AkariChat) return;
    const msgs = AkariChat.getMessagesForLLM(true);
    const hasSystem = msgs.some(m => m.role === 'system');
    if (!hasSystem) {
      AkariChat.append('system', systemPrompt, { provider: 'pollinations' });
    }
  }

  globalThis.GenerateResponse = async function (hinp) {
    if (!hinp) return;
    ensureSystemInHistory();
    if (window.AkariChat) AkariChat.append('user', hinp, { provider: 'pollinations' });

    const messages = window.AkariChat
      ? AkariChat.getMessagesForLLM(true)
      : [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: hinp }
        ];

    const payload = {
      model: activeModel,
      messages,
      max_tokens: 1000
    };

    const headers = { 'Content-Type': 'application/json' };
    const key = getKey();
    if (key) headers['Authorization'] = 'Bearer ' + key;

    try {
      const res = await fetch(BASE + '/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        // fallback: simple text endpoint (may work without key for some models)
        const fallback = await fetch(
          BASE + '/text/' + encodeURIComponent(hinp) + (key ? '?key=' + encodeURIComponent(key) : ''),
          { method: 'GET' }
        );
        if (fallback.ok) {
          const text = (await fallback.text()).trim();
          if (window.AkariChat) AkariChat.append('assistant', text, { provider: 'pollinations' });
          say(text);
          return text;
        }
        const errText = "[ERROR] Pollinations returned " + res.status + ". Get a free key at enter.pollinations.ai and save it in settings (or as pollinations_API_KEY).";
        say(errText);
        return errText;
      }

      const data = await res.json();
      let text =
        data?.choices?.[0]?.message?.content ||
        data?.choices?.[0]?.text ||
        data?.content ||
        (typeof data === 'string' ? data : null);

      if (!text) {
        const errText = "[ERROR] Empty response from Pollinations.";
        say(errText);
        return errText;
      }

      text = String(text).trim();
      if (window.AkariChat) AkariChat.append('assistant', text, { provider: 'pollinations' });
      say(text);
      return text;
    } catch (e) {
      const errText = "[ERROR] NO_CARRIER_SIGNAL (" + (e.message || e) + ")";
      say(errText);
      return errText;
    }
  };

  // alias used by main UI
  if (!window.respond) {
    window.respond = function (t) { return globalThis.GenerateResponse(t); };
  } else {
    const prev = window.respond;
    window.respond = function (t) {
      if (CloudAI) return globalThis.GenerateResponse(t);
      return prev(t);
    };
  }

  syncModels();
})();
