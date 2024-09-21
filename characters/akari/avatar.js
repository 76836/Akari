const html = `

<style>
    .cdiv {
        position: fixed;
        z-index: 7;
        background-color: rgba(255,055,255,0.5);
        text-align: left;
        border: 1px solid transparent;
        overflow: hidden;
        border-radius: 2vh;
        width: 27vh;
        height: 52vh;
    }

    .iframei {
        width: 100%;
        border: 0;
        height: auto;
        border-radius: 2vh;
        transition-duration: 0.2s;
        padding:0;
        margin:0;
    }

    .iframei:Hover {
        width: 100%;
        border: 0;
        height: auto;
        border-radius: 1vh;
        transition-duration: 0.2s;
    }

    .minbutton{
    width: 100%;
    font-size:large;
    background-color: rgba(100,255,255,0.5);
    border-radius: 2vh;
    height:4vh;
    padding:0;
    margin:0;
    border:0;
    transition-duration: 0.2s;
    }

    .minbutton:hover{
    background-color: rgba(100,255,255,0.7);
    border-radius: 1vh;
    border:0;
    transition-duration: 0.2s;
    }
</style>

<div class="cdiv" id="mydiv">

    <div class="iframei" id="mydivheader">
        <img id="avatarimage" class="iframei" src=""></img>
    </div>
    
    <button class="minbutton">minimize</button>
</div>


`;
document.getElementById('avatar').innerHTML = html;
/* told you i'd finish this script later. */
// um but its not done quite yet...






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


// ######################################################################
// ##################################### Emotion detecting functions ####

function detectHappiness(text) {
    const happinessKeywords = ['happy', 'joy', 'excited', 'pleased', 'yay', 'awesome', 'great'];
    const exclamations = (text.match(/!+/g) || []).length;
    const smileyFaces = text.match(/(:\)|:-\))/g);
    
    return happinessKeywords.some(word => text.includes(word)) && (exclamations > 1 || smileyFaces);
}

