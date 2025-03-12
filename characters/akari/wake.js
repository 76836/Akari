console.log('Preparing to load Akari wake word...');
const audioElement = document.createElement('audio');
audioElement.setAttribute('src', 'https://76836.github.io/Akari/characters/akari/Summon.mp3');
audioElement.setAttribute('id', 'summonAudio');
const avatarDiv = document.getElementById('messages');
avatarDiv.appendChild(audioElement);
const playAudio = () => {
    console.log('There should be a sound now');
    const audio = document.getElementById('summonAudio');
    audio.play();
    console.log('Did you hear it?');
}


window.addEventListener('load', function () {
});

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function loadAllScripts() {
    try {
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/speech-commands@0.4.0/dist/speech-commands.min.js');

// more documentation available at
    // https://github.com/tensorflow/tfjs-models/tree/master/speech-commands

    // the link to your model provided by Teachable Machine export panel
    const URL = "https://teachablemachine.withgoogle.com/models/SwNFRUBwu/";

    async function createModel() {
        const checkpointURL = URL + "model.json"; // model topology
        const metadataURL = URL + "metadata.json"; // model metadata

        const recognizer = speechCommands.create(
            "BROWSER_FFT", // fourier transform type, not useful to change
            undefined, // speech commands vocabulary feature, not useful for your models
            checkpointURL,
            metadataURL);

        // check that model and metadata are loaded via HTTPS requests.
        await recognizer.ensureModelLoaded();

        return recognizer;
    }

    async function init() {
        const recognizer = await createModel();
        const classLabels = recognizer.wordLabels(); // get class labels



            // Fetch custom threshold from localStorage
            const wakeSense = parseFloat(localStorage.getItem('wakeSense')) || 0.97;




        // listen() takes two arguments:
        // 1. A callback function that is invoked anytime a word is recognized.
        // 2. A configuration object with adjustable fields
        recognizer.listen(result => {
            const scores = result.scores; // probability of prediction for each class
            // render the probability scores per class
            if (result.scores[1] > 0.97 && result.scores[1] < 1.62) {
                 //bubble_incoming('Akari');
            };
            if (result.scores[2] > wakeSense && result.scores[2] < 1.62) {
                playAudio();
                goakari();
            };
            
        }, {
            includeSpectrogram: false, // in case listen should return result.spectrogram
            probabilityThreshold: 0.75,
            invokeCallbackOnNoiseAndUnknown: true,
            overlapFactor: 0.65 // probably want between 0.5 and 0.75. More info in README
        });

        // Stop the recognition in 5 seconds.
        // setTimeout(() => recognizer.stopListening(), 5000);
    }
    init();
      

    } catch (error) {
        console.error('Error loading scripts:', error);
    }
}

loadAllScripts();
