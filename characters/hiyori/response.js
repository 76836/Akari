function getGreetingByTime() {
    return "hello!";
};

if (typeof CloudAI === 'undefined') {
    var CloudAI = false;
};

// This function creates a dialog box with a message and returns a promise
function ask(message) {
    // Create a promise object
    let promise = new Promise(function (resolve, reject) {
        // Create a div element for the dialog box
        let dialog = document.createElement("div");
        // Set some style properties for the dialog box
        dialog.style.position = "absolute";
        dialog.style.top = "50%";
        dialog.style.left = "50%";
        dialog.style.transform = "translate(-50%, -50%)";
        dialog.style.backgroundColor = "black";
        dialog.style.border = "1px solid black";
        dialog.style.padding = "10px";
        dialog.style.zIndex = "999";
        dialog.style.border = "2px solid red"
        // Create a p element for the message
        let p = document.createElement("p");
        // Set the text content of the p element to the message
        p.textContent = message;
        // Append the p element to the dialog box
        dialog.appendChild(p);
        // Create a button element for the cancel option
        let cancel = document.createElement("button");
        // Set the text content of the button to "Cancel"
        cancel.textContent = "Cancel";
        // Add an event listener to the button that removes the dialog box and resolves the promise with false
        cancel.addEventListener("click", function () {
            // Remove the dialog box from the document body
            document.body.removeChild(dialog);
            // Resolve the promise with false
            resolve(false);
        });
        // Append the button to the dialog box
        dialog.appendChild(cancel);
        // Create a button element for the confirm option
        let confirm = document.createElement("button");
        // Set the text content of the button to "Confirm"
        confirm.textContent = "Confirm";
        // Add an event listener to the button that removes the dialog box and resolves the promise with true
        confirm.addEventListener("click", function () {
            // Remove the dialog box from the document body
            document.body.removeChild(dialog);
            // Resolve the promise with true
            resolve(true);
        });
        // Append the button to the dialog box
        dialog.appendChild(confirm);
        // Append the dialog box to the document body
        document.body.appendChild(dialog);
    });
    // Return the promise object
    return promise;
};

async function respond(outcome) {
    var ogtxt = outcome;
    outcome = outcome.toLowerCase();

    if (outcome.includes("hiyori") && outcome.length < 7 == true) {
        console.log('keyword "hiyori" found');
        var responses = [];
        responses[1] = "Hey there.";
        responses[2] = "Hi!"
        responses[3] = "What's up?"
        responses[4] = "How's it going?"
        say(responses[1 + Math.floor(Math.random() * 4)]);
        return;
    };

    if (outcome.includes("exit") && outcome.length < 12 == true) {
        console.log('keyword "exit" found');
        say("I'll try closing this window.");
        await sleep(1000);
        window.close();
        await sleep(1000);
        say("It doesn't seem to be working.");
        return;
    };


    if (outcome.includes("time") && outcome.includes("what") == true) {
        console.log('keywords "time" & "what" found');
        var d = new Date();
        say('The time is... ' + d.toLocaleTimeString())

        return;
    };



    if (outcome.includes("directions ") && (outcome.includes(" to ") || outcome.includes("get ") == true)) {
        console.log('keywords "directions" & "to"/"get" found');
        var location = outcome.replace('directions', "");
        location = location.replace(' to ', " ");
        location = location.replace('get ', " ");
        say('getting directions to ' + location);
        ask('Do you want to open the external website "maps.google.com"?').then(async function (choice) {
            if (choice) {
                await sleep(300);
                window.open('https://www.google.com/maps/search/' + location);
                return;
            } else {
                say("Sorry, I can't access Google Maps right now.")
            };
            return;
        });
    };


    if (outcome.includes("help") && outcome.length < 15 == true) {
        console.log('command "help" entered');
        say("I can open apps, search for youtube video videos, get directions to places, solve basic math, and search with bing. I also know the time, can reload or exit this project, and close windows; that's all if you AREN'T connected to AI services");
        return;
    };


    if (outcome.includes("open") && outcome.length < 30 == true) {
        console.log('lets hope this app has a .com domain');
        var appname = outcome.replace('open', "");
        appname = appname.replace(/\s+/g, '')
        appname = appname.replace('.', "");
        if (appname.includes("settings")) { say('Opening settings.'); newwindow('./settings'); return; };

        if (appname.includes("calculator")) { say(`I'll open the calculator. If you want to solve an equation quickly, type "Solve" followed by your equation,`); newwindow('https://76836.github.io/webdesk/programs/calculator'); return; };
        ask('Do you want to open the external website "' + appname + '.com"?').then(async function (choice) {
            if (choice) {
                say('redirecting you to ' + appname + ".com");
                await sleep(300);
                window.open('https://' + appname + '.com');
                return;
            } else {
                var excuses = [];
                excuses[1] = `I couldn't open "` + appname + '", sorry.';
                excuses[2] = "I can't open that app.";
                excuses[3] = "Nothing I have access to matches your request.";
                say(excuses[1 + Math.floor(Math.random() * 3)]);
                return;
            };
        });
        return;
    };


    if ((outcome.includes("youtube") || outcome.includes(" play ") == true) && outcome.length < 33 == true) {
        console.log('keywords "youtube" & "search"/"play" found');
        var video = outcome.replace('youtube', "");
        video = video.replace('search', "");
        video = video.replace('play', "");
        video = video.replace(' on ', " ");
        video = video.replace(' for ', " ");
        say('looking for ' + video + " on YouTube");
        ask('Do you want to open the external website "YouTube.com"?').then(async function (choice) {
            if (choice) {
                window.open('https://youtube.com/search?q=' + video);
            }
        });
        return;
    };


    if (outcome.includes("destruct") && outcome.includes("self") && outcome.length < 30 == true) {
        console.log('the self destruct program has been launched');
        if (outcome.includes("1")) { say('self destruct launched, goodbye.'); } else { say('passcode incorrect'); return; };
        document.getElementById('html').innerHTML = '';
        console.clear()
        return;
    };


    return;


    if (outcome.includes("search ") == true && outcome.length < 33 == true && outcome.includes(" search") == false) {
        console.log('keyword "search" found.');
        var query = outcome.replace('search', "");
        query = query.replace(' for ', " ");
        say("searching for " + query);
        await sleep(300);
        newwindow('https://bing.com/search?q=' + query);
        return;
    };


    if (outcome.includes("re") && (outcome.includes("start") || outcome.includes("load") || outcome.includes("set") == true) && outcome.length < 8 == true) {
        console.log('Restart command recognized, restarting in 5 seconds...');
        say("Ok, I'll be back in just a few seconds.");
        await sleep(5000);
        window.location.reload();
        return;
    };
    if ((outcome.includes("close") == true) && outcome.length < 20 == true) {
        console.log('keyword "close" recognized.');
        say("Ok, I'll close the last window that I opened.");
        closewindow()
        return;
    }

    if (CloudAI == true) {
        typing("Hiyori");
        GenerateResponse(ogtxt);
    } else {
        console.log('no keywords found, too bad.');
        say('AI disconnected! ')
    };

};
