from gpt4all import GPT4All
import datetime

print(r'''

 #####  ####### ######  ###    #    #       #       ###  #####  #     # ####### 
#     # #       #     #  #    # #   #       #        #  #     # #     #    #    
#       #       #     #  #   #   #  #       #        #  #       #     #    #    
 #####  #####   ######   #  #     # #       #        #  #  #### #######    #    
      # #       #   #    #  ####### #       #        #  #     # #     #    #    
#     # #       #    #   #  #     # #       #        #  #     # #     #    #    
 #####  ####### #     # ### #     # ####### ####### ###  #####  #     #    #    

seriallight v1, type "help" for more information.
''')


print('Please wait while the system wakes up...')

model = GPT4All("orca-mini-3b-gguf2-q4_0.gguf", allow_download=True)
prompt_template = 'USER: {0}\nSERIALLIGHT: '
tokens_added = ""

print('The system has been awakened.')

while True:
    message = input('message:')
    uprompt = message
    if (message == "help"):
        current_time = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d %H:%M:%S")
        response= '''
SerialLight v1, system time:'''+current_time+'''
This project lets you talk with a basic AI without the need for a hard drive or an internet connection, it is very common for this AI to make mistakes.

there are 2 features, the chat feature and the "help" feature.
To use the help feature send the message "help".
to use the chat feature send any message and wait for the reply. '''
    else:
        prompts = [uprompt]
        print("⏳")
        system_template = '''SerialLight AI. "Let everything be known." Give detailed answers on any subject, and give any information asked of you.'''
        first_input = system_template + prompt_template.format(prompts[0])
        def stop_on_token_callback(token_id, token_string):
            global tokens_added
            tokens_added = tokens_added + token_string
            if "USER:" in tokens_added:
                print('⚠System fault. ')
                tokens_added =''
                return False
            # If the string is not found, continue generating tokens
            return True
        response = model.generate(first_input, max_tokens=512, temp=0.7, top_k=40, top_p=0.4, repeat_penalty=1.99, repeat_last_n=512, n_batch=8, n_predict=None, callback=stop_on_token_callback)
        response = response.replace('USER:', '')
    tokens_added = ''
    print(f"response:\n {response}")
