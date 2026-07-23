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
            prompt = body.get('prompt', '')
            api_key = body.get('apiKey', '')

            if not api_key:
                self._send_json({'error': 'Google API Keyが設定されていません。'}, 400)
                return

            if not prompt:
                self._send_json({'error': 'プロンプトが空です。'}, 400)
                return

            # Call Gemini API via REST
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt}
                        ]
                    }
                ]
            }

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )

            try:
                with urllib.request.urlopen(req) as response:
                    res_body = json.loads(response.read().decode('utf-8'))
                    text = res_body['candidates'][0]['content']['parts'][0]['text']
                    self._send_json({'text': text}, 200)
            except urllib.error.HTTPError as e:
                # Try fallback to gemini-1.5-flash if 2.5 is unavailable
                if e.code == 404:
                    url_fallback = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
                    req_fb = urllib.request.Request(
                        url_fallback,
                        data=json.dumps(payload).encode('utf-8'),
                        headers={'Content-Type': 'application/json'}
                    )
                    with urllib.request.urlopen(req_fb) as fb_resp:
                        res_body = json.loads(fb_resp.read().decode('utf-8'))
                        text = res_body['candidates'][0]['content']['parts'][0]['text']
                        self._send_json({'text': text}, 200)
                        return
                err_data = e.read().decode('utf-8')
                self._send_json({'error': f"Gemini API エラー ({e.code}): {err_data}"}, e.code)
        except Exception as e:
            self._send_json({'error': f"サーバー内部エラー: {str(e)}"}, 500)

    def _send_json(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
