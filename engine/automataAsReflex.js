

async function respond(outcome) {
    var ogtxt = outcome;
    var lowOutcome = outcome.toLowerCase();

    // 1. Trigger the Message Sent Event
    emit('message_sent', {
        message: ogtxt,
        timestamp: Date.now(),
        source: "text", // Assuming text input for this bridge
        raw: ogtxt
    });

    // 2. Lifecycle & System Translation
    if (lowOutcome.includes("exit") && lowOutcome.length < 20) {
        emit('akari_shutdown', { reason: "user_request" });
        return;
    }

    if (lowOutcome.includes("re") && (lowOutcome.includes("start") || lowOutcome.includes("load")) && lowOutcome.length < 8) {
        emit('akari_shutdown', { reason: "restart" });
        return;
    }

    // 3. Command Translation (Math, Search, YouTube)
    if (lowOutcome.includes("solve ")) {
        const mathExpression = lowOutcome.replace("solve", "").trim();
        emit('command_executed', {
            command: "solve",
            args: [mathExpression],
            success: true
        });
        return;
    }

    if (lowOutcome.includes("youtube") || lowOutcome.includes(" play ")) {
        emit('command_executed', {
            command: "youtube_search",
            args: [ogtxt],
            success: true
        });
        return;
    }

    if (lowOutcome.includes("search")) {
        emit('command_executed', {
            command: "bing_search",
            args: [lowOutcome.replace('search', '').trim()],
            success: true
        });
        return;
    }

    // 4. UI Event Translation
    if (lowOutcome.includes("open") && lowOutcome.length < 30) {
        emit('window_opened', {
            url: lowOutcome.replace('open', '').trim() + ".com",
            windowId: "bridge_opened_window"
        });
        return;
    }

    if (lowOutcome.includes("close") && lowOutcome.length < 20) {
        emit('window_closed', {
            windowId: "last_window",
            duration: 0
        });
        return;
    }

    // 5. AI / LLM Handover
    if (serverStatus == "connected" || CloudAI == true) {
        emit('typing_started', { who: "akari" });
        
        /* This part assumes your GenerateResponse or socket 
           will eventually fire 'llm_response_received' 
        */
        if (serverStatus == "connected") {
            socket.send(ogtxt);
        } else {
            GenerateResponse(ogtxt);
        }
    } else {
        // Error/Fallback Translation
        emit('error_occurred', {
            message: "No keyword match and no AI connection.",
            source: "bridge_translator",
            severity: "warning"
        });
    }
}
