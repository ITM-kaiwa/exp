import os
import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

# Optional imports for Google OAuth2 Service Account support
try:
    from google.oauth2 import service_account
    import google.auth.transport.requests
    HAS_GOOGLE_AUTH = True
except ImportError:
    HAS_GOOGLE_AUTH = False

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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
        oauth_token = os.environ.get('GOOGLE_OAUTH_TOKEN') or os.environ.get('GCP_ACCESS_TOKEN') or body.get('oauthToken', '')
        sa_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON') or os.environ.get('GCP_SERVICE_ACCOUNT_JSON') or body.get('serviceAccountJson', '')

        if not text:
            self._send_json({'error': 'TTS対象のテキストが空です。'}, 400)
            return

        headers = {'Content-Type': 'application/json'}
        url = "https://texttospeech.googleapis.com/v1/text:synthesize"

        # 1. Try OAuth2 Bearer Token from Environment Variable / Request if available
        if oauth_token:
            headers['Authorization'] = f"Bearer {oauth_token}"
        # 2. Try Service Account JSON to generate OAuth2 Access Token
        elif sa_json and HAS_GOOGLE_AUTH:
            try:
                info = json.loads(sa_json) if isinstance(sa_json, str) else sa_json
                credentials = service_account.Credentials.from_service_account_info(
                    info,
                    scopes=['https://www.googleapis.com/auth/cloud-platform']
                )
                req_auth = google.auth.transport.requests.Request()
                credentials.refresh(req_auth)
                headers['Authorization'] = f"Bearer {credentials.token}"
            except Exception as sa_err:
                print(f"Service Account Auth Error: {sa_err}")
                if api_key:
                    url = f"{url}?key={api_key}"
        # 3. Fall back to API Key if set
        elif api_key:
            url = f"{url}?key={api_key}"
        else:
            self._send_json({
                'fallbackToBrowserTts': True,
                'text': text,
                'notice': 'API Key/OAuth2 Tokenが未設定のため、ブラウザ標準TTSエンジンを使用します。'
            }, 200)
            return

        lang_code = "en-US" if model_name.startswith("en-") else "ja-JP"
        payload = {
            "input": {"text": text},
            "voice": {"languageCode": lang_code, "name": model_name},
            "audioConfig": {"audioEncoding": "MP3"}
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers=headers
        )

        try:
            with urllib.request.urlopen(req) as response:
                res_body = json.loads(response.read().decode('utf-8'))
                audio_content = res_body.get('audioContent', '')
                self._send_json({'audioContent': audio_content}, 200)
        except urllib.error.HTTPError as e:
            # Handle 401 / 403 API key authentication restrictions by falling back gracefully to Browser Speech Synthesis
            if e.code in (401, 403):
                self._send_json({
                    'fallbackToBrowserTts': True,
                    'text': text,
                    'notice': f'Google Cloud TTS 認証制限({e.code})のため、ブラウザ音声合成(Web Speech TTS)へフォールバックしました。OAuth2アクセスキーまたはサービスアカウントをVercel環境変数に設定するとGoogle Cloud TTSが利用できます。'
                }, 200)
                return
            err_data = e.read().decode('utf-8')
            self._send_json({'error': f"Google Cloud TTS API エラー ({e.code}): {err_data}"}, e.code)
        except Exception as e:
            self._send_json({
                'fallbackToBrowserTts': True,
                'text': text,
                'notice': f'TTS例外({str(e)})のため、ブラウザ音声合成へフォールバックしました。'
            }, 200)

    def _send_json(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
