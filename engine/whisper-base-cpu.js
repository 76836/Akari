// Announce module loading
say('Whisper Base running locally (v1.0)');

function loadWhisperTranscription() {
  const script = document.createElement('script');
  script.type = 'module';
  script.textContent = `
    import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers';

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
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.whisperPipeline = null;
        this.isRecording = false;
        this.audioContext = null;
        this.analyser = null;
        this.silenceStart = null;
        this.latestResult = '';
        this.liveMode = false;
        
        // Constants
        this.SILENCE_THRESHOLD = -50; // dB
        this.SILENCE_DURATION = 2000; // ms
        this.TARGET_SAMPLE_RATE = 16000;
        
        // Initialize the pipeline
        this.initPipeline();
      }

      async initPipeline() {
        try {
          this.whisperPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en');
          console.log('Whisper model loaded successfully');
          loadscreen('Whisper model loaded successfully');
        } catch (error) {
          console.error('Error loading Whisper model:', error);
        }
      }

      async convertBlobToAudioData(blob) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        if (audioBuffer.sampleRate !== this.TARGET_SAMPLE_RATE) {
          const offlineContext = new OfflineAudioContext(
            1,
            audioBuffer.duration * this.TARGET_SAMPLE_RATE,
            this.TARGET_SAMPLE_RATE
          );
          const source = offlineContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(offlineContext.destination);
          source.start();
          const resampled = await offlineContext.startRendering();
          return resampled.getChannelData(0);
        }
        return audioBuffer.getChannelData(0);
      }

      async startRecording(autoStop = false) {
        if (this.isRecording) return;
        
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: this.TARGET_SAMPLE_RATE,
              channelCount: 1
            }
          });
          
          this.mediaRecorder = new MediaRecorder(stream);
          this.audioChunks = [];
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = this.audioContext.createMediaStreamSource(stream);
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 2048;
          source.connect(this.analyser);

          this.mediaRecorder.ondataavailable = (event) => {
            this.audioChunks.push(event.data);
          };

          this.mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
            this.latestResult = await this.transcribeAudio(audioBlob);
            document.dispatchEvent(createTranscriptionEvent(this.latestResult));
          };

          this.mediaRecorder.start();
          this.isRecording = true;
          this.silenceStart = null;

          if (autoStop) this.detectSilence();
          if (this.liveMode) this.liveTranscribe();
          
          console.log('Recording started');
        } catch (error) {
          console.error('Error starting recording:', error);
        }
      }

      stopRecording() {
        if (!this.isRecording) return;
        
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        this.isRecording = false;

        if (this.audioContext) {
          this.audioContext.close();
        }
        
        console.log('Recording stopped');
      }

      detectSilence = () => {
        const dataArray = new Float32Array(this.analyser.frequencyBinCount);
        this.analyser.getFloatTimeDomainData(dataArray);

        const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + val * val, 0) / dataArray.length);
        const db = 20 * Math.log10(rms);

        if (db < this.SILENCE_THRESHOLD) {
          if (!this.silenceStart) {
            this.silenceStart = Date.now();
          } else if (Date.now() - this.silenceStart > this.SILENCE_DURATION) {
            this.stopRecording();
            return;
          }
        } else {
          this.silenceStart = null;
        }

        if (this.isRecording) {
          requestAnimationFrame(() => this.detectSilence());
        }
      }

      async transcribeAudio(audioBlob) {
        try {
          const audioData = await this.convertBlobToAudioData(audioBlob);
          const result = await this.whisperPipeline(audioData);
          return result.text;
        } catch (error) {
          console.error('Transcription error:', error);
          return '';
        }
      }

      async liveTranscribe() {
        while (this.isRecording && this.liveMode) {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
          this.latestResult = await this.transcribeAudio(audioBlob);
          document.dispatchEvent(createTranscriptionEvent(this.latestResult));
          await new Promise(resolve => setTimeout(resolve, 1000)); // Prevent excessive CPU usage
        }
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
