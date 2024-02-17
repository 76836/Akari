
function getGreetingByTime() {
    const currentHour = new Date().getHours();
    if (currentHour < 12) {
        return "Good morning!";
    } else if (currentHour < 18) {
        return "Good afternoon.";
    } else {
        return "Good evening.";
    };
};
function getResponseByDayOfWeek() {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayOfWeek = new Date().getDay();
    const currentDay = daysOfWeek[currentDayOfWeek];
    switch (currentDay) {
        case 'Monday':
            return " It's the start of a new week! What do you need?";
        case 'Tuesday':
            return " What do you want to do today?";
        case 'Wednesday':
            return " What can I do for you?";
        case 'Thursday':
            var currentHour = new Date().getHours();
            if (currentHour > 13) {
                qreplied = false;
                return " Did you eat a good lunch yet?";
            } else {
                qreplied = false;
                return " Did you sleep well?"
            };
        case 'Friday':
            qreplied = false;
            return " Ready for the weekend?";
        case 'Saturday':
            qreplied = false;
            return " Enjoy the weekend!";
        case 'Sunday':
            var currentHour = new Date().getHours();
            if (currentHour > 12) {
                qreplied = false;
                return " How was church?";
            } else {
                qreplied = false;
                return " Have fun at church!"
            };
        default:
            return " How can I assist you today?";
    }
};


function ArrayInString(textArray, inputString) {
    // Convert the input string to lowercase for case-insensitive matching
    const lowerCaseInput = inputString.toLowerCase();
    // Check if any text entry in the array is present in the input string
    return textArray.some(text => lowerCaseInput.includes(text.toLowerCase()));
}

// This function creates a dialog box with a message and returns a promise
function ask(message) {
    // Create a promise object
    let promise = new Promise(function (resolve, reject) {
        // Create a div element for the dialog box
        let dialog = document.createElement("div");
        // Set some style properties for the dialog box
        dialog.style.position = "fixed";
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


function solve(mathExpression) {
    // Convert numbers in words to actual numbers
    const wordsToNumbers = {
        zero: 0,
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10,
    };

    // Convert English operation words to JS symbols
    const wordsToSymbols = {
        plus: '+',
        minus: '-',
        times: '*',
        'divided by': '/',
        'multiplied by': '*',
    };

    // Replace words with numbers and operation symbols
    const expressionWithNumbersAndSymbols = mathExpression.replace(
        /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|plus|minus|times|divided)\b/gi,
        match => wordsToNumbers[match.toLowerCase()] !== undefined ? wordsToNumbers[match.toLowerCase()] : wordsToSymbols[match.toLowerCase()]
    );

    try {
        // Create a function from the expression and execute it
        const result = new Function(`return ${expressionWithNumbersAndSymbols}`)();
        return result.toString();
    } catch (error) {
        console.error('Error evaluating expression:', error);
        return 'Error';
    }
}
var qreplied = true;
async function respond(outcome) {
    var ogtxt = outcome;
    outcome = outcome.toLowerCase();

    if (outcome.includes("akari") && outcome.length < 7 == true) {
        console.log('keyword "akari" found');
        var responses = [];
        responses[1] = "That's me.";
        responses[2] = "Hi! What can I do for you?"
        responses[3] = "What's up?"
        responses[4] = "What do you need?"
        say(responses[1 + Math.floor(Math.random() * 4)]);
        return;
    };

    if (outcome.includes("exit") && outcome.length < 12 == true) {
        console.log('keyword "exit" found');
        say("I'll try to close this window...");
        await sleep(1000);
        window.close();
        await sleep(1000);
        say("Sorry, I don't think I'm able to close this window.");
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

    const YesSynonyms = new Array("good", "i did", "i will", "yeah", "great", "yes");
    if (ArrayInString(YesSynonyms, outcome) && (qreplied == false) == true) {
            var qfinalize = [];
            qfinalize[1] = "That's good.";
            qfinalize[2] = "Awesome!";
            qfinalize[3] = "I'm happy to hear that!";
            say(qfinalize[1 + Math.floor(Math.random() * 3)]);
        qreplied = true;
        return;
    } else {
        qreplied = true;
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


    if (outcome.includes("youtube") || outcome.includes(" play ") == true) {
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
    if (outcome.includes("version") && outcome.length < 20 == true) {
        console.log('keword "version" found');
        say('Akari Framework 2.0... Live2D avatar compatability has been added, and now you can choose between multiple characters to chat with.');
        return;
    };
    
if (serverStatus != "connected") {
    if (outcome.includes("what") && outcome.includes("up") && outcome.length < 18 == true) {
        console.log('kewords "what" & "up" found');
        say('Akari Framework 2.0... Live2D avatar compatability has been added, and now you can choose between multiple characters to chat with.');
        return;
    };
    if (outcome.includes("hello there") && outcome.length < 19 == true) {
        console.log(' I will deal with this Jedi slime myself. \n   Your move.');
        say('General Kenobi. You are a bold one.');
        return;
    };
    if (outcome.includes("hey") || outcome.includes("hello") || outcome.includes("hi") && outcome.length < 10 == true) {
        console.log('keword "hello" or "hi" found.');
        if (outcome.includes("hello")) {
            say('Hello there.');
        } else {
            if (outcome.includes("hey") == true) {
                var mapg1 = "Hi!";
            } else {
                var mapg1 = getGreetingByTime()
            };

            say(mapg1 + getResponseByDayOfWeek());
        }
        return;
    };
};
    if (outcome.includes("search") == true) {
        console.log('keyword "search" found.');
        var query = outcome.replace('search', "");
        query = query.replace(' for ', " ");
        say("searching for " + query);
        await sleep(300);
        newwindow('https://bing.com/search?q=' + query);
        return;
    };

    if (outcome.includes("solve ")) {
        const mathExpression = outcome.replace("solve", "");
        say(solve(mathExpression));
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

    if (serverStatus == "connected") {
        typing("Akari AI");
        socket.send(ogtxt);
    } else {
        console.log('no keywords found, too bad.');
        var excuses = [];
        excuses[1] = "Sorry, I don't understand that command.";
        excuses[2] = "I don't know what to do, sorry about that.";
        excuses[3] = "I don't understand that command, maybe try rephrasing it?";
        excuses[4] = "Sorry, I don't understand that command.";
        excuses[5] = "Sorry, I don't understand what you said.";
        excuses[6] = "I don't know what to do, sorry.";
        excuses[7] = "I don't know what to do, sorry about that.";
        excuses[8] = "I don't understand the command, maybe try rephrasing it?";
        say(excuses[1 + Math.floor(Math.random() * 8)]);
    };

};
