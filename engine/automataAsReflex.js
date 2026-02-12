
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

// --- Main Reflex Logic ---
async function respond(outcome) {
    var ogtxt = outcome;
    var lowOutcome = outcome.toLowerCase();

    // 1. Trigger the Message Sent Event
    // This allows all Automata (like 'automaton-manager') to process the input
    emit('message_sent', {
        message: ogtxt,
        timestamp: Date.now(),
        source: "text",
        raw: ogtxt
    });

    // 2. Lifecycle Handlers
    if (lowOutcome.includes("exit") && lowOutcome.length < 20) {
        emit('akari_shutdown', { reason: "user_request" });
        return;
    }

    if (lowOutcome.includes("re") && (lowOutcome.includes("start") || lowOutcome.includes("load")) && lowOutcome.length < 8) {
        emit('akari_shutdown', { reason: "restart" });
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
}
