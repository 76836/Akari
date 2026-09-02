/**
 * AkariNet Global Chat History
 * Shared across all AI providers. Persists in localStorage.
 * API exposed on window.AkariChat
 */
(function () {
  const STORAGE_KEY = 'akari:chats';
  const ACTIVE_KEY = 'akari:activeChatId';
  const MAX_MESSAGES_PER_CHAT = 80;

  function uid() {
    return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }

  function saveAll(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[AkariChat] save failed', e);
    }
  }

  function normalizeTitle(title, fallback = 'Chat', maxLength = 60) {
    return String(title ?? fallback).replace(/\s+/g, ' ').trim().slice(0, maxLength) || fallback;
  }

  function ensureActive() {
    let id = localStorage.getItem(ACTIVE_KEY);
    const all = loadAll();
    if (id && all[id]) return id;
    let legacy = null;
    try {
      legacy = JSON.parse(localStorage.getItem('chatHistory') || 'null');
    } catch {}
    const messages = Array.isArray(legacy) ? legacy : [];
    const firstUser = messages.find(m => m && m.role === 'user');
    const chat = {
      id: uid(),
      title: messages.length ? normalizeTitle(firstUser?.content || 'Chat', 'Chat', 40) : 'New chat',
      messages,
      created: Date.now(),
      updated: Date.now(),
      provider: ''
    };
    all[chat.id] = chat;
    saveAll(all);
    localStorage.setItem(ACTIVE_KEY, chat.id);
    return chat.id;
  }

  const AkariChat = {
    getActiveId() { return ensureActive(); },
    getActive() {
      const id = ensureActive();
      const all = loadAll();
      return all[id];
    },
    list() {
      const all = loadAll();
      return Object.values(all).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    },
    create(title) {
      const all = loadAll();
      const chat = {
        id: uid(), title: normalizeTitle(title, 'New chat'), messages: [],
        created: Date.now(), updated: Date.now(), provider: ''
      };
      all[chat.id] = chat;
      saveAll(all);
      localStorage.setItem(ACTIVE_KEY, chat.id);
      window.dispatchEvent(new CustomEvent('akari:chat-changed', { detail: { id: chat.id, action: 'create' } }));
      return chat;
    },
    switchTo(id) {
      const all = loadAll();
      if (!all[id]) return null;
      localStorage.setItem(ACTIVE_KEY, id);
      window.dispatchEvent(new CustomEvent('akari:chat-changed', { detail: { id, action: 'switch' } }));
      return all[id];
    },
    rename(id, title) {
      const all = loadAll();
      if (!all[id]) return;
      all[id].title = normalizeTitle(title);
      all[id].updated = Date.now();
      saveAll(all);
      window.dispatchEvent(new CustomEvent('akari:chat-changed', { detail: { id, action: 'rename' } }));
    },
    delete(id) {
      const all = loadAll();
      if (!all[id]) return;
      delete all[id];
      saveAll(all);
      const active = localStorage.getItem(ACTIVE_KEY);
      if (active === id) {
        const remaining = Object.keys(all);
        if (remaining.length) localStorage.setItem(ACTIVE_KEY, remaining[0]);
        else { localStorage.removeItem(ACTIVE_KEY); ensureActive(); }
      }
      window.dispatchEvent(new CustomEvent('akari:chat-changed', { detail: { id, action: 'delete' } }));
    },
    append(role, content, meta) {
      if (!content && content !== '') return;
      const id = ensureActive();
      const all = loadAll();
      const chat = all[id];
      if (!chat) return;
      chat.messages = chat.messages || [];
      chat.messages.push({ role, content: String(content), ts: Date.now(), ...(meta || {}) });
      while (chat.messages.length > MAX_MESSAGES_PER_CHAT) {
        const idx = chat.messages.findIndex(m => m.role !== 'system');
        if (idx === -1) break;
        chat.messages.splice(idx, 1);
      }
      if ((!chat.title || chat.title === 'New chat') && role === 'user') {
        chat.title = normalizeTitle(content, 'Chat', 40);
      }
      chat.updated = Date.now();
      if (meta && meta.provider) chat.provider = meta.provider;
      all[id] = chat;
      saveAll(all);
      window.dispatchEvent(new CustomEvent('akari:chat-message', { detail: { id, role, content: String(content) } }));
      return chat;
    },
    getMessagesForLLM(includeSystem = true) {
      const chat = this.getActive();
      if (!chat || !chat.messages) return [];
      return chat.messages.filter(m => m && m.content != null && (includeSystem || m.role !== 'system'))
        .map(m => ({ role: m.role, content: m.content }));
    },
    search(query) {
      const q = String(query || '').toLowerCase().trim();
      const list = this.list();
      if (!q) return list;
      return list.filter(c => (c.title || '').toLowerCase().includes(q) ||
        (c.messages || []).some(m => (m.content || '').toLowerCase().includes(q)));
    },
    renderActive() {
      const container = document.getElementById('messages-container');
      if (!container) return;
      container.innerHTML = '';
      const chat = this.getActive();
      if (!chat) return;
      (chat.messages || []).forEach(m => {
        if (m.role === 'system') return;
        if (typeof window.bubble === 'function' && typeof window.bubble_incoming === 'function') {
          if (m.role === 'user') window.bubble_incoming(m.content);
          else window.bubble(m.content);
        } else {
          const div = document.createElement('div');
          div.className = m.role === 'user' ? 'command' : 'responsetxt';
          div.textContent = m.content;
          container.appendChild(div);
        }
      });
      container.scrollTop = container.scrollHeight;
      const titleEl = document.querySelector('.chat-title');
      if (titleEl && chat.title) titleEl.textContent = chat.title;
    },
    clearActiveMessages() {
      const id = ensureActive();
      const all = loadAll();
      if (!all[id]) return;
      all[id].messages = [];
      all[id].updated = Date.now();
      saveAll(all);
      this.renderActive();
      window.dispatchEvent(new CustomEvent('akari:chat-changed', { detail: { id, action: 'clear' } }));
    }
  };

  ensureActive();
  window.AkariChat = AkariChat;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => AkariChat.renderActive(), 50));
  } else {
    setTimeout(() => AkariChat.renderActive(), 50);
  }
})();
