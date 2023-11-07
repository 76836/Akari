
var textOnly = 'text';
var serverStatus = "disconnected";
const socket = new WebSocket("ws://localhost:8765");

socket.onmessage = function (event) {
  console.log("[OK]Received from server:", event.data);
  say(event.data);
};

socket.onopen = function (event) {
  console.log("[OK]Connected to WebSocket server.");
  serverStatus = "connected";
  // Send a message to the server
  socket.send("test");
};

// Close the connection after 10 seconds
/*setTimeout(function () {
  socket.close();
}, 10000);
*/



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

  outcome = outcome.replace('hey akari', "");
  outcome = outcome.replace('akari', "");
  outcome = outcome.replace(' enter command.', "");
  outcome = outcome.replace('enter command', "");

  if (outcome.includes("exit") && outcome.length < 12 == true) {
      console.log('keyword "exit" found');
      say("I'll try to close this window...");
      await sleep(1000);
      window.close()
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
      window.open('https://www.google.com/maps/search/' + location);
      return;
  };


  if (outcome.includes("help") && outcome.length < 15 == true) {
      console.log('command "help" entered');
      say('here is a list of commands to try: open app redirects you to appname.com. play youtube video.  whats the time. get directions to location. what is 1+1/2. exit. help. reload. close pop-up window.  or, search.');
      return;
  };


  if (outcome.includes("open") && outcome.length < 20 == true) {
      console.log('lets hope this app has a .com domain');
      var appname = outcome.replace('open', "");
      appname = appname.replace(/\s+/g, '')
      appname = appname.replace('.', "");
      if (appname.includes("settings")) { say('opening Akari settings'); newwindow('./settings'); return; };
      say('redirecting you to ' + appname + ".com");
      await sleep(300);
      window.open('https://' + appname + '.com');
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
      window.open('https://youtube.com/search?q=' + video);
      return;
  };


  if (outcome.includes("destruct") && outcome.includes("self") && outcome.length < 30 == true) {
      console.log('the self destruct program has been launched');
      if (outcome.includes("1")) { say('self destruct launched, goodbye.'); } else { say('passcode incorrect'); return; };
      document.getElementById('html').innerHTML = '';
      console.clear()
      return;
  };


  if (outcome.includes("what") && outcome.includes("up") && outcome.length < 18 == true) {
      console.log('kewords "what" & "up" found');
      say('version 1.8... New JavaScript lets people embed my code into their projects. The window function allows people to use features like search and settings without leaving me. And now you can also ask me to restart at any time to fix issues, get new features, and clear the chat history.');
      return;
  };


  if (outcome.includes("hello there") && outcome.length < 19 == true) {
      console.log(' I will deal with this Jedi slime myself. \n   Your move.');
      say('General Kenobi. You are a bold one.');

      return;
  };

  if (outcome.includes("hello") || outcome.includes("hi") && outcome.length < 10 == true) {
      console.log('keword "hello" or "hi" found.');
      if (outcome.includes("hi")) {
          say('Hello there.');
      } else {
          say('Hi!');
      }


      return;
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

  if (outcome.includes("what is ")) {
      const mathExpression = outcome.replace("what is ", "");
      try {
          const result = eval(mathExpression);
          say(result);
      } catch (error) {
          say('Sorry, I was unable to calculate the given expression.')
      }
      return;
  };

  if (outcome.includes("re") && (outcome.includes("start") || outcome.includes("load") || outcome.includes("set") == true)) {
      console.log('Restart command recognized, restarting in 5 seconds...');
      say("Ok, I'll be back in just a few seconds.");
      await sleep(5000);
      window.location.reload();
      return;
  };
  if (outcome.includes("close") == true) {
      closewindow()
      console.log('keyword "close" recognized.');
      say("Ok, I'll close the pop-up window.");
      return;
  }

  if (serverStatus == "connected") {
    say('<b>Akari AI Loading...</b>')
    socket.send(ogtxt);
  }else{
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
