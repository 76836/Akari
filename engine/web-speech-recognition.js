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
        this.latestResult = '';
        this.liveMode = false;
        this.finalTranscript = '';
        this.interimTranscript = '';
        
        // Constants
        this.SILENCE_DURATION = 2000; // ms
        
        // Initialize the speech recognition
        this.initRecognition();
      }

      initRecognition() {
        try {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          this.recognition = new SpeechRecognition();
          
          // Configure recognition
          this.recognition.continuous = true;
          this.recognition.interimResults = true;
          this.recognition.lang = 'en-US';
          
          // Set up event handlers
          this.recognition.onresult = (event) => {
            this.interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                this.finalTranscript += transcript + ' ';
              } else {
                this.interimTranscript += transcript;
              }
            }
            
            this.latestResult = this.finalTranscript + this.interimTranscript;
            
            // Dispatch event with latest transcription
            if (this.liveMode || event.results[event.resultIndex].isFinal) {
              document.dispatchEvent(createTranscriptionEvent(this.latestResult.trim()));
            }
          };
          
          this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
          };
          
          this.recognition.onend = () => {
            if (this.isRecording) {
              this.recognition.start();
            }
          };
          
          console.log('Web Speech recognition initialized successfully');
          loadscreen('Web Speech recognition initialized successfully');
        } catch (error) {
          console.error('Error initializing Web Speech recognition:', error);
        }
      }

      async startRecording(autoStop = false) {
        if (this.isRecording) return;
        
        try {
          this.isRecording = true;
          this.finalTranscript = '';
          this.interimTranscript = '';
          this.recognition.start();
          
          if (autoStop) {
            setTimeout(() => {
              if (this.isRecording) {
                this.stopRecording();
              }
            }, this.SILENCE_DURATION);
          }
          
          console.log('Recording started');
        } catch (error) {
          console.error('Error starting recording:', error);
        }
      }

      stopRecording() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        this.recognition.stop();
        
        // Dispatch final event with complete transcription
        document.dispatchEvent(createTranscriptionEvent(this.finalTranscript.trim()));
        
        console.log('Recording stopped');
      }

      startLiveMode() {
        this.liveMode = true;
        this.startRecording();
      }

      stopLiveMode() {
        this.liveMode = false;
        this.stopRecording();
      }
    }

    // Create singleton instance
    const transcriber = new WhisperTranscriber();

    // Expose methods globally
    window.whisperTranscriber = {
      start: (autoStop = false) => transcriber.startRecording(autoStop),
      stop: () => transcriber.stopRecording(),
      startLive: () => transcriber.startLiveMode(),
      stopLive: () => transcriber.stopLiveMode()
    };
  `;
  
  document.body.appendChild(script);
}

// Load the module
loadWhisperTranscription();
