async function respond(outcome)
 {

outcome = outcome.toLowerCase();
  
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
            speak('The time is... '+d.toLocaleTimeString())
            
            return;
        };


  if (outcome.includes("directions") && (outcome.includes(" to ") || outcome.includes("get ") == true)) {
    console.log('keywords "directions" & "to"/"get" found'); 
            var location = outcome.replace('directions',"");
            location = location.replace(' to '," ");
            location = location.replace('get '," ");
            speak('getting directions to '+ location);
            window.location.href='https://www.google.com/maps/search/'+outcome ;
            return;
        };


  if (outcome == "help") {
    console.log('command "help" entered');
            speak('here is a list of commands to try: open app redirects you to appname.com. play youtube video.  whats the time. get directions to location. exit. help.  or, ask a question for bing to answer.');
            return;
        };


        if (outcome.includes("open") && outcome.length < 20  == true) {
    console.log('lets hope this app has a .com domain'); 
            var appname = outcome.replace('open',"");
            appname = appname.replace(' ',"");
            if (appname.includes("settings")) {speak('the "open" function only supports apps that have a .com domain. Sorry.'); return;};
            speak('redirecting you to '+ appname + ".com");
            window.location.href='https://' + appname +'.com' ;
            return;
        };
  
  
  if (outcome.includes("youtube") || outcome.includes("play ") == true) {
    console.log('keywords "youtube" & "search"/"play" found'); 
            var video = outcome.replace('youtube',"");
            video = video.replace('search',"");
            video = video.replace('play',"");
            video = video.replace(' on '," ");
            video = video.replace(' for '," ");
            speak('looking for '+ video + " on YouTube");
            window.location.href='https://youtube.com/search?q='+video ;
            return;
        };

  
        if (outcome.includes("destruct") && outcome.includes("self") && outcome.length < 30 == true) {
        console.log('the self destruct program has been launched'); 
            if (outcome.includes("1")) {speak('self destruct launched, goodbye.');} else {speak('passcode incorrect'); return;};
            //The pasword is actually 1234, but i'm not gonna add the code to check for the full thing.
            document.getElementById('html').innerHTML='';
            console.clear()
            return;
        };


        if (outcome.includes("what") && outcome.includes(" up") && outcome.length < 15 == true) {
        console.log('kewords "what" & "up" found'); 
            speak('version 1.4... now you can change my voice.');
            return;
        };


  if (outcome == "hello there") {
    console.log(' I will deal with this Jedi slime myself. \n   Your move.');
            speak('General Kenobi. You are a bold one.');
            document.getElementById('GO').className='GoAkari';
            await sleep(200);
            document.getElementById('GO').className='listening';
            await sleep(200);
            document.getElementById('GO').className='GoAkari';
            await sleep(200);
            document.getElementById('GO').className='listening';
            await sleep(200);
            document.getElementById('GO').className='GoAkari';
            await sleep(200);
            document.getElementById('GO').className='listening';
            await sleep(200);
            document.getElementById('GO').className='GoAkari';
            await sleep(200);
            document.getElementById('GO').className='listening';
            await sleep(200);
            document.getElementById('GO').className='GoAkari';
            return;
        };



  console.log('no keywords found, starting internet search.');
  speak("searching for "+outcome);
  window.location.href='https://bing.com/search?q='+outcome ;

};
