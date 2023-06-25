/*
 * Check for browser support
 */
var supportMsg = document.getElementById('test');
var responsetxt = document.querySelector('.responsetxt');

if ('speechSynthesis' in window) {
	supportMsg.innerHTML = 'Your browser <strong>supports</strong> speech synthesis.';
} else {
	supportMsg.innerHTML = 'Sorry your browser <strong>does not support</strong> speech synthesis.<br>Try this in <a href="https://www.google.co.uk/intl/en/chrome/browser/canary.html">Chrome Canary</a>.';
	supportMsg.classList.add('not-supported');
}


// Get the voice select element.
var voiceSelect = document.getElementById('voice');

// Get the attribute controls.
var volumeInput = document.getElementById('volume');
var rateInput = document.getElementById('rate');
var pitchInput = document.getElementById('pitch');


// Fetch the list of voices and populate the voice options.
function loadVoices() {
  // Fetch the available voices.
	var voices = speechSynthesis.getVoices();
  
  // Loop through each of the voices.
	voices.forEach(function(voice, i) {
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
window.speechSynthesis.onvoiceschanged = function(e) {
  loadVoices();
};


// Create a new utterance for the specified text and add it to
// the queue.
function speak(text) {
  // Create a new instance of SpeechSynthesisUtterance.
	var overflow = new SpeechSynthesisUtterance();
  
  // Set the text.
	overflow.text = text;
  
  // Set the attributes.
  overflow.volume = parseFloat(volumeInput.value);
  overflow.pitch = 1;
  overflow.rate = 1;
  overflow.lang = 'en-US';

  // If a voice has been selected, find the voice and set the
  // utterance instance's voice attribute.
	if (voiceSelect.value) {
		overflow.voice = speechSynthesis.getVoices().filter(function(voice) { return voice.name == voiceSelect.value; })[0];
	}
  
  // Queue this utterance.
	window.speechSynthesis.speak(overflow);
  responsetxt.textContent = text;
  overflow.onend = function (event) {
    console.log("SpeechSynthesisUtterance.onend");
  };

  overflow.onerror = function (event) {
    console.error("SpeechSynthesisUtterance.onerror");
  };

     
}


/*
 * Mostly copied and pasted from https://codepen.io/matt-west/pen/DpmMgE 
 */
