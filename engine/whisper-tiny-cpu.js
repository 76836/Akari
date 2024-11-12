say('Akari speecht5 v0.1 active');
  function loadWTC() {
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `

import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers';

let mediaRecorder;
let audioChunks = [];
let whisperPipeline;
let isRecording = false;
let audioContext;
let analyser;
let silenceStart = null;
const SILENCE_THRESHOLD = -50; // dB
const SILENCE_DURATION = 2000; // ms
const TARGET_SAMPLE_RATE = 16000; // Whisper expects 16kHz audio
let latestResult = '';
let liveMode = false;
let resultEvent = new Event('transcriptionComplete');

// Initialize the pipeline and add custom dictionary
async function initPipeline() {
    try {
        whisperPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
        console.log('Model loaded!');
    } catch (error) {
        console.error('Error loading model:', error);
    }
}

async function initDictionary(customWords = []) {
    // Add custom dictionary words if supported by the model
    if (whisperPipeline && whisperPipeline.addCustomWords) {
        whisperPipeline.addCustomWords(customWords);
        console.log('Custom dictionary added:', customWords);
    }
}

// Convert audio blob to data suitable for transcription
async function convertBlobToAudioData(blob) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    let audioData;
    if (audioBuffer.sampleRate !== TARGET_SAMPLE_RATE) {
        const offlineContext = new OfflineAudioContext(
            1,
            audioBuffer.duration * TARGET_SAMPLE_RATE,
            TARGET_SAMPLE_RATE
        );
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start();
        const resampled = await offlineContext.startRendering();
        audioData = resampled.getChannelData(0);
    } else {
        audioData = audioBuffer.getChannelData(0);
    }
    return audioData;
}

// Start recording with optional silence detection
async function startRecording(autoStop = false) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: TARGET_SAMPLE_RATE,
                channelCount: 1
            }
        });
        
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            latestResult = await transcribeAudio(audioBlob);
            document.dispatchEvent(resultEvent);
        };

        mediaRecorder.start();
        isRecording = true;
        silenceStart = null;

        if (autoStop) detectSilence(analyser);
        if (liveMode) liveTranscribe();
    } catch (error) {
        console.error('Error accessing microphone:', error);
    }
}

function stopRecording() {
    if (!isRecording) return;
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    isRecording = false;

    if (audioContext) {
        audioContext.close();
    }
}

// Auto-stop recording based on silence
async function startAutoRecording() {
    await startRecording(true);
}

function stopAutoRecording() {
    stopRecording();
}

// Detect silence to auto-stop recording
function detectSilence(analyser) {
    const dataArray = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const db = 20 * Math.log10(rms);

    if (db < SILENCE_THRESHOLD) {
        if (!silenceStart) {
            silenceStart = Date.now();
        } else if (Date.now() - silenceStart > SILENCE_DURATION) {
            stopRecording();
            return;
        }
    } else {
        silenceStart = null;
    }

    if (isRecording) {
        requestAnimationFrame(() => detectSilence(analyser));
    }
}

// Transcribe audio and handle live transcription
async function transcribeAudio(audioBlob) {
    try {
        const audioData = await convertBlobToAudioData(audioBlob);
        const result = await whisperPipeline(audioData);
        latestResult = result.text;
        console.log('Transcription complete:', latestResult);
        return latestResult;
    } catch (error) {
        console.error('Transcription error:', error);
        return '';
    }
}

async function liveTranscribe() {
    while (isRecording && liveMode) {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        await transcribeAudio(audioBlob);
    }
}

// Start and stop live mode for automatic transcription
function startLiveMode() {
    liveMode = true;
    startRecording();
}

function stopLiveMode() {
    liveMode = false;
    stopRecording();
}

// Expose the latest transcription result when done
document.addEventListener('transcriptionComplete', () => {
    console.log('New transcription available:', latestResult);
});

// Initialize the model pipeline on load
initPipeline().catch(console.error);


        // Expose the functions to the global scope
        window.startRecording = startRecording;
        window.stopRecording = stopRecording;
        window.startAutoRecording = startAutoRecording;
        window.startLiveMode = startLiveMode;
        window.stopLiveMode = stopLiveMode;
            
        `;
    document.body.appendChild(script);
  }
loadtWTC();
function startRecording(autoStop){
  window.startRecording
};

function stopRecording(){
  window.stopRecording()
};

function startAutoRecording(){
  window.startAutoRecording
};

function startLiveMode(){
  window.startLiveMode
};

function stopLiveMode(){
  window.stopLiveMode
};