function detectSadness(text) {
    const sadnessKeywords = ['sad', 'unhappy', 'depressed', 'cry', 'heartbroken', 'blue'];
    const negations = ['not happy', 'not feeling good'];
    const frownFaces = text.match(/(:\(|:-\()/g);

    return sadnessKeywords.some(word => text.includes(word)) || 
           negations.some(phrase => text.includes(phrase)) ||
           (frownFaces && frownFaces.length > 0);
}

function detectSurprise(text) {
    const surpriseKeywords = ['surprised', 'shocked', 'wow', 'unbelievable', 'no way'];
    const exclamations = (text.match(/!+/g) || []).length;
    
    return surpriseKeywords.some(word => text.includes(word)) && exclamations > 2;
}

function detectFear(text) {
    const fearKeywords = ['scared', 'afraid', 'fear', 'terrified', 'nervous', 'worried'];
    const hesitantPhrases = ['I don’t know', 'I’m not sure'];
    
    return fearKeywords.some(word => text.includes(word)) || hesitantPhrases.some(phrase => text.includes(phrase));
}

function detectDisgust(text) {
    const disgustKeywords = ['disgusted', 'gross', 'nasty', 'eww', 'revolting', 'repulsive'];
    return disgustKeywords.some(word => text.includes(word));
}

function detectLove(text) {
    const loveKeywords = ['love', 'adore', 'heart', '<3', 'cherish'];
    const romanticSymbols = text.match(/<3+/g);

    return loveKeywords.some(word => text.includes(word)) || (romanticSymbols && romanticSymbols.length > 0);
}

function detectJealousy(text) {
    const jealousyKeywords = ['jealous', 'envious', 'wish I had', 'envy'];
    
    return jealousyKeywords.some(word => text.includes(word));
}

function detectHope(text) {
    const hopeKeywords = ['hope', 'wish', 'aspire', 'hopefully', 'optimistic'];
    
    return hopeKeywords.some(word => text.includes(word));
}

function detectConfusion(text) {
    const confusionKeywords = ['confused', 'puzzled', 'lost', 'don’t understand', 'what?'];
    const questionMarks = (text.match(/\?+/g) || []).length;

    return confusionKeywords.some(word => text.includes(word)) || questionMarks > 1;
}

function detectShame(text) {
    const shameKeywords = ['ashamed', 'embarrassed', 'regret', 'sorry', 'guilt'];

    return shameKeywords.some(word => text.includes(word));
}

function detectGuilt(text) {
    const guiltKeywords = ['guilty', 'regret', 'feel bad', 'shouldn’t have', 'sorry'];

    return guiltKeywords.some(word => text.includes(word));
}

function detectPride(text) {
    const prideKeywords = ['proud', 'accomplished', 'achieved', 'success', 'victory'];

    return prideKeywords.some(word => text.includes(word));
}

function detectGratitude(text) {
    const gratitudeKeywords = ['thank you', 'grateful', 'appreciate', 'thanks', 'blessed'];

    return gratitudeKeywords.some(word => text.includes(word));
}

function detectExcitement(text) {
    const excitementKeywords = ['excited', 'thrilled', 'can’t wait', 'pumped'];
    const exclamations = (text.match(/!+/g) || []).length;
    
    return excitementKeywords.some(word => text.includes(word)) && exclamations > 2;
}

function detectAnxiety(text) {
    const anxietyKeywords = ['anxious', 'nervous', 'worried', 'tense', 'stressed'];
    const ellipses = text.includes('...');
    
    return anxietyKeywords.some(word => text.includes(word)) || ellipses;
}

function detectBoredom(text) {
    const boredomKeywords = ['bored', 'meh', 'whatever', 'nothing to do', 'yawn'];

    return boredomKeywords.some(word => text.includes(word));
}

function detectEmbarrassment(text) {
    const embarrassmentKeywords = ['embarrassed', 'awkward', 'whoops', 'oops'];
    
    return embarrassmentKeywords.some(word => text.includes(word));
}

function detectRelief(text) {
    const reliefKeywords = ['relieved', 'thank goodness', 'finally', 'phew'];
    
    return reliefKeywords.some(word => text.includes(word));
}

function detectCuriosity(text) {
    const curiosityKeywords = ['curious', 'wonder', 'interested', 'want to know'];
    const questionMarks = (text.match(/\?+/g) || []).length;
    
    return curiosityKeywords.some(word => text.includes(word)) || questionMarks > 1;
}

function detectAnger(text) {
    const angerKeywords = ['angry', 'mad', 'furious', 'rage', 'hate'];
    const cursing = text.match(/\b(f|sh|d[a-z]+)\b/gi);
    const capsLockWords = text.split(' ').filter(word => word === word.toUpperCase() && word.length > 3);

    return angerKeywords.some(word => text.includes(word)) || (cursing && cursing.length > 2) || capsLockWords.length > 1;
}


// ###################################### End emotion detecting functions ####
// ###########################################################################






    function updateImage(etxt) {
    var nil = 'default.jpeg';
if (detectHappiness(etxt) == true) {nil="happy.jpg"};
if (detectSadness(etxt) == true) {nil="sad.webp"};
if (detectAnger(etxt) == true) {nil="angry.jpg"};
if (detectSurprise(etxt) == true) {nil="surprise.webp"};
if (detectFear(etxt) == true) {nil="fear.png"};
if (detectDisgust(etxt) == true) {nil="disgust.png"};
if (detectLove(etxt) == true) {nil="love.webp"};
if (detectJealousy(etxt) == true) {nil="jealous.webp"};
if (detectHope(etxt) == true) {nil="hope.webp"};
if (detectConfusion(etxt) == true) {nil="confusion.png"};
if (detectShame(etxt) == true) {nil="shame.jpeg"};
if (detectGuilt(etxt) == true) {nil="guilt.jpg"};
if (detectPride(etxt) == true) {nil="pride.jpeg"};
if (detectGratitude(etxt) == true) {nil="gratitude.webp"};
if (detectExcitement(etxt) == true) {nil="excited.webp"};
if (detectAnxiety(etxt) == true) {nil="anxious.png"};
if (detectBoredom(etxt) == true) {nil="bored.jpg"};
if (detectEmbarrassment(etxt) == true) {nil="embarassed.webp"};
if (detectRelief(etxt) == true) {nil="relief.webp"};
if (detectCuriosity(etxt) == true) {nil="curious.jpeg"};
const imageElem = document.getElementById('avatarimage');
imageElem.src = "./characters/akari/emote2/" + nil;
    };

    localStorage.setItem("emote", "Hello World");
    var emoteStorage = localStorage.getItem("emote");

     function checkEmoteChange() {
        var newEmote = localStorage.getItem("emote");
        if (newEmote !== emoteStorage) {
            updateImage(newEmote.toLowerCase());
            emoteStorage = newEmote; // Update the stored value to avoid future mismatches
        }
    }
    // Call the checkEmoteChange function initially
    checkEmoteChange();
    // Set up an interval to call the checkEmoteChange function regularly
    setInterval(checkEmoteChange, 1000); // Check every second
