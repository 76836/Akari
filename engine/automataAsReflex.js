
const _eventHandlers = new Map();

/**
 * Registers an event listener and returns a unique ID.
 */
function on(eventName, handler) {
    const handlerId = Math.random().toString(36).substr(2, 9);
    
    // Wrapper to handle the event
    const wrapper = (e) => handler(e.detail);
    
    if (!_eventHandlers.has(eventName)) {
        _eventHandlers.set(eventName, new Map());
    }
    
    _eventHandlers.get(eventName).set(handlerId, wrapper);
    window.addEventListener(eventName, wrapper);
    
    return handlerId;
}

/**
 * Removes an event listener using the Event Name and Handler ID.
 */
function off(eventName, handlerId) {
    const handlers = _eventHandlers.get(eventName);
    if (handlers && handlers.has(handlerId)) {
        const wrapper = handlers.get(handlerId);
        window.removeEventListener(eventName, wrapper);
        handlers.delete(handlerId);
    }
}

/**
 * Emits a custom event into the system.
 */
function emit(eventName, data) {
    const event = new CustomEvent(eventName, { detail: data });
    window.dispatchEvent(event);
}

// Ensure these are globally available for the Automata to find
window.on = on;
window.off = off;
window.emit = emit;
window.log = window.log || function(level, message, extra) {
    const fn = level === "error" ? console.error : (level === "warn" ? console.warn : console.log);
    fn(`[automata:${level || "info"}]`, message, extra || "");
};

// Optional compatibility target used by some AkariNet Automata packages.
window.AKARI = window.AKARI || {};
window.AKARI.automata = window.AKARI.automata || {};
window.AKARI.automata._registry = window.AKARI.automata._registry || {};

// Track whether an automaton has already handled a user request.
const __automataState = window.__akariAutomataState || {
    activeRequestId: null,
    handledRequestId: null
};
window.__akariAutomataState = __automataState;

if (!window.__akariAutomataSayWrapped && typeof window.say === "function") {
    const originalSay = window.say;
    window.say = function(...args) {
        if (__automataState.activeRequestId) {
            __automataState.handledRequestId = __automataState.activeRequestId;
        }
        return originalSay.apply(this, args);
    };
    window.__akariAutomataSayWrapped = true;
}

// --- Main Reflex Logic ---
async function respond(outcome) {
    var ogtxt = outcome;
    var lowOutcome = outcome.toLowerCase();
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    __automataState.activeRequestId = requestId;
    __automataState.handledRequestId = null;

    // 1. Trigger the Message Sent Event
    // This allows all Automata (like 'automaton-manager') to process the input
    emit('message_sent', {
        message: ogtxt,
        timestamp: Date.now(),
        source: "text",
        raw: ogtxt,
        requestId
    });

    // Give event-driven automata a short async window to answer.
    await new Promise(resolve => setTimeout(resolve, 120));

    if (__automataState.handledRequestId === requestId) {
        emit('message_handled', { by: "automata", requestId, message: ogtxt });
        __automataState.activeRequestId = null;
        return;
    }

    // 2. Lifecycle Handlers
    if (lowOutcome.includes("exit") && lowOutcome.length < 20) {
        emit('akari_shutdown', { reason: "user_request" });
        __automataState.activeRequestId = null;
        return;
    }

    if (lowOutcome.includes("re") && (lowOutcome.includes("start") || lowOutcome.includes("load")) && lowOutcome.length < 8) {
        emit('akari_shutdown', { reason: "restart" });
        __automataState.activeRequestId = null;
        return;
    }

    // 3. Command Translation
    if (lowOutcome.includes("solve ")) {
        const mathExpression = lowOutcome.replace("solve", "").trim();
        emit('command_executed', {
            command: "solve",
            args: [mathExpression],
            success: true
        });
        __automataState.activeRequestId = null;
        return;
    }

    // 4. AI / LLM Handover
    // Note: Usually, you'd check if an automaton already handled this first
    if (typeof serverStatus !== 'undefined' && (serverStatus == "connected" || window.CloudAI == true)) {
        emit('typing_started', { who: "akari" });
        
        if (serverStatus == "connected") {
            socket.send(ogtxt);
        } else if (typeof GenerateResponse === 'function') {
            GenerateResponse(ogtxt);
        }
    }

    __automataState.activeRequestId = null;
}
