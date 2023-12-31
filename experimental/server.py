from gpt4all import GPT4All
import asyncio
import websockets
import datetime

print(r'''
 $$$$$$\  $$\                          $$\        $$$$$$\  $$$$$$\ 
$$  __$$\ $$ |                         \__|      $$  __$$\ \_$$  _|
$$ /  $$ |$$ |  $$\ $$$$$$\   $$$$$$\  $$\       $$ /  $$ |  $$ |  
$$$$$$$$ |$$ | $$  |\____$$\ $$  __$$\ $$ |      $$$$$$$$ |  $$ |  
$$  __$$ |$$$$$$  / $$$$$$$ |$$ |  \__|$$ |      $$  __$$ |  $$ |  
$$ |  $$ |$$  _$$< $$  __$$ |$$ |      $$ |      $$ |  $$ |  $$ |  
$$ |  $$ |$$ | \$$\\$$$$$$$ |$$ |      $$ |      $$ |  $$ |$$$$$$\ 
\__|  \__|\__|  \__|\_______|\__|      \__|      \__|  \__|\______|
                                                                   
                                                                   
''')

print('Akari AI Server v1.2b\nhttps://github.com/76836/Akari')

print('[ok]Preparing AI...')

model = GPT4All("gpt4all-falcon-q4_0.gguf", allow_download=True)
prompt_template = 'USER: {0}\nAKARI: '
tokens_added = ""

print('[ok]Server running.')

async def handle_websocket(websocket, path):
    try:
        while True:
            message = await websocket.recv()
            uprompt = message
            print(f"[in]Received message: {uprompt}")
            if (message == "test"):
                print('\n[ok]Testing connection.\n')
                response = f"Akari AI v1.2b connected"
            else:
                prompts = [uprompt]
                current_time = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d %H:%M:%S")
                print('[ok]Generating response... ('+current_time+')')
                system_template = '''You are Akari Crimson AI, you have a kind, joking personality. Write detailed quick answers for any question. Give one answer at a time.
(Akari AI Server v1.2b, system time:'''+current_time+''')'''
                first_input = system_template + prompt_template.format(prompts[0])
                def stop_on_token_callback(token_id, token_string):
                    global tokens_added
                    tokens_added = tokens_added + token_string
                    if "USER:" in tokens_added:
                        print('[ok]Generation stopped.')
                        tokens_added =''
                        return False
                    # If the string is not found, continue generating tokens
                    return True
                response = model.generate(first_input, max_tokens=512, temp=0.7, top_k=40, top_p=0.4, repeat_penalty=1.99, repeat_last_n=512, n_batch=8, n_predict=None, callback=stop_on_token_callback)
                response = response.replace('USER:', '')
            await websocket.send(response)
            tokens_added = ''
            print(f"[out]Sent message: {response}")

    except websockets.exceptions.ConnectionClosed:
        print("\n[Error]WebSocket connection closed\n")

start_server = websockets.serve(handle_websocket, "localhost", 8765)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
