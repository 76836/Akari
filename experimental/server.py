from gpt4all import GPT4All
import asyncio
import websockets
import datetime

print('Akari AI Server v1.1\n')

print('[ok] Preparing AI...')

model = GPT4All("gpt4all-falcon-q4_0.bin", allow_download=False)
prompt_template = 'USER: {0}\nASSISTANT: '


print('[ok] Server running.')

async def handle_websocket(websocket, path):
    try:
        while True:
            message = await websocket.recv()
            uprompt = message
            print(f"[in]Received message: {uprompt}")
            if (message == "test"):
                print('\n[ok]Testing...\n')
                response_message = f"Akari AI v1.1 connected"
            else:
                print('[ok] Generating response...')
                prompts = [uprompt]
                current_time = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                system_template = '''You are Akari Crimson AI, you have a kind, joking personality. Write detailed quick answers for any question. Give one answer at a time.
(Akari AI Server v1.1, system time:'''+current_time+''')'''
                first_input = system_template + prompt_template.format(prompts[0])
                response_message = model.generate(first_input, max_tokens=512, temp=0.7, top_k=40, top_p=0.4, repeat_penalty=1.99, repeat_last_n=512, n_batch=8, n_predict=None, streaming=False,)
            await websocket.send(response_message)
            print(f"[out]Sent message: {response_message}")

    except websockets.exceptions.ConnectionClosed:
        print("[Error]WebSocket connection closed")

start_server = websockets.serve(handle_websocket, "localhost", 8765)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
