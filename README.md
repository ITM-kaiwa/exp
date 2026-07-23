# TTS & STT Minimum Testing Web Application

Google Gemini AI, Google Cloud Text-To-Speech (TTS), Web Speech API (STT) をテストするためのミニマム環境 Web アプリケーションです。

## 🌟 主な機能

1. **Google API Key 設定**:
   - アプリ起動後、チャット入力欄に Google API Key を入力して「送信」ボタンを押すことで登録できます。
   - API Key はブラウザの `localStorage` に保存されます。
2. **Text-To-Speech (TTS)**:
   - Google Cloud Text-to-Speech を使用して AI の返答テキストを音声合成・自動再生します。
   - ヘッダのドロップダウンリストから音声モデル（Neural2, Wavenet, Standard, Chirp HD 等）を自由に選択可能です。
   - 発話途中でモデルを変更した場合、次の AI メッセージから新しいモデルが適用されます。
   - チャットバブル内に「再生」「停止」ボタンを設置。重複再生防止機能を備えています。
3. **Speech-To-Text (STT)**:
   - Web ブラウザ標準の SpeechRecognition API を使用。
   - フッタのマイクボタンを押すと音声入力が開始され、リアルタイムにテキスト変換されます。
4. **デザイン & UI エフェクト**:
   - ユーザーのチャットバブル：**緑色** (`#10b981`)
   - AI のチャットバブル：**青色** (`#3b82f6`)
   - エラーメッセージ：**赤色** (`#ef4444`)
   - 全ボタンにマウスホバー時の色変化およびクリック時の沈み込み (Active 3D Press) エフェクトを実装。

## 🚀 デプロイ手順 (Vercel & GitHub)

1. このリポジトリ (`https://github.com/ITM-kaiwa/exp`) を GitHub にプッシュします。
2. [Vercel](https://vercel.com) にログインし、`exp` リポジトリをインポートします。
3. デプロイ設定で Framework Preset を `Other` または `Vercel` にして Deploy ボタンを押します。
4. デプロイ完了後、提供される URL にアクセスしてご利用いただけます。

## 📂 ディレクトリ構成

- `index.html`: アプリケーションの画面構造
- `style.css`: スタイル定義（グラスモフィズム、バブル色、沈み込みエフェクト）
- `app.js`: STT, TTS再生制御, Geminiチャットロジック
- `api/chat.py`: Gemini APIを呼び出す Vercel Serverless Function
- `api/tts.py`: Google Cloud TTS APIを呼び出す Vercel Serverless Function
- `vercel.json`: Vercel ルーティング設定
