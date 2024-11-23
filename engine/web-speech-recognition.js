// Announce module loading
loadscreen('Using Web Speech API for transcription.');
function loadWhisperTranscription() {
  const script = document.createElement('script');
  script.type = 'module';
  script.textContent = `
    // Create a custom event that includes the transcription data
    const createTranscriptionEvent = (text) => {
      return new CustomEvent('transcriptionComplete', {
        detail: { text },
        bubbles: true,
        cancelable: true
      });
    };

    class WhisperTranscriber {
      constructor() {
        this.recognition = null;
        this.isRecording = false;
        this.transcript = '';
        this.initRecognition();
      }

      initRecognition() {
        try {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          this.recognition = new SpeechRecognition();
          this.recognition.continuous = false;
          this.recognition.interimResults = false;
          this.recognition.lang = 'en-US';
          
          this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (transcript.trim()) {  // Only dispatch if not empty
              document.dispatchEvent(createTranscriptionEvent(transcript.trim()));
            }
          };
          
          this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
          };
          
          console.log('Web Speech recognition initialized successfully');
          loadscreen('Web Speech recognition initialized successfully');
        } catch (error) {
          console.error('Error initializing Web Speech recognition:', error);
        }
      }

      startRecording() {
        if (this.isRecording) return;
        try {
          this.isRecording = true;
          this.recognition.start();
          console.log('Recording started');
        } catch (error) {
          console.error('Error starting recording:', error);
        }
      }

      stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;
        this.recognition.stop();
        console.log('Recording stopped');
      }
    }

    // Create singleton instance
    const transcriber = new WhisperTranscriber();

    // Expose methods globally with same interface
    window.whisperTranscriber = {
      start: () => transcriber.startRecording(),
      stop: () => transcriber.stopRecording(),
      startLive: () => transcriber.startRecording(),  // Maintain API compatibility
      stopLive: () => transcriber.stopRecording()     // Maintain API compatibility
    };
  `;
  
  document.body.appendChild(script);
}

// Load the module
loadWhisperTranscription();
