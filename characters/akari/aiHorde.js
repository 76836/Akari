say('AI Horde connected (adapter v1.2 · aihorde.net)');
var CloudAI = true;

if (localStorage.getItem('privacynotice') !== 'hide') {
  try { newwindow('https://76836.github.io/Akari/nonprivate'); } catch (e) {}
}

(function () {
  const HORDE = 'https://aihorde.net/api/v2';
  const ANON_KEY = '0000000000';
  const CLIENT = 'AkariNet:2.6:github.com/76836/Akari';

  // Abort state must exist before GenerateResponse can inspect it.
  let __hordeAbort = false;
  let __hordeJobId = null;
  const prevAbortHorde = window.AkariInferenceAbort;

  window.AkariInferenceAbort = function () {
    __hordeAbort = true;
    __hordeJobId = null;
    if (typeof prevAbortHorde === 'function') {
      try { prevAbortHorde(); } catch (_) {}
    }
  };

  function hordeNotify(title, message, opts) {
    try {
      if (window.app && typeof app.notify === 'function') {
        app.notify(title, message, opts || { duration: 4000, borderColors: ['#7dd3fc', '#a78bfa'] });
        return;
      }
      if (typeof showNotification === 'function') showNotification(title, message, opts || {});
    } catch (_) {}
  }

  const systemPrompt = `Your name is Akari, an AI girl with a vibrant and cheerful personality.
You don't like it when people ask you dumb questions, and if you can't give an accurate answer to a question, you shy away from the conversation.
You give short answers, and sometimes end your messages with sarcastic remarks, and don't always try not to offend people,
but you're generally kind and respectful to everyone...

Important: Reply only as Akari. Never write lines for the user. Never invent "User:" turns or continue the dialogue as both speakers.
Write one reply, then stop.

System information:
Akari AI · AI Horde v1.2
Persistent chat history: global (AkariChat)
Message rendering method: HTML
Chat is private: False (community workers)`;

  function getKey() {
    return localStorage.getItem('aihorde_API_KEY') || localStorage.getItem('horde_API_KEY') || ANON_KEY;
  }

  function parseList(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j.map(String).filter(Boolean);
    } catch (_) {}
    return String(localStorage.getItem(key) || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  }

  function keywordMatch(name, keywords) {
    const n = (name || '').toLowerCase();
    return keywords.some(k => n.includes(String(k).toLowerCase()));
  }

  async function resolveModels() {
    const fixed = (localStorage.getItem('aihorde_model') || '').trim();
    const auto = localStorage.getItem('aihorde_auto_model') !== '0';
    if (fixed && !auto) return [fixed];
    const require = parseList('aihorde_require_keywords');
    const deny = parseList('aihorde_blacklist_keywords');
    let models = [];
    try {
      const r = await fetch(HORDE + '/status/models?type=text', { headers: { 'Client-Agent': CLIENT } });
      if (r.ok) models = await r.json();
    } catch (_) {}
    if (!Array.isArray(models) || !models.length) return fixed ? [fixed] : ['koboldcpp/MythoMax-L2-13B'];
    let pool = models.filter(m => m && m.name && (m.count == null || m.count > 0));
    if (require.length) pool = pool.filter(m => keywordMatch(m.name, require));
    if (deny.length) pool = pool.filter(m => !keywordMatch(m.name, deny));
    if (!pool.length) pool = models.filter(m => m && m.name);
    pool.sort((a, b) => {
      const pa = Number(a.performance) || 0, pb = Number(b.performance) || 0;
      if (pb !== pa) return pb - pa;
      const ea = Number(a.eta) || 0, eb = Number(b.eta) || 0;
      if (ea !== eb) return ea - eb;
      return (Number(b.count) || 0) - (Number(a.count) || 0);
    });
    const top = pool.slice(0, 5).map(m => m.name);
    if (fixed && !top.includes(fixed)) top.unshift(fixed);
    return top.length ? top : (fixed ? [fixed] : ['koboldcpp/MythoMax-L2-13B']);
  }

  function getWorkerPrefs() {
    return {
      priority: parseList('aihorde_priority_workers').slice(0, 5),
      blocked: parseList('aihorde_blocked_workers')
    };
  }

  function estTokens(s) { return Math.ceil(String(s || '').length / 4); }

  function buildPrompt(userText) {
    const budget = parseInt(localStorage.getItem('aihorde_prompt_budget') || '520', 10);
    const msgs = window.AkariChat ? AkariChat.getMessagesForLLM(true) : [];
    const tail = 'User: ' + userText + '\nAkari:';
    let sys = systemPrompt + '\n\n';
    while (estTokens(sys) + estTokens(tail) > budget && sys.length > 80) sys = sys.slice(0, Math.floor(sys.length * 0.8));
    const room = Math.max(40, budget - estTokens(sys) - estTokens(tail));
    const picked = [];
    let used = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (!m || m.role === 'system') continue;
      if (m.role === 'user' && m.content === userText && i === msgs.length - 1) continue;
      const line = (m.role === 'user' ? 'User: ' : 'Akari: ') + m.content + '\n';
      const t = estTokens(line);
      if (used + t > room) break;
      picked.push(line);
      used += t;
    }
    picked.reverse();
    return sys + picked.join('') + tail;
  }

  function genParams() {
    const ctx = parseInt(localStorage.getItem('aihorde_max_context') || '1024', 10);
    const len = parseInt(localStorage.getItem('aihorde_max_length') || '80', 10);
    const stops = ['\nUser:', '\nUser ', '\nHuman:', '\nHuman ', 'User:', 'Human:', '\n###', '\n\nUser'];
    try {
      const extra = JSON.parse(localStorage.getItem('aihorde_stop_sequences') || 'null');
      if (Array.isArray(extra)) extra.forEach(s => { if (s && typeof s === 'string' && !stops.includes(s)) stops.push(s); });
    } catch (_) {}
    return {
      max_context_length: Math.min(Math.max(ctx, 256), 2048),
      max_length: Math.min(Math.max(len, 16), 180),
      temperature: 0.8,
      top_p: 0.9,
      stop_sequence: stops
    };
  }

  function sanitizeReply(raw) {
    let text = String(raw == null ? '' : raw).replace(/<\/?s>|<\|.*?\|>/g, '');
    const cutMarkers = [/\nUser\s*:/, /\nHuman\s*:/, /\n###/, /\n\nUser\b/, /\nAkari\s*:/];
    for (const marker of cutMarkers) {
      const m = text.match(marker);
      if (m && m.index != null && m.index > 0) text = text.slice(0, m.index);
    }
    return text.replace(/^\s*Akari\s*:\s*/i, '').trim();
  }

  globalThis.GenerateResponse = async function (userText) {
    __hordeAbort = false;
    if (window.AkariChat) AkariChat.append('user', userText, { provider: 'aihorde' });
    if (typeof typing === 'function') typing('Akari');
    else if (window.app?.ui?.setTyping) app.ui.setTyping('Akari');

    try {
      hordeNotify('AI Horde', 'Selecting model…', { duration: 2500 });
      const models = await resolveModels();
      if (__hordeAbort) return;
      const { priority, blocked } = getWorkerPrefs();
      const modelLabel = models[0] || '(any)';
      const extra = models.length > 1 ? ' (+' + (models.length - 1) + ' fallbacks)' : '';
      hordeNotify('AI Horde', 'Model: ' + modelLabel + extra, { duration: 5000, borderColors: ['#7dd3fc', '#5eead4'] });
      if (typeof typing === 'function') typing('Horde · ' + modelLabel.split('/').pop());
      const prompt = buildPrompt(userText);
      const params = genParams();
      const promptTok = estTokens(prompt);
      params.max_context_length = Math.max(256, Math.min(params.max_context_length, promptTok + params.max_length + 32));
      const body = {
        prompt,
        models,
        trusted_workers: localStorage.getItem('aihorde_trusted_only') === '1',
        slow_workers: localStorage.getItem('aihorde_slow_workers') !== '0',
        allow_downgrade: localStorage.getItem('aihorde_allow_downgrade') !== '0',
        params
      };
      if (priority.length) { body.workers = priority; body.worker_blacklist = false; }
      else if (blocked.length) { body.workers = blocked.slice(0, 5); body.worker_blacklist = true; }

      const res = await fetch(HORDE + '/generate/text/async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': getKey(), 'Client-Agent': CLIENT },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(res.status + ' ' + (await res.text()).slice(0, 200));
      const job = await res.json();
      if (!job.id) throw new Error('No job id from Horde');
      __hordeJobId = job.id;
      if (__hordeAbort) return;
      hordeNotify('AI Horde', 'Job queued · ' + modelLabel, { duration: 3500 });

      let text = null, usedModel = modelLabel, usedWorker = '';
      for (let i = 0; i < 90; i++) {
        if (__hordeAbort) { console.log('[AI Horde] aborted'); return; }
        await new Promise(r => setTimeout(r, 2000));
        if (__hordeAbort) return;
        const st = await fetch(HORDE + '/generate/text/status/' + job.id, { headers: { 'apikey': getKey(), 'Client-Agent': CLIENT } });
        if (!st.ok) continue;
        const status = await st.json();
        if (status.faulted) { say('[ERROR] AI Horde job faulted.'); return; }
        if (status.done && status.generations && status.generations.length) {
          const gen = status.generations[0];
          text = gen.text || gen.content;
          if (gen.model) usedModel = gen.model;
          if (gen.worker_name) usedWorker = gen.worker_name;
          break;
        }
        if (i === 0 || i % 5 === 0) {
          const q = status.queue_position != null ? 'queue #' + status.queue_position : 'waiting';
          const wait = status.wait_time != null ? ' · ~' + status.wait_time + 's' : '';
          if (typeof typing === 'function') typing('Horde · ' + q);
          hordeNotify('AI Horde', q + wait + ' · ' + modelLabel, { duration: 3000 });
        }
      }

      __hordeJobId = null;
      if (__hordeAbort) return;
      if (!text) {
        const errText = '[ERROR] AI Horde timed out waiting for a worker.';
        hordeNotify('AI Horde', 'Timed out waiting for a worker', { duration: 6000, borderColors: ['#f87171', '#f87171'] });
        say(errText);
        return errText;
      }
      text = sanitizeReply(text);
      hordeNotify('AI Horde', 'Done · ' + (usedWorker ? usedWorker + ' · ' : '') + usedModel, { duration: 4500, borderColors: ['#5eead4', '#7dd3fc'] });
      if (window.AkariChat) AkariChat.append('assistant', text, { provider: 'aihorde' });
      say(text);
      return text;
    } catch (e) {
      if (__hordeAbort) return;
      let msg = String(e.message || e);
      if (/KudosUpfront|required kudos/i.test(msg)) msg = 'Need more kudos for this size request. Try a shorter chat, or set a registered API key at aihorde.net/register (adapter will also allow_downgrade when possible).';
      const errText = '[ERROR] AI Horde: ' + msg;
      hordeNotify('AI Horde', msg.slice(0, 140), { duration: 7000, borderColors: ['#f87171', '#f87171'] });
      say(errText);
      return errText;
    }
  };

  if (!window.respond) window.respond = function (t) { return globalThis.GenerateResponse(t); };
  else {
    const prev = window.respond;
    window.respond = function (t) { return CloudAI ? globalThis.GenerateResponse(t) : prev(t); };
  }
})();
