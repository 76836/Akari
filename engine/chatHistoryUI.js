/**
 * Chat history sidebar UI for AkariNet.
 * Injects button next to settings and a searchable left sidebar.
 * Depends on window.AkariChat (engine/chatHistory.js).
 */
(function () {
  function injectStyles() {
    if (document.getElementById('akari-hist-styles')) return;
    const style = document.createElement('style');
    style.id = 'akari-hist-styles';
    style.textContent = `
      #historyButton {
        background: rgba(15, 23, 42, 0.35); border: 1px solid var(--panel-border, rgba(148,163,184,0.22));
        color: var(--text, #ecf7ff); width: 38px; min-width: 38px; height: 18px; padding: 0 8px;
        border-radius: 8px; cursor: pointer; display: flex; justify-content: center; align-items: center;
        font-size: 16px; line-height: 1; overflow: hidden; white-space: nowrap;
      }
      #chat-history-sidebar {
        position: fixed; top: 0; left: 0; width: min(86vw, 320px); height: 100%;
        z-index: 120; transform: translateX(-105%); transition: transform 0.28s ease;
        background: var(--panel-strong, rgba(15,23,42,0.9)); border-right: 1px solid var(--panel-border, rgba(148,163,184,0.22));
        backdrop-filter: blur(12px); display: flex; flex-direction: column;
        box-shadow: 8px 0 32px rgba(2,6,23,0.7);
      }
      #chat-history-sidebar.open { transform: translateX(0); }
      #chat-history-sidebar .hist-header {
        display: flex; align-items: center; gap: 8px; padding: 12px 12px 8px;
        border-bottom: 1px solid var(--panel-border, rgba(148,163,184,0.22));
      }
      #chat-history-sidebar .hist-header h3 { margin: 0; font-size: 0.85rem; color: var(--text, #ecf7ff); flex: 1; }
      #chat-history-search {
        margin: 8px 12px; padding: 10px 12px; border-radius: 12px;
        border: 1px solid var(--input-border, rgba(125,211,252,0.4));
        background: var(--input-bg, rgba(15,23,42,0.7)); color: var(--text, #ecf7ff);
        outline: none; font-size: 0.9rem;
      }
      #chat-history-list {
        flex: 1; overflow-y: auto; padding: 4px 8px 16px; display: flex; flex-direction: column; gap: 4px;
      }
      .hist-item {
        text-align: left; padding: 10px 12px; border-radius: 12px; cursor: pointer;
        border: 1px solid transparent; background: transparent; color: var(--text, #ecf7ff);
        font-size: 0.85rem; line-height: 1.3; font-family: inherit;
      }
      .hist-item:hover { background: rgba(125, 211, 252, 0.08); }
      .hist-item.active { border-color: var(--accent, #7dd3fc); background: rgba(125, 211, 252, 0.12); }
      .hist-item .hist-meta { font-size: 0.7rem; color: var(--muted, #b6c7e6); margin-top: 4px; }
      .hist-item .hist-del {
        float: right; opacity: 0.5; border: none; background: transparent; color: var(--danger, #f87171);
        cursor: pointer; font-size: 0.85rem; padding: 0 4px;
      }
      .hist-item .hist-del:hover { opacity: 1; }
      #hist-new-btn {
        margin: 0 12px 10px; padding: 8px; border-radius: 12px; cursor: pointer;
        border: 1px solid var(--panel-border, rgba(148,163,184,0.22));
        background: rgba(125, 211, 252, 0.1); color: var(--accent, #7dd3fc);
        font-weight: 600; font-size: 0.8rem; font-family: inherit;
      }
      #hist-backdrop {
        position: fixed; inset: 0; background: rgba(2,6,23,0.45); z-index: 110;
        opacity: 0; pointer-events: none; transition: opacity 0.25s;
      }
      #hist-backdrop.show { opacity: 1; pointer-events: auto; }
    `;
    document.head.appendChild(style);
  }

  function ensureButton() {
    let btn = document.getElementById('historyButton');
    if (!btn) {
      const settings = document.getElementById('settingsButton');
      if (!settings || !settings.parentNode) return false;
      btn = document.createElement('button');
      btn.id = 'historyButton';
      btn.className = 'icemorphic toggle-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Chat history');
      btn.title = 'Chat history';
      btn.textContent = '☰';
      settings.insertAdjacentElement('afterend', btn);
    }
    if (!btn.dataset.akariHistBound) {
      btn.dataset.akariHistBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(true);
      });
    }
    return true;
  }

  function ensureSidebar() {
    if (document.getElementById('chat-history-sidebar')) return;
    const back = document.createElement('div');
    back.id = 'hist-backdrop';
    back.setAttribute('aria-hidden', 'true');
    const aside = document.createElement('aside');
    aside.id = 'chat-history-sidebar';
    aside.setAttribute('aria-label', 'Chat history');
    aside.innerHTML = `
      <div class="hist-header">
        <h3>Chats</h3>
        <button id="hist-close" class="icemorphic toggle-btn" aria-label="Close history" type="button">×</button>
      </div>
      <input type="search" id="chat-history-search" placeholder="Search chats..." autocomplete="off">
      <button type="button" id="hist-new-btn">+ New chat</button>
      <div id="chat-history-list" role="list"></div>
    `;
    document.body.appendChild(back);
    document.body.appendChild(aside);
    document.getElementById('hist-close').addEventListener('click', () => toggle(false));
    back.addEventListener('click', () => toggle(false));
    document.getElementById('chat-history-search').addEventListener('input', (e) => refreshList(e.target.value));
    document.getElementById('hist-new-btn').addEventListener('click', () => {
      if (!window.AkariChat) return;
      AkariChat.create('New chat');
      AkariChat.renderActive();
      refreshList();
    });
  }

  function toggle(force) {
    ensureSidebar();
    const side = document.getElementById('chat-history-sidebar');
    const back = document.getElementById('hist-backdrop');
    const open = force === true || (force !== false && !side.classList.contains('open'));
    side.classList.toggle('open', open);
    if (back) back.classList.toggle('show', open);
    if (open) refreshList();
  }

  function refreshList(query) {
    ensureSidebar();
    const list = document.getElementById('chat-history-list');
    if (!list || !window.AkariChat) return;
    const q = query != null ? query : (document.getElementById('chat-history-search')?.value || '');
    const chats = AkariChat.search(q);
    const activeId = AkariChat.getActiveId();
    list.innerHTML = '';
    if (!chats.length) {
      list.innerHTML = '<div class="hist-item" style="opacity:0.6">No chats found</div>';
      return;
    }
    chats.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hist-item' + (c.id === activeId ? ' active' : '');
      btn.setAttribute('role', 'listitem');
      const when = c.updated ? new Date(c.updated).toLocaleString() : '';
      const title = (c.title || 'Chat').replace(/</g, '&lt;');
      btn.innerHTML =
        '<span class="hist-del" title="Delete">×</span>' +
        '<div>' + title + '</div>' +
        '<div class="hist-meta">' + when + (c.provider ? ' · ' + c.provider : '') + '</div>';
      btn.addEventListener('click', (e) => {
        if (e.target.classList.contains('hist-del')) {
          e.stopPropagation();
          if (confirm('Delete this chat?')) {
            AkariChat.delete(c.id);
            refreshList();
            AkariChat.renderActive();
          }
          return;
        }
        AkariChat.switchTo(c.id);
        AkariChat.renderActive();
        refreshList();
        toggle(false);
      });
      list.appendChild(btn);
    });
  }

  function boot() {
    injectStyles();
    ensureSidebar();
    let tries = 0;
    (function tryBtn() {
      if (ensureButton() || tries++ > 40) return;
      setTimeout(tryBtn, 100);
    })();
    window.addEventListener('akari:chat-changed', () => {
      if (window.AkariChat) AkariChat.renderActive();
      refreshList();
    });
    window.AkariChatUI = { toggle, refreshList };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  // also try after full load (SW / late modules)
  window.addEventListener('load', () => { ensureButton(); ensureSidebar(); });
})();
