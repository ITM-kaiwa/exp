/**
 * TTS & STT Gemini Chat Web Application
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const chatWindow = document.getElementById('chat-window');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const micBtn = document.getElementById('mic-btn');
  const welcomeCard = document.getElementById('welcome-card');
  
  const ttsSelect = document.getElementById('tts-model-select');
  const ttsBadge = document.getElementById('tts-model-badge');
  
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const resetKeyBtn = document.getElementById('reset-key-btn');
  const sttStatusBar = document.getElementById('stt-status-bar');

  // Application State
  let apiKey = localStorage.getItem('google_api_key') || '';
  let selectedTtsModel = ttsSelect.value;
  let recognition = null;
  let isRecording = false;

  // Global Audio Manager (Prevents double playback & handles stop/play)
  let currentAudio = null;
  let currentActivePlayBtn = null;
  let audioCache = new Map(); // Stores audio Base64 by message ID

  // 1. Initial API Key & UI Setup
  updateApiKeyStatusUI();

  // TTS Model selection listener
  ttsSelect.addEventListener('change', (e) => {
    selectedTtsModel = e.target.value;
    ttsBadge.textContent = selectedTtsModel;
  });

  // API Key Reset Listener
  resetKeyBtn.addEventListener('click', () => {
    if (confirm('保存されているGoogle API Keyを削除しますか？')) {
      localStorage.removeItem('google_api_key');
      apiKey = '';
      updateApiKeyStatusUI();
      addSystemMessage('Google API Keyがリセットされました。新しいAPI Keyを入力してください。');
    }
  });

  function updateApiKeyStatusUI() {
    if (apiKey) {
      statusDot.classList.remove('unconfigured');
      statusDot.classList.add('configured');
      statusText.textContent = 'API Key: 設定済み';
      resetKeyBtn.classList.remove('hidden');
      if (welcomeCard) welcomeCard.classList.add('hidden');
    } else {
      statusDot.classList.remove('configured');
      statusDot.classList.add('unconfigured');
      statusText.textContent = 'API Key: 未設定';
      resetKeyBtn.classList.add('hidden');
      if (welcomeCard) welcomeCard.classList.remove('hidden');
    }
  }

  // 2. Speech-To-Text (STT) Setup
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';

    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('recording');
      sttStatusBar.classList.remove('hidden');
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      chatInput.value = transcript;
    };

    recognition.onerror = (event) => {
      console.error('STT Error:', event.error);
      stopRecording();
      if (event.error !== 'no-speech') {
        addErrorMessage(`マイク音声認識エラー: ${event.error}`);
      }
    };

    recognition.onend = () => {
      stopRecording();
    };
  } else {
    micBtn.title = 'お使いのブラウザは音声認識(STT)に対応していません';
    micBtn.style.opacity = '0.5';
  }

  function toggleRecording() {
    if (!recognition) {
      alert('お使いのブラウザはWeb標準の音声認識(SpeechRecognition)に対応していません。Google Chromeなどをご使用ください。');
      return;
    }

    if (isRecording) {
      recognition.stop();
      stopRecording();
    } else {
      try {
        recognition.start();
      } catch (err) {
        console.error('Failed to start recognition:', err);
      }
    }
  }

  function stopRecording() {
    isRecording = false;
    micBtn.classList.remove('recording');
    sttStatusBar.classList.add('hidden');
  }

  micBtn.addEventListener('click', toggleRecording);

  // 3. Chat Logic & API Key Handler
  sendBtn.addEventListener('click', handleSend);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  async function handleSend() {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';

    // Step 1: If API key is not set yet (or user inputs an API key), treat submission as setting the API key!
    if (!apiKey || text.startsWith('AIzaSy') || (text.length > 30 && !text.includes(' '))) {
      // Validate or save API Key
      apiKey = text;
      localStorage.setItem('google_api_key', apiKey);
      updateApiKeyStatusUI();

      addUserMessage(maskApiKey(text));
      addSystemMessage('✅ Google API Keyが設定されました！チャットや音声合成(TTS)をご利用いただけます。');
      return;
    }

    // Step 2: Normal user chat message
    addUserMessage(text);

    // Show AI loading bubble
    const aiMessageId = 'ai-' + Date.now();
    const aiBubbleWrapper = createAiBubbleContainer(aiMessageId);
    chatWindow.appendChild(aiBubbleWrapper);
    scrollToBottom();

    // Call Gemini API via /api/chat (or fallback client REST)
    try {
      const responseText = await fetchGeminiChat(text);
      
      // Update AI message text
      const contentEl = aiBubbleWrapper.querySelector('.chat-bubble-content');
      contentEl.textContent = responseText;

      // Automatically synthesize & play TTS for this AI message using currently selected model
      synthesizeAndPlayTts(responseText, aiMessageId, aiBubbleWrapper);
    } catch (err) {
      console.error('Chat Error:', err);
      // Remove placeholder and show error bubble
      aiBubbleWrapper.remove();
      addErrorMessage(`AI応答エラー: ${err.message || err}`);
    }
  }

  function maskApiKey(key) {
    if (key.length <= 8) return '********';
    return key.slice(0, 4) + '...' + key.slice(-4);
  }

  // 4. API Calls (Gemini & Google Cloud TTS)
  async function fetchGeminiChat(prompt) {
    // Try Vercel Serverless Python Backend /api/chat
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, apiKey })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data.text;
    } catch (apiErr) {
      // Fallback: Direct client fetch to Gemini REST API
      const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const fbRes = await fetch(directUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      if (!fbRes.ok) {
        // Fallback to gemini-1.5-flash
        const fbUrl15 = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const fbRes15 = await fetch(fbUrl15, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (!fbRes15.ok) {
          const errBody = await fbRes15.json();
          throw new Error(errBody.error?.message || `Gemini API Error`);
        }
        const data15 = await fbRes15.json();
        return data15.candidates[0].content.parts[0].text;
      }
      const data = await fbRes.json();
      return data.candidates[0].content.parts[0].text;
    }
  }

  async function fetchGoogleCloudTts(text, model) {
    // Try Vercel Serverless Python Backend /api/tts
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model, apiKey })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data.audioContent;
    } catch (apiErr) {
      // Fallback: Direct client fetch to Google Cloud TTS REST API
      const langCode = model.startsWith('en-') ? 'en-US' : 'ja-JP';
      const directUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
      const directRes = await fetch(directUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: text },
          voice: { languageCode: langCode, name: model },
          audioConfig: { audioEncoding: 'MP3' }
        })
      });
      if (!directRes.ok) {
        const errBody = await directRes.json();
        throw new Error(errBody.error?.message || `TTS API Error`);
      }
      const data = await directRes.json();
      return data.audioContent;
    }
  }

  // 5. TTS Audio Synthesis & Playback Management
  async function synthesizeAndPlayTts(text, msgId, wrapperEl) {
    // Capture current target TTS model for this message
    const modelForThisMessage = selectedTtsModel;
    const controlsDiv = wrapperEl.querySelector('.audio-controls');
    const playBtn = wrapperEl.querySelector('.play-btn');

    playBtn.textContent = '⏳ 音声生成中...';

    try {
      const audioContent = await fetchGoogleCloudTts(text, modelForThisMessage);
      audioCache.set(msgId, audioContent);

      playBtn.innerHTML = `▶ 再生 (${modelForThisMessage.split('-').pop()})`;

      // Auto play generated audio
      playAudio(msgId, playBtn);
    } catch (err) {
      console.error('TTS Error:', err);
      playBtn.innerHTML = `⚠️ 音声生成失敗`;
      playBtn.style.opacity = '0.7';
      addErrorMessage(`TTS(音声合成)エラー [モデル: ${modelForThisMessage}]: ${err.message || err}`);
    }
  }

  /**
   * Play Audio Function with Double-Playback Prevention (Specification ⑤)
   */
  function playAudio(msgId, playBtn) {
    const audioBase64 = audioCache.get(msgId);
    if (!audioBase64) return;

    // Rule ⑤: Double click / repeated click stops playback
    if (currentAudio && !currentAudio.paused) {
      const isSameBtn = (currentActivePlayBtn === playBtn);
      stopCurrentAudio();
      
      // If user clicked the SAME play button while playing, just stop it and return!
      if (isSameBtn) {
        return;
      }
    }

    // Initialize HTML5 Audio
    currentAudio = new Audio('data:audio/mp3;base64,' + audioBase64);
    currentActivePlayBtn = playBtn;

    playBtn.classList.add('playing');
    playBtn.innerHTML = '⏸ 停止中';

    currentAudio.play().catch(err => {
      console.error('Audio play error:', err);
      stopCurrentAudio();
    });

    currentAudio.onended = () => {
      resetPlayBtnState(playBtn);
      currentAudio = null;
      currentActivePlayBtn = null;
    };
  }

  function stopCurrentAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      if (currentActivePlayBtn) {
        resetPlayBtnState(currentActivePlayBtn);
      }
      currentAudio = null;
      currentActivePlayBtn = null;
    }
  }

  function resetPlayBtnState(btn) {
    btn.classList.remove('playing');
    btn.innerHTML = `▶ 再生`;
  }

  // 6. UI Render Helpers
  function addUserMessage(text) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-bubble-wrapper user';
    wrapper.innerHTML = `
      <span class="bubble-sender-name">あなた</span>
      <div class="chat-bubble">${escapeHtml(text)}</div>
    `;
    chatWindow.appendChild(wrapper);
    scrollToBottom();
  }

  function createAiBubbleContainer(msgId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-bubble-wrapper ai';
    wrapper.id = msgId;
    wrapper.innerHTML = `
      <span class="bubble-sender-name">Gemini AI</span>
      <div class="chat-bubble">
        <div class="chat-bubble-content">思考中...</div>
        <div class="audio-controls">
          <button class="audio-btn play-btn" id="play-${msgId}">▶ 再生</button>
          <button class="audio-btn stop-btn" id="stop-${msgId}">■ 停止</button>
        </div>
      </div>
    `;

    // Attach Play & Stop button event handlers immediately
    const playBtn = wrapper.querySelector('.play-btn');
    const stopBtn = wrapper.querySelector('.stop-btn');

    playBtn.addEventListener('click', () => {
      playAudio(msgId, playBtn);
    });

    stopBtn.addEventListener('click', () => {
      stopCurrentAudio();
    });

    return wrapper;
  }

  function addSystemMessage(text) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-bubble-wrapper system';
    wrapper.innerHTML = `
      <div class="chat-bubble">${escapeHtml(text)}</div>
    `;
    chatWindow.appendChild(wrapper);
    scrollToBottom();
  }

  function addErrorMessage(text) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-bubble-wrapper error';
    wrapper.innerHTML = `
      <span class="bubble-sender-name">エラー発生</span>
      <div class="chat-bubble">${escapeHtml(text)}</div>
    `;
    chatWindow.appendChild(wrapper);
    scrollToBottom();
  }

  function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (m) => {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }
});
