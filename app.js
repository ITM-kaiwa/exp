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
  let customApiKey = localStorage.getItem('google_api_key') || '';
  let selectedTtsModel = ttsSelect.value;
  let recognition = null;
  let isRecording = false;

  // Global Audio Manager (Prevents double playback & handles stop/play)
  let currentAudio = null;
  let currentUtterance = null;
  let currentActivePlayBtn = null;
  let audioCache = new Map(); // Stores audio Base64 or fallback object by message ID

  // Warm up SpeechSynthesis voices
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
  }

  // 1. Initial API Key & UI Setup
  updateApiKeyStatusUI();

  // TTS Model selection listener
  ttsSelect.addEventListener('change', (e) => {
    selectedTtsModel = e.target.value;
    ttsBadge.textContent = selectedTtsModel;
  });

  // API Key Reset Listener
  resetKeyBtn.addEventListener('click', () => {
    if (confirm('保存されているカスタム API Keyを削除しますか？ (Vercelの環境変数が代わりに使用されます)')) {
      localStorage.removeItem('google_api_key');
      customApiKey = '';
      updateApiKeyStatusUI();
      addSystemMessage('カスタム API Keyが削除されました。Vercel環境変数を使用します。');
    }
  });

  function updateApiKeyStatusUI() {
    if (customApiKey) {
      statusDot.classList.remove('unconfigured');
      statusDot.classList.add('configured');
      statusText.textContent = 'API Key: カスタムKey使用';
      resetKeyBtn.classList.remove('hidden');
    } else {
      statusDot.classList.remove('unconfigured');
      statusDot.classList.add('configured');
      statusText.textContent = 'API Key: Vercel環境変数';
      resetKeyBtn.classList.add('hidden');
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

  // 3. Chat Logic & Message Handler
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

    // Hide welcome card on first message
    if (welcomeCard) welcomeCard.classList.add('hidden');

    // Optional override: If user inputs an explicit API key string (starts with AIzaSy)
    if (text.startsWith('AIzaSy') || (text.length > 30 && text.startsWith('key-'))) {
      customApiKey = text;
      localStorage.setItem('google_api_key', customApiKey);
      updateApiKeyStatusUI();

      addUserMessage(maskApiKey(text));
      addSystemMessage('✅ カスタム Google API Keyが設定されました！');
      return;
    }

    // Normal user chat message
    addUserMessage(text);

    // Show AI loading bubble
    const aiMessageId = 'ai-' + Date.now();
    const aiBubbleWrapper = createAiBubbleContainer(aiMessageId);
    chatWindow.appendChild(aiBubbleWrapper);
    scrollToBottom();

    // Call Gemini API via /api/chat
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
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, apiKey: customApiKey })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data.text;
    } catch (apiErr) {
      if (customApiKey) {
        const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${customApiKey}`;
        const fbRes = await fetch(directUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });
        if (fbRes.ok) {
          const data = await fbRes.json();
          return data.candidates[0].content.parts[0].text;
        }
      }
      throw apiErr;
    }
  }

  async function fetchGoogleCloudTts(text, model) {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model, apiKey: customApiKey })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (data.fallbackToBrowserTts) {
        return { fallbackText: text, notice: data.notice };
      }
      return data.audioContent;
    } catch (apiErr) {
      // Automatic client fallback to Web Speech TTS on network/API failure
      return { fallbackText: text, notice: 'ブラウザ標準TTSエンジンに切り替えました。' };
    }
  }

  // 5. TTS Audio Synthesis & Playback Management
  async function synthesizeAndPlayTts(text, msgId, wrapperEl) {
    const modelForThisMessage = selectedTtsModel;
    const playBtn = wrapperEl.querySelector('.play-btn');

    playBtn.textContent = '⏳ 音声準備中...';

    try {
      const audioResult = await fetchGoogleCloudTts(text, modelForThisMessage);
      audioCache.set(msgId, audioResult);

      const label = (typeof audioResult === 'object' && audioResult.fallbackText) 
        ? '▶ 再生 (Web TTS)' 
        : `▶ 再生 (${modelForThisMessage.split('-').pop()})`;
      
      playBtn.innerHTML = label;

      // Auto play generated audio
      playAudio(msgId, playBtn);
    } catch (err) {
      console.error('TTS Error:', err);
      // Fallback directly to browser speech synthesis
      audioCache.set(msgId, { fallbackText: text });
      playBtn.innerHTML = `▶ 再生 (Web TTS)`;
      playAudio(msgId, playBtn);
    }
  }

  /**
   * Play Audio Function with Double-Playback Prevention (Specification ⑤)
   */
  function isPlaying() {
    return (currentAudio && !currentAudio.paused) || (window.speechSynthesis && window.speechSynthesis.speaking);
  }

  function playAudio(msgId, playBtn) {
    const audioData = audioCache.get(msgId);
    if (!audioData) return;

    // Rule ⑤: Double click / repeated click stops playback
    if (isPlaying()) {
      const isSameBtn = (currentActivePlayBtn === playBtn);
      stopCurrentAudio();
      
      // If user clicked the SAME play button while playing, just stop it and return!
      if (isSameBtn) {
        return;
      }
    }

    currentActivePlayBtn = playBtn;
    playBtn.classList.add('playing');
    playBtn.innerHTML = '⏸ 停止中';

    if (typeof audioData === 'string') {
      // 1. Google Cloud TTS MP3 Audio (Base64)
      currentAudio = new Audio('data:audio/mp3;base64,' + audioData);
      currentAudio.play().catch(err => {
        console.error('Audio play error:', err);
        stopCurrentAudio();
      });

      currentAudio.onended = () => {
        resetPlayBtnState(playBtn);
        currentAudio = null;
        currentActivePlayBtn = null;
      };
    } else if (audioData && audioData.fallbackText) {
      // 2. Web Speech API (Browser Standard Synthesis) Fallback
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(audioData.fallbackText);
        utterance.lang = 'ja-JP';
        utterance.rate = 1.0;

        // Try selecting Japanese voice
        const voices = window.speechSynthesis.getVoices();
        const jaVoice = voices.find(v => v.lang.includes('ja') || v.lang.includes('JP'));
        if (jaVoice) utterance.voice = jaVoice;

        utterance.onend = () => {
          resetPlayBtnState(playBtn);
          currentUtterance = null;
          currentActivePlayBtn = null;
        };

        utterance.onerror = (e) => {
          console.error('SpeechSynthesis Error:', e);
          stopCurrentAudio();
        };

        currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
      } else {
        alert('お使いのブラウザは音声再生に対応していません。');
        stopCurrentAudio();
      }
    }
  }

  function stopCurrentAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      currentUtterance = null;
    }
    if (currentActivePlayBtn) {
      resetPlayBtnState(currentActivePlayBtn);
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
