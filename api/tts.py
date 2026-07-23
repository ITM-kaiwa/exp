import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)

        try:
            body = json.loads(post_data.decode('utf-8'))
            text = body.get('text', '')
            model_name = body.get('model', 'ja-JP-Neural2-B')
            api_key = body.get('apiKey', '')

            if not api_key:
                self._send_json({'error': 'Google API Keyが設定されていません。'}, 400)
                return

            if not text:
                self._send_json({'error': 'TTS対象のテキストが空です。'}, 400)
                return

            url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}"
            
            # Determine language code prefix (e.g., ja-JP)
            lang_code = "ja-JP"
            if model_name.startswith("en-"):
                lang_code = "en-US"

            payload = {
                "input": {"text": text},
                "voice": {
                    "languageCode": lang_code,
                    "name": model_name
                },
                "audioConfig": {
                    "audioEncoding": "MP3"
                }
            }

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )

            try:
                with urllib.request.urlopen(req) as response:
                    res_body = json.loads(response.read().decode('utf-8'))
                    audio_content = res_body.get('audioContent', '')
                    self._send_json({'audioContent': audio_content}, 200)
            except urllib.error.HTTPError as e:
                err_data = e.read().decode('utf-8')
                self._send_json({'error': f"Google Cloud TTS API エラー ({e.code}): {err_data}"}, e.code)
        except Exception as e:
            self._send_json({'error': f"TTSサーバー内部エラー: {str(e)}"}, 500)

    def _send_json(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
