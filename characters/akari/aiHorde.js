say('AI Horde connected (adapter v1.1 · aihorde.net)');
var CloudAI = true;

if (localStorage.getItem('privacynotice') !== 'hide') {
  try { newwindow('https://76836.github.io/Akari/nonprivate'); } catch (e) {}
}

(function () {
  const HORDE = 'https://aihorde.net/api/v2';
  const ANON_KEY = '0000000000';
  const CLIENT = 'AkariNet:2.6:github.com/76836/Akari';

  const systemPrompt = `Your name is Akari, an AI girl with a vibrant and cheerful personality.
You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
but you're generally kind and respectful to everyone...

System information:
Akari AI · AI Horde v1.1
Persistent chat history: global (AkariChat)
Message rendering method: HTML
Chat is private: False (community workers)`;

  function getKey() {
    return localStorage.getItem('aihorde_API_KEY') ||
           localStorage.getItem('horde_API_KEY') ||
           ANON_KEY;
  }

  function parseList(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j.map(String).filter(Boolean);
    } catch (_) {}
    return String(localStorage.getItem(key) || '')
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function keywordMatch(name, keywords) {
    const n = (name || '').toLowerCase();
    return keywords.some(k => n.includes(String(k).toLowerCase()));
  }

  /** Pick fastest live text model matching require/blacklist keywords. */
  async function resolveModels() {
    const fixed = (localStorage.getItem('aihorde_model') || '').trim();
    const auto = localStorage.getItem('aihorde_auto_model') !== '0';
    if (fixed && !auto) return [fixed];

    const require = parseList('aihorde_require_keywords');
    const deny = parseList('aihorde_blacklist_keywords');

    let models = [];
    try {
      const r = await fetch(HORDE + '/status/models?type=text', {
        headers: { 'Client-Agent': CLIENT }
      });
      if (r.ok) models = await r.json();
    } catch (_) {}

    if (!Array.isArray(models) || !models.length) {
      return fixed ? [fixed] : ['koboldcpp/MythoMax-L2-13B'];
    }

    let pool = models.filter(m => m && m.name && (m.count == null || m.count > 0));
    if (require.length) pool = pool.filter(m => keywordMatch(m.name, require));
    if (deny.length) pool = pool.filter(m => !keywordMatch(m.name, deny));
    if (!pool.length) pool = models.filter(m => m && m.name);

    pool.sort((a, b) => {
      const pa = Number(a.performance) || 0;
      const pb = Number(b.performance) || 0;
      if (pb !== pa) return pb - pa;
      const ea = Number(a.eta) || 0;
      const eb = Number(b.eta) || 0;
      if (ea !== eb) return ea - eb;
      return (Number(b.count) || 0) - (Number(a.count) || 0);
    });

    const top = pool.slice(0, 5).map(m => m.name);
    if (fixed && !top.includes(fixed)) top.unshift(fixed);
    return top.length ? top : (fixed ? [fixed] : ['koboldcpp/MythoMax-L2-13B']);
  }

  function getWorkerPrefs() {
    const priority = parseList('aihorde_priority_workers');
    const blocked = parseList('aihorde_blocked_workers');
    return { priority: priority.slice(0, 5), blocked };
  }

  function buildPrompt(userText) {
    const msgs = window.AkariChat ? AkariChat.getMessagesForLLM(true) : [];
    let prompt = systemPrompt + '\n\n';
    msgs.forEach(m => {
      if (m.role === 'system') return;
      if (m.role === 'user') prompt += 'User: ' + m.content + '\n';
      else if (m.role === 'assistant') prompt += 'Akari: ' + m.content + '\n';
    });
    if (!msgs.length || msgs[msgs.length - 1].content !== userText) {
      prompt += 'User: ' + userText + '\n';
    }
    prompt += 'Akari:';
    return prompt;
  }

  globalThis.GenerateResponse = async function (userText) {
    if (window.AkariChat) AkariChat.append('user', userText, { provider: 'aihorde' });
    if (typeof typing === 'function') typing('Akari');
    else if (window.app?.ui?.setTyping) app.ui.setTyping('Akari');

    try {
      const models = await resolveModels();
      const { priority, blocked } = getWorkerPrefs();
      const body = {
        prompt: buildPrompt(userText),
        models,
        trusted_workers: localStorage.getItem('aihorde_trusted_only') === '1',
        slow_workers: localStorage.getItem('aihorde_slow_workers') !== '0',
        params: {
          max_context_length: 2048,
          max_length: 180,
          temperature: 0.8,
          top_p: 0.9
        }
      };

      if (priority.length) {
        body.workers = priority;
        body.worker_blacklist = false;
      } else if (blocked.length) {
        body.workers = blocked.slice(0, 5);
        body.worker_blacklist = true;
      }

      const res = await fetch(HORDE + '/generate/text/async', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getKey(),
          'Client-Agent': CLIENT
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(res.status + ' ' + err.slice(0, 200));
      }
      const job = await res.json();
      if (!job.id) throw new Error('No job id from Horde');

      let text = null;
      for (let i = 0; i < 90; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const st = await fetch(HORDE + '/generate/text/status/' + job.id, {
          headers: { 'apikey': getKey(), 'Client-Agent': CLIENT }
        });
        if (!st.ok) continue;
        const status = await st.json();
        if (status.faulted) {
          say('[ERROR] AI Horde job faulted.');
          return;
        }
        if (status.done && status.generations && status.generations.length) {
          text = status.generations[0].text || status.generations[0].content;
          break;
        }
        if (i === 0 || i % 5 === 0) {
          const q = status.queue_position != null ? ' (queue #' + status.queue_position + ')' : '';
          if (typeof typing === 'function') typing('Akari' + q);
          else if (window.app?.ui?.setTyping) app.ui.setTyping('Akari' + q);
        }
      }

      if (!text) {
        const errText = '[ERROR] AI Horde timed out waiting for a worker.';
        say(errText);
        return errText;
      }

      text = String(text).replace(/<\/?s>|<\|.*?\|>/g, '').trim();
      if (window.AkariChat) AkariChat.append('assistant', text, { provider: 'aihorde' });
      say(text);
      return text;
    } catch (e) {
      const errText = '[ERROR] AI Horde: ' + (e.message || e);
      say(errText);
      return errText;
    }
  };

  if (!window.respond) {
    window.respond = function (t) { return globalThis.GenerateResponse(t); };
  } else {
    const prev = window.respond;
    window.respond = function (t) {
      if (CloudAI) return globalThis.GenerateResponse(t);
      return prev(t);
    };
  }
})();
