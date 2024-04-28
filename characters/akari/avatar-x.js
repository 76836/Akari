console.log('Preparing to load Akari Vision...')
const targetDiv = document.getElementById('avatar');
targetDiv.innerHTML = `
<style>
    .cdiv {
        position: absolute;
        z-index: 7;
        background-color: blue;
        text-align: left;
        border: 1px solid transparent;
        overflow: hidden;
        border-radius: 2vh;
        width: 200px;
        height: 200px;
    }
    .iframe {
        width: 100%;
        border: 0;
        height: calc(100% - 4.4vh);
        border-radius: 2vh;
        transition-duration: 0.2s;
    }
    .iframe:Hover {
        width: 100%;
        border: 0;
        height: calc(100% - 4.4vh);
        border-radius: 0;
        transition-duration: 0.2s;
    }
    .dimmer {
        display: none;
        background: #000;
        opacity: 0.5;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 100;
    }
</style>
<div class="cdiv" id="mydiv">
    <div class="iframe" id="mydivheader">
        <div class="iframe" id="webcam-container"></div>
    </div>
</div>
`

avatararea = document.getElementById("avatar");

var ExJS2 = document.createElement("script");
ExJS2.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js"
document.avatararea.appendChild(ExJS2);

var ExJS2 = document.createElement("script");
ExJS2.src = "https://cdn.jsdelivr.net/npm/@teachablemachine/image@latest/dist/teachablemachine-image.min.js";
document.avatararea.appendChild(ExJS2);










// More API functions here:
// https://github.com/googlecreativelab/teachablemachine-community/tree/master/libraries/image

// the link to your model provided by Teachable Machine export panel
const URL = "https://teachablemachine.withgoogle.com/models/X-DAjnFT7/";

var camresult;

let model, webcam, labelContainer, maxPredictions;

// Load the image model and setup the webcam
async function init() {
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    // load the model and metadata
    // Refer to tmImage.loadFromFiles() in the API to support files from a file picker
    // or files from your local hard drive
    // Note: the pose library adds "tmImage" object to your window (window.tmImage)
    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();

    // Convenience function to setup a webcam
    const flip = true; // whether to flip the webcam
    webcam = new tmImage.Webcam(200, 200, flip); // width, height, flip
    await webcam.setup(); // request access to the webcam
    await webcam.play();
    window.requestAnimationFrame(loop);

    // append elements to the DOM
    document.getElementById("webcam-container").appendChild(webcam.canvas);
}

async function loop() {
    webcam.update(); // update the webcam frame
    await predict();
    window.requestAnimationFrame(loop);
}

// run the webcam image through the image model


// ... (existing init and predict functions)

// Additional variables to track confidence and timing
let confidenceCheck = {};
// Modified predict function
async function predict() {
    // predict can take in an image, video or canvas html element
    const prediction = await model.predict(webcam.canvas);
    for (let i = 0; i < maxPredictions; i++) {
        const classPrediction =
            prediction[i].className + ": " + prediction[i].probability.toFixed(2);


        // Check if the prediction confidence is high and others are low
        if (prediction[i].probability > 0.9) {
            // Initialize confidence check for the class if not exists
            if (!confidenceCheck[prediction[i].className]) {
                confidenceCheck[prediction[i].className] = { 'start': new Date().getTime(), 'end': null };
            } else {
                // Check if it has been 2 seconds
                if (new Date().getTime() - confidenceCheck[prediction[i].className].start > 1000) {
                    camresult = prediction[i].className;
                    console.log('camera sees:' + camresult);
                    respondcamera();
                    confidenceCheck = {}; // Reset the confidence check
                }
            }
        } else if (prediction[i].probability < 0.05) {
            // Reset the start time if the confidence drops below 5%
            if (confidenceCheck[prediction[i].className]) {
                confidenceCheck[prediction[i].className].start = new Date().getTime();
            }
        }
    }
}
async function respondcamera() {
    if (camresult == lastcamresult) {
        return;
    };
    if (camresult == 'wave') {
        goakari();
        return;
    };
    if (camresult == 'person') {
        document.getElementById('mydiv').style.opacity = "1";
        return;
    };
    if (camresult == 'nobody') {
        document.getElementById('mydiv').style.opacity = "0.5";
        return;
    };
    var lastcamresult = camresult;
};

init();
function dragElement(elmnt) {
    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    if (document.getElementById(elmnt.id + "header")) {
        document.getElementById(elmnt.id + "header").onmousedown = dragMouseDown;
        document.getElementById(elmnt.id + "header").ontouchstart = dragMouseDown;
    } else {
        elmnt.onpointerdown = dragMouseDown;
    }
    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();

        if (e.type === 'touchstart') {
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
        } else {
            pos3 = e.clientX;
            pos4 = e.clientY;
        }
        document.onmouseup = closeDragElement;
        document.ontouchend = closeDragElement;
        document.onmousemove = elementDrag;
        document.ontouchmove = elementDrag;
    }
    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();

        if (e.type === 'touchmove') {
            pos1 = pos3 - e.touches[0].clientX;
            pos2 = pos4 - e.touches[0].clientY;
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
        } else {
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
        }
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }
    function closeDragElement() {
        document.ontouchend = null;
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchmove = null;
    }
}
dragElement(document.getElementById("mydiv"));
