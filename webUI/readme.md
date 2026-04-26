# Akari Automata System — Comprehensive Technical Documentation

This document describes the **entire Automata system currently implemented in this repository**, with special focus on the WebUI runtime (`UI/WebUI`). It includes architecture, ATPK package format, event flow, lifecycle, conflict behavior, settings protocol, and integration examples with external systems.

---

## 1) What the Automata system is

Akari Automata is a browser-side plugin runtime where each plugin (“automaton”) is loaded from an ATPK package, registered into a runtime map, and reacts to emitted events such as:

- `message_sent` (text/voice user input)
- `tts_request` (speech synthesis request)
- `voice_toggle_on` / `voice_toggle_off`
- loader lifecycle events like `automaton_loaded`, `automaton_unloaded`, `error_occurred`

In WebUI, automata compete/cooperate by calling `event.apply(handler, index)` and the host executes the **highest-priority applicant** for each request-type event.

---

## 2) Main code surfaces (and responsibilities)

## 2.1 `UI/WebUI/ATPKLoader-1.1.0.js`

Core runtime implementation:

- `ATPKParser`
  - Parses ATPK text
  - Supports package metadata and repeated `!AUTOMATON` blocks
  - Validates required automaton fields (`name`, `version`, `description`, `code`)
  - Supports scalar fields and comma-separated lists
  - Rejects duplicate automaton names within a package
- `AutomatonLoader`
  - Maintains active runtime map (`this.automata`)
  - Loads package URLs from localStorage
  - Supports blacklist filtering
  - Loads packages via `fetch`
  - Dependency-aware sort + priority sort
  - Code execution via `new Function(...)`
  - Lifecycle controls: `shutdown`, `kill`, `restart`
  - Introspection: `list`, `info`, `listAll`, `getConflicts`

## 2.2 `UI/WebUI/index.js`

WebUI host runtime:

- Global event bus APIs (`on`, `off`, `emit`)
- Unified arbitration helpers:
  - `requestHandling(eventName, payload)` for general requests
  - `say(text, source)` for TTS requests
- Chat/UI glue (bubble rendering, notifications, voice button, task manager)
- Initializes `AutomatonLoader`, reads package URLs/blacklist, loads automata
- Handles settings iframe postMessage contract (`automata_update`, `automata_kill`, etc.)

## 2.3 `UI/WebUI/core_scripts.atpk`

Built-in package containing default automata:

- `akari-reflex` (legacy command interception)
- `akari-pollinations` (online AI provider)
- `akari-gemini` (Gemini provider if key exists)
- `akari-lcpp` (local llama.cpp server provider)
- `akari-kittentts` (KittenTTS provider)
- `akari-webspeechtts` (browser TTS fallback)
- `akari-webspeechstt` (browser STT fallback)
- `akari-audioconsole` (Audio Console advanced STT)

## 2.4 `UI/WebUI/akari_winter.atpk`

Avatar + emotion automaton package:

- Injects VRM iframe avatar
- Converts spoken output into emotion updates through a remote emotion engine
- Listens to `tts_request` and writes text into localStorage to drive emote loop

## 2.5 `UI/WebUI/settings.js` + `UI/WebUI/settings.html`

Control plane:

- Package URL management (`akari:automata_urls`)
- Blacklist toggles (`akari:automata_blacklist`)
- Per-automaton priority override keys (`index_<automaton-name>`)
- Quick install presets and parent-window messaging to reload runtime

## 2.6 Legacy compatibility runtime: `engine/automataAsReflex.js`

Provides similar event bus and `respond(outcome)` bridge behavior for non-WebUI/legacy pathways. Includes AKARI registry compatibility and request-handled tracking via wrapped `window.say`.

---

## 3) ATPK package format (spec as implemented)

An ATPK file is plain text. Top-level fields:

```txt
atpk-name: my-package
atpk-description: package description
```

Each automaton is declared with `!AUTOMATON` and fields:

```txt
!AUTOMATON
name: my-automaton
version: 1.0.0
description: does something
author: me
priority: 100
respondsto: message_sent, tts_request
controls: say, emit
dependencies: other-automaton
code>
module.exports.default = {
  setup() {}
};
<code
```

### Required fields per automaton

- `name`
- `version`
- `description`
- `code` (between `code>` and `<code`)

### Optional fields

- `author`
- `priority` (default 100)
- `respondsto` (comma list)
- `controls` (comma list)
- `dependencies` (comma list)

### Parse/validation behavior

- Empty content => error
- Unknown lines are effectively ignored unless they match known field prefixes
- Comments/blank lines are ignored (`#`, `//`, empty)
- Nested code blocks or unclosed code blocks => error
- Duplicate automaton names in one package => error

---

## 4) Runtime data model

`AutomatonLoader.automata` stores entries keyed by automaton name:

```js
{
  instance,       // exported automaton object from code eval
  metadata,       // parsed definition
  sourceUrl       // package URL
}
```

`info(name)` returns a normalized runtime status object with metadata, source URL, and static status `running`.

`listAll()` is the full runtime snapshot used by Task Manager and Settings UI.

---

## 5) Event bus and arbitration model

