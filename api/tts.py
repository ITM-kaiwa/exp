import os
import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        self._send_json({'status': 'Google Cloud TTS API is running'}, 200)

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)

        try:
            body = json.loads(post_data.decode('utf-8'))
        except Exception:
            body = {}

        text = body.get('text', '')
        model_name = body.get('model', 'ja-JP-Neural2-B')
        api_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY') or body.get('apiKey', '')

        if not api_key:
            self._send_json({'error': 'Google API Keyが設定されていません。Vercel環境変数(GEMINI_API_KEY / GOOGLE_API_KEY)を設定するか、入力してください。'}, 400)
            return

        if not text:
            self._send_json({'error': 'TTS対象のテキストが空です。'}, 400)
            return

        url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}"
        lang_code = "en-US" if model_name.startswith("en-") else "ja-JP"
        payload = {
            "input": {"text": text},
            "voice": {"languageCode": lang_code, "name": model_name},
            "audioConfig": {"audioEncoding": "MP3"}
        }

        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})

        try:
            with urllib.request.urlopen(req) as response:
                res_body = json.loads(response.read().decode('utf-8'))
                audio_content = res_body.get('audioContent', '')
                self._send_json({'audioContent': audio_content}, 200)
        except urllib.error.HTTPError as e:
            err_data = e.read().decode('utf-8')
            self._send_json({'error': f"Google Cloud TTS API エラー ({e.code}): {err_data}"}, e.code)
        except Exception as e:
            self._send_json({'error': f"TTSエラー: {str(e)}"}, 500)

    def _send_json(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
