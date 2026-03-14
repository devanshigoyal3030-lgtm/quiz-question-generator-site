import os
import json
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, HTTPServer

# Simple .env loader
def load_env():
    if os.path.exists('.env'):
        with open('.env', 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    os.environ[key.strip()] = val.strip()

load_env()

class RequestHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/generate':
            print("Received POST /api/generate")
            # Read fresh so it can be updated without restarting the server if we want
            load_env()
            print("Loaded env")
            GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
            
            if not GEMINI_API_KEY or GEMINI_API_KEY == 'YOUR_API_KEY_HERE':
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Gemini API Key is not configured in .env file."}).encode('utf-8'))
                return
            
            content_length = int(self.headers['Content-Length'])
            print(f"Reading {content_length} bytes...")
            post_data = self.rfile.read(content_length)
            print("Finished reading POST data.")
            
            try:
                data = json.loads(post_data)
                content = data.get('content', '')
                count = data.get('count', 5)
                is_image = data.get('isImage', False)
                
                # Construct Gemini API Request
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={GEMINI_API_KEY}"
                
                promptTemplate = f"""
You are an expert educator. Generate {count} high-quality questions based on the provided material.
Mix Multiple Choice Questions (MCQ) and True/False questions.
For MCQs, provide 4 options.
Ensure the questions are sensible, factual, and strictly related to the provided topic material.

You must respond ONLY with a valid JSON document matching the following schema. Do not include markdown codeblocks (```json) or any other text.
{{
    "questions": [
        {{
            "id": "q1",
            "type": "mcq",
            "questionText": "Question here",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctAnswerIndex": 0,
            "explanation": "Brief reasoning"
        }},
        {{
            "id": "q2",
            "type": "tf",
            "questionText": "Statement here",
            "options": ["True", "False"],
            "correctAnswerIndex": 1,
            "explanation": "Brief reasoning"
        }}
    ]
}}

Here is the material:
"""
                contentsData = []
                if is_image:
                    base64_data = content.split(',')[1] if ',' in content else content
                    mime_type = content.split(';')[0].split(':')[1] if ';' in content else 'image/png'
                    contentsData = [
                        {"text": promptTemplate},
                        {"inline_data": {"mime_type": mime_type, "data": base64_data}}
                    ]
                else:
                    contentsData = [
                        {"text": promptTemplate + "\n\n" + content}
                    ]
                
                payload = {
                    "contents": [{"parts": contentsData}],
                    "generationConfig": {
                        "temperature": 0.2,
                        "responseMimeType": "application/json"
                    }
                }
                
                req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'}, method='POST')
                try:
                    print("Making Gemini API call...")
                    with urllib.request.urlopen(req, timeout=30) as response:
                        print("Gemini API call returned!")
                        gemini_res = json.loads(response.read().decode('utf-8'))
                        text_res = gemini_res['candidates'][0]['content']['parts'][0]['text']
                        
                        if text_res.startswith('```json'):
                            text_res = text_res[7:]
                        if text_res.endswith('```'):
                            text_res = text_res[:-3]
                            
                        parsed_json = json.loads(text_res.strip())
                        
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps(parsed_json).encode('utf-8'))
                        
                except urllib.error.HTTPError as e:
                    error_msg = e.read().decode('utf-8')
                    print(f"Gemini API Error {e.code}: {error_msg}")
                    readable_msg = error_msg
                    try:
                        error_json = json.loads(error_msg)
                        if 'error' in error_json and 'message' in error_json['error']:
                            readable_msg = error_json['error']['message']
                    except:
                        pass
                    
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": f"Gemini API Error: {readable_msg}"}).encode('utf-8'))
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": f"Failed to parse Gemini response: {str(e)}"}).encode('utf-8'))
                    
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": f'Bad Request: {str(e)}'}).encode('utf-8'))
        else:
            # Handle standard static files
            super().do_POST()

if __name__ == '__main__':
    import os

port = int(os.environ.get("PORT", 10000))
server_address = ('', port)
httpd = HTTPServer(server_address, RequestHandler)

print(f"Starting API + Static server on port {port}...")
httpd.serve_forever()