## 5.1 Event transport

`window.emit(eventName, data)` dispatches `CustomEvent` with `detail` payload. Handlers registered via `window.on(...)` receive that `detail` object.

## 5.2 Request arbitration (`event.apply`)

For request-like flows (`message_sent`, `tts_request`):

1. Host emits event with payload including `apply(handler, index)`.
2. Any automaton can call `event.apply(...)` to volunteer.
3. Host waits ~50ms for applicants.
4. Applicants are sorted descending by `index`.
5. Highest index handler executes.

This means **higher index = stronger claim**.

### Important nuance: metadata priority vs dynamic priority

Automaton metadata has `priority`, but most built-ins re-read a localStorage key (`index_<name>`) at event time and pass that to `event.apply`. So effective execution priority can diverge from package metadata.

---

## 6) Automaton lifecycle and loader behavior

## 6.1 Loading

`loadAll()` reads URL list from storage and calls `loadPackage(url)` sequentially.

`loadPackage(url)`:

- fetches ATPK text
- parses ATPK
- sorts automata by dependency and priority/name order
- skips blacklisted names
- loads each automaton via `loadAutomaton`
- tracks package in `loadedPackages`

## 6.2 Dependency sorting

`sortAutomata` performs DFS topological visit over declared `dependencies`. It also preorders by ascending priority (smaller first), then name. Dependency cycles throw an error.

## 6.3 Execution model

Automata code is evaluated by `new Function(...)` with CommonJS-style `module.exports` support. Return value is `module.exports.default || module.exports`.

If `setup` exists, it is awaited.

## 6.4 Unloading behaviors

- `shutdown(name)`:
  - calls `instance.teardown()` if present
  - removes from registry/maps
  - emits `automaton_unloaded` reason `shutdown`
- `kill(name)`:
  - force unregister without teardown
  - emits `automaton_unloaded` reason `killed`
- `restart(name)`:
  - shutdown, brief wait, then reload from stored metadata/code

---

## 7) Conflict detection model

`getConflicts()` groups running automata by `controls` values and reports any control with multiple owners.

This is informational only; loader does **not** auto-resolve. Actual winner per event still depends on `event.apply` indexes at runtime.

---

## 8) Storage keys and their semantics

- `akari:automata_urls` — array of ATPK URLs/paths
- `akari:automata_blacklist` — array of disabled automaton names
- `index_<automaton-name>` — dynamic arbitration index for that automaton
- `genAI_API_KEY` — key gate for Gemini automaton
- `lcpp_servers` — local server config used by `akari-lcpp`
- Visual keys also managed in WebUI settings (`selectedBKGURL`, screensaver keys)

---

## 9) Built-in automata behavior (from `core_scripts.atpk`)

## 9.1 `akari-reflex`

- Responds to `message_sent`
- Legacy rule-based interceptor for quick commands (`solve`, `time`, `who are you`, etc.)
- Uses `event.apply` with dynamic index from `index_akari-reflex` (default 200)

**Result pattern:** if user text matches hardcoded checks, reflex can beat model providers due to default higher index.

## 9.2 `akari-pollinations`

- Responds to `message_sent`
- Requires `navigator.onLine`
- Sends chat history to `https://text.pollinations.ai/`
- Uses `index_akari-pollinations` (default 100)

**Result pattern:** acts as baseline online AI backend when nothing higher wins.

## 9.3 `akari-gemini`

- Responds to `message_sent`
- Only applies if `genAI_API_KEY` exists
- Dynamically imports `@google/generative-ai`
- Starts chat model `gemini-2.5-flash`
- Uses `index_akari-gemini` (default 110)

**Result pattern:** if key exists and no higher-index handler claims, Gemini answers.

## 9.4 `akari-lcpp`

- Responds to `message_sent`
- Requires an online server entry from `lcpp_servers`
- Calls `<server>/v1/chat/completions`
- Uses `index_akari-lcpp` (default 120)

**Result pattern:** local server provider can outrank Gemini/Pollinations by index.

## 9.5 `akari-kittentts`

- Responds to `tts_request`
- Imports remote KittenTTS module + initializes `window.tts`
- Uses `index_akari-kittentts` (default 150)
- Ignores `source === 'text'` (no audio for typed input)

## 9.6 `akari-webspeechtts`

- Responds to `tts_request`
- Browser SpeechSynthesis fallback
- Uses `index_akari-webspeechtts` (default 10)
- Also ignores `source === 'text'`

**Result pattern:** fallback path when KittenTTS unavailable or deprioritized.

## 9.7 `akari-webspeechstt`

- Responds to mic toggle events
- Uses `webkitSpeechRecognition`
- On result, forwards transcript into `window.requestHandling('message_sent', ...)`

## 9.8 `akari-audioconsole`

- Setup-only advanced voice module import
- Uses external `AkarinetVoice` events to push recognized text into `message_sent`
- Updates mic UI via `setVoiceStatus`

---

## 10) Avatar/emotion automata (`akari_winter.atpk`)

`akari-winter` does all of the following in `setup`:

