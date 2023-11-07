from gpt4all import GPT4All
import asyncio
import websockets

print('[ok] Preparing AI...')

model = GPT4All("gpt4all-falcon-q4_0.bin", allow_download=False)
system_template = '''Write detailed quick answers for any question. (Akari AI Server v1.0)'''
prompt_template = 'USER: {0}\nASSISTANT: '
def stop_on_token_callback(token_id, token_string):
    # one sentence is enough:
    if '\n' in token_string:
        return False
    else:
        return True


print('[ok] Server running.')

async def handle_websocket(websocket, path):
    try:
        while True:
            message = await websocket.recv()
            uprompt = message
            print(f"[in]Received message: {uprompt}")
            if (message == "test"):
                print('[ok] Testing...')
                response_message = f"Akari AI v1.0 connected"
            else:
                print('[ok] Generating response...')
                prompts = [uprompt]
                first_input = system_template + prompt_template.format(prompts[0])
                response_message = model.generate(first_input, temp=1, callback=stop_on_token_callback)
            await websocket.send(response_message)
            print(f"[out]Sent message: {response_message}")

    except websockets.exceptions.ConnectionClosed:
        print("[Error]WebSocket connection closed")

start_server = websockets.serve(handle_websocket, "localhost", 8765)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
