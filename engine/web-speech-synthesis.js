let speechSynthesisInstance = window.speechSynthesis;
let utterance = new SpeechSynthesisUtterance();
utterance.voice = null;  // Placeholder for female voice selection
utterance.rate = 1;      // Default playback rate

// Function to find and set a female voice
function setFemaleVoice() {
    let voices = speechSynthesisInstance.getVoices();
    // Attempt to find a female voice in the available voices
    for (let voice of voices) {
        if (voice.name.toLowerCase().includes('female') || voice.gender === 'female') {
            utterance.voice = voice;
            break;
        }
    }
    // Fallback: if no specific female voice is found, pick the first available voice
    if (!utterance.voice && voices.length > 0) {
        utterance.voice = voices[0];
    }
}

// Function to speak text
function speak(text) {
    loadscreen("Using Web Speech API for TTS...");
    // Stop any ongoing speech before starting a new one
    stopSpeech();
    
    // Set the text and speak
    utterance.text = text;
    setFemaleVoice();
    speechSynthesisInstance.speak(utterance);
}

// Function to stop speech
function stopSpeech() {
    speechSynthesisInstance.cancel();
}

// Function to set playback rate
function setPlaybackRate(rate) {
    utterance.rate = rate;
}

// Ensure voices are loaded before attempting to use them
if (speechSynthesisInstance.onvoiceschanged !== undefined) {
    speechSynthesisInstance.onvoiceschanged = setFemaleVoice;
}
