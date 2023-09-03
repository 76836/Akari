async function respond(outcome) {

    outcome = outcome.toLowerCase();
    outcome = outcome.replace('akari', "");
    outcome = outcome.replace(' enter command.', "");
    outcome = outcome.replace('enter command', "");

    if (outcome.includes("exit ") && outcome.length < 12 == true) {
        console.log('keyword "exit" found');
        speak('goodbye');
        await sleep(1000);
        window.close()

        return;
    };


    if (outcome.includes("time") && outcome.includes("what") == true) {
        console.log('keywords "time" & "what" found');
        var d = new Date();
        speak('The time is... ' + d.toLocaleTimeString())

        return;
    };


    if (outcome.includes("directions ") && (outcome.includes(" to ") || outcome.includes("get ") == true)) {
        console.log('keywords "directions" & "to"/"get" found');
        var location = outcome.replace('directions', "");
        location = location.replace(' to ', " ");
        location = location.replace('get ', " ");
        speak('getting directions to ' + location);
        //window.location.href='https://www.google.com/maps/search/'+outcome ;
        return;
    };


    if (outcome.includes("help") && outcome.length < 15 == true) {
        console.log('command "help" entered');
        speak('here is a list of commands to try: open app redirects you to appname.com. play youtube video.  whats the time. get directions to location. exit. help.  or, search.');
        return;
    };


    if (outcome.includes("open") && outcome.length < 20 == true) {
        console.log('lets hope this app has a .com domain');
        var appname = outcome.replace('open', "");
        appname = appname.replace(/\s+/g, '')
        appname = appname.replace('.', "");
        if (appname.includes("settings")) { speak('opening Akari settings'); window.location.href = './settings'; return; };
        speak('redirecting you to ' + appname + ".com");
        await sleep(300);
        window.location.href = 'https://' + appname + '.com';
        return;
    };


    if (outcome.includes("youtube") || outcome.includes(" play ") == true) {
        console.log('keywords "youtube" & "search"/"play" found');
        var video = outcome.replace('youtube', "");
        video = video.replace('search', "");
        video = video.replace('play', "");
        video = video.replace(' on ', " ");
        video = video.replace(' for ', " ");
        speak('looking for ' + video + " on YouTube");
        window.location.href = 'https://youtube.com/search?q=' + video;
        return;
    };


    if (outcome.includes("destruct") && outcome.includes("self") && outcome.length < 30 == true) {
        console.log('the self destruct program has been launched');
        if (outcome.includes("1")) { speak('self destruct launched, goodbye.'); } else { speak('passcode incorrect'); return; };
        //The pasword is actually 1234, but i'm not gonna add the code to check for the full thing.
        document.getElementById('html').innerHTML = '';
        console.clear()
        return;
    };


    if (outcome.includes("what") && outcome.includes("up") && outcome.length < 18 == true) {
        console.log('kewords "what" & "up" found');
        speak('version 1.6... now you can say my name at any time to talk to me');
        return;
    };


    if (outcome.includes("hello there") && outcome.length < 19 == true) {
        console.log(' I will deal with this Jedi slime myself. \n   Your move.');
        speak('General Kenobi. You are a bold one.');

        return;
    };

    if (outcome.includes("hello") || outcome.includes("hi") && outcome.length < 10 == true) {
        console.log('keword "hello" or "hi" found.');
        if (outcome.includes("hi")) {
            speak('Hello there.');
        }else{
            speak('Hi!');
        }
        

        return;
    };

    if (outcome.includes("search") == true) {
        console.log('keyword "search" found.');
        var query = outcome.replace('search', "");
        query = query.replace(' for ', " ");
        speak("searching for " + query);
        await sleep(300);
        window.location.href='https://bing.com/search?q='+query;
        return;
    };

    console.log('no keywords found, too bad.');
    speak("Sorry, I don't understand that command.");

};