- Injects VRM iframe into `#avatar`
- Watches localStorage `emote` changes and emits `akari_emote_update`
- Imports remote emotion analyzer via inline module script
- Splits text into sentence-like chunks, infers emotion per chunk, sets `v2emote`
- On each `tts_request`, writes spoken text to `emote` to trigger emotion sequence

**Result pattern:** voice output text drives avatar emotion transitions over time.

---

## 11) WebUI Task Manager + settings integration protocol

### Settings -> host messages

- `request_automata_list`
- `automata_update`
- `automata_kill` (+ name)
- `automata_restart` (+ name)
- `apply_visuals`

Host replies with `automata_list` payload to settings iframe and refreshes runtime UI.

Task Manager (main UI) can also:

- add/remove/reload package URLs
- restart/kill/toggle automata
- reload all/shutdown all
- inspect conflicts and recent runtime events

---

## 12) Legacy bridge (`engine/automataAsReflex.js`) details

This file provides non-WebUI compatibility:

- Defines global `on/off/emit`
- Ensures `window.AKARI.automata._registry`
- Wraps `window.say` to mark request handled
- `respond(outcome)` emits `message_sent`, waits briefly for automata claim, then fallback routes:
  - shutdown/restart command events
  - solve command event
  - AI handover (`socket.send` or `GenerateResponse`)

Use this path when integrating automata into legacy reflex flow, not the full WebUI runtime.

---

## 13) Integration examples (code + outcomes)

## Example A — Build a custom `message_sent` automaton that calls an external API

```txt
!AUTOMATON
name: custom-weather-bot
version: 1.0.0
description: Weather lookup via external API
author: you
priority: 130
respondsto: message_sent
controls: say
code>
module.exports.default = {
  setup() {
    on('message_sent', (event) => {
      const q = event.message.toLowerCase();
      if (!q.startsWith('weather ')) return;

      event.apply(async () => {
        const city = q.replace('weather ', '').trim();
        const res = await fetch(`https://example.com/weather?city=${encodeURIComponent(city)}`);
        const data = await res.json();
        say(`Weather in ${city}: ${data.tempC}°C and ${data.condition}.`, event.source);
      }, 160);
    });
  }
};
<code
```

**Expected outcome:**

- If user says/enters `weather seattle`, this automaton volunteers at index 160.
- It beats default providers with lower index and produces a weather sentence via `say(...)`.

## Example B — Override TTS engine selection

```txt
!AUTOMATON
name: custom-tts
version: 1.0.0
description: Force a specific TTS backend
author: you
priority: 200
respondsto: tts_request
controls: say
code>
module.exports.default = {
  setup() {
    on('tts_request', (event) => {
      event.apply(async () => {
        if (event.source === 'text') return;
        // your own audio pipeline
        console.log('Speaking:', event.text);
      }, 999);
    });
  }
};
<code
```

**Expected outcome:**

- Your TTS handler wins arbitration and suppresses lower-index TTS automata.

## Example C — Interface with host UI features

```txt
!AUTOMATON
name: ui-notifier
version: 1.0.0
description: Uses host notification + emits events
author: you
priority: 140
respondsto: message_sent
controls: showNotification, emit
code>
module.exports.default = {
  setup() {
    on('message_sent', (event) => {
      if (event.message === 'status') {
        event.apply(async () => {
          showNotification('Automata', 'All systems nominal');
          emit('telemetry_ping', { ts: Date.now() });
          say('Status posted.', event.source);
        }, 140);
      }
    });
  }
};
<code
```

**Expected outcome:**

- UI notification appears.
- Custom event is emitted for any telemetry listener.
- Spoken/textual confirmation is sent.

---

## 14) Operational caveats and security notes

- ATPK automata execute arbitrary JS (`new Function`) in page context.
- External package URLs are remote code execution by design.
- `kill` does not teardown handlers unless automaton self-manages cleanup.
- Event handler leaks can occur if automata register listeners without unregister path.
- Conflict reporting is advisory only.
- Voice automata depend on browser capabilities (`webkitSpeechRecognition`, `speechSynthesis`) and network availability for remote providers.

---

## 15) Practical “how to reason about winner selection”

When multiple automata respond to the same request:

1. Confirm each automaton actually calls `event.apply` for the input.
2. Check runtime index source (`index_<name>` in localStorage).
3. Highest index wins.
4. If no automata apply, host says fallback message.

This runtime index arbitration is the most important debugging lens for “why did model X answer instead of Y?”.

---

## 16) Minimal checklist for authoring robust automata

- Export object via `module.exports.default = { ... }`.
- Implement `setup()` and register only needed events.
- Use guards before `event.apply(...)` to avoid hijacking unrelated prompts.
- Use localStorage-configurable index for tunable arbitration.
- Handle network/API errors and always return user-friendly output.
- Optionally implement `teardown()` and keep handler IDs so shutdown can fully clean up.
- Keep `controls` + `respondsto` metadata accurate for conflict and observability tooling.

---

## 17) Where this docs file belongs

Requested path: `/webUI/readme.md` (this file).

Primary runtime code it documents is under `UI/WebUI/*` plus legacy bridge in `engine/automataAsReflex.js` and selection entry in `app.html`.
