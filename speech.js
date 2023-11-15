
const getBrowserName = () => {
  let browserInfo = navigator.userAgent;
  let browser;
  if (browserInfo.includes('Opera') || browserInfo.includes('Opr')) {
    browser = 'Opera';
  } else if (browserInfo.includes('Edg')) {
    browser = 'Edge';
  } else if (browserInfo.includes('Chrome')) {
    browser = 'Chrome';
  } else if (browserInfo.includes('Safari')) {
    browser = 'Safari';
  } else if (browserInfo.includes('Firefox')) {
    browser = 'Firefox'
  } else {
    browser = 'unknown'
  }
  return browser;
}
var browser = getBrowserName();




var supportMsg = document.getElementById('test');

if ('speechSynthesis' in window) {
  supportMsg.innerHTML = 'Akari v1.9... Hello!';
} else {
  supportMsg.innerHTML = 'Akari V1.9: Speech synthesis has encountered an error!';
  supportMsg.classList.add('not-supported');
}

// Get the voice select element.
var voiceSelect = document.getElementById('voice');

// Fetch the list of voices and populate the voice options.
function loadVoices() {
  // Fetch the available voices.
  var voices = speechSynthesis.getVoices();

  // Loop through each of the voices.
  voices.forEach(function (voice, i) {
    // Create a new option element.
    var option = document.createElement('option');

    // Set the options value and text.
    option.value = voice.name;
    option.innerHTML = voice.name;

    // Add the option to the voice selector.
    voiceSelect.appendChild(option);
  });
}

// Execute loadVoices.
loadVoices();

// Chrome loads voices asynchronously.
window.speechSynthesis.onvoiceschanged = function (e) {
  loadVoices();
};



// Create a new utterance for the specified text and add it to
// the queue.
function speak(text) {
  // Create a new instance of SpeechSynthesisUtterance.
  var overflow = new SpeechSynthesisUtterance();
  // Set the attributes.
  overflow.volume = 1;
  overflow.text = text;
  overflow.pitch = 1;
  overflow.rate = 1;
  overflow.lang = 'en-US';

  if (browser == "Chrome") {
    voiceSelect.value = "Google US English";
  };
  // If a voice has been selected, find the voice and set the utterance instance's voice attribute.
  if (voiceSelect.value) {
    overflow.voice = speechSynthesis.getVoices().filter(function (voice) { return voice.name == voiceSelect.value; })[0];
  }

  // Queue this utterance.
  window.speechSynthesis.speak(overflow);
  bubble(text);

  overflow.onend = function (event) {
    console.log("Speech synthesis has ended");
  };

  overflow.onerror = function (event) {
    console.error("Speech synthesis has encountered an error!");
  };


}


/*
 * see https://codepen.io/matt-west/pen/DpmMgE for help making your own speech synthesis script for Akari
 */
