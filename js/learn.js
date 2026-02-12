/**
* Kiddo World - 学习区模块
* 听(Listen)、说(Speak)、读(Read)、写(Write) 四关，完成得苹果，苹果飞入背包动画
*/
(function (global) {
  const TASKS_PER_APPLE = 3;  // 每完成 3 个小任务得 1 苹果
  
  function getList() {
  var raw = (typeof window !== 'undefined' && window.getPlayableContent)
  ? window.getPlayableContent('vocabulary')
  : ((typeof window !== 'undefined' && window.vocabularyList) ? window.vocabularyList : []);
  var level = (typeof window !== 'undefined' && window.currentLevel) ? window.currentLevel : null;
  if (!level) return raw;
  var levelKey = (level === 'Level 1') ? 'primary' : (level === 'Level 2') ? 'junior' : level;
  return raw.filter(function(w) { return w.level === levelKey; });
  }
  
  function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
  }
  
  function pickWords(n) {
  var list = getList();
  return shuffle(list).slice(0, Math.min(n, list.length));
  }
  
  function speakTTS(text, lang = 'en-US') {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((resolve) => {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.9;
  u.onend = () => resolve();
  speechSynthesis.speak(u);
  });
  }
  
  /** 页面上显示录音相关错误（方便手机/他人电脑排查，无需看控制台） */
  function showRecorderError(text) {
    if (typeof document === 'undefined' || !text) return;
    var el = document.getElementById('recorder-error-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'recorder-error-toast';
      el.setAttribute('style', 'display:none; position:fixed; top:1rem; left:50%; transform:translateX(-50%); background:#fee; color:red; padding:0.5rem 1rem; border-radius:8px; z-index:99999; font-size:12px; max-width:90%; box-shadow:0 2px 8px rgba(0,0,0,0.15);');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.display = 'block';
  }

  var MAX_LISTEN_MS = 8000;

  /** 生成 32 位 hex 字符串（阿里云 message_id / task_id 要求） */
  function randomHex32() {
    var arr = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (var i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(arr, function(b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  /** Float32 线性重采样到 16000 Hz，返回 Float32Array */
  function resampleTo16k(float32, fromSampleRate) {
    if (fromSampleRate === 16000) return float32;
    var outLen = Math.floor(float32.length * 16000 / fromSampleRate);
    var out = new Float32Array(outLen);
    var ratio = fromSampleRate / 16000;
    for (var i = 0; i < outLen; i++) {
      var srcIndex = i * ratio;
      var i0 = Math.floor(srcIndex);
      var i1 = Math.min(i0 + 1, float32.length - 1);
      var t = srcIndex - i0;
      out[i] = float32[i0] + t * (float32[i1] - float32[i0]);
    }
    return out;
  }

  /** Float32 [-1,1] 转 16 位 PCM 小端，返回 ArrayBuffer */
  function float32ToPcm16(float32) {
    var len = float32.length;
    var buf = new ArrayBuffer(len * 2);
    var view = new DataView(buf);
    for (var i = 0; i < len; i++) {
      var s = Math.max(-1, Math.min(1, float32[i]));
      var v = s < 0 ? s * 32768 : s * 32767;
      view.setInt16(i * 2, v, true);
    }
    return buf;
  }

  /** 规范化后比较：忽略大小写与标点，判断 result 是否包含 expected */
  function intermediateContainsExpected(result, expected) {
    if (typeof result !== 'string' || typeof expected !== 'string') return false;
    var r = result.replace(/\s+/g, '').replace(/[.,!?;:'"()\[\]\-\s]/g, '').toLowerCase();
    var e = expected.replace(/\s+/g, '').replace(/[.,!?;:'"()\[\]\-\s]/g, '').toLowerCase();
    if (!e) return false;
    return r.indexOf(e) !== -1;
  }

  /**
   * 使用 Web Audio 采集麦克风 -> 16k 单声道 PCM -> 阿里云 WebSocket 实时识别。
   * 先请求 /api/token，连接 WS，发送 StartTranscription(format: pcm, sample_rate: 16000)，
   * 收到 TranscriptionStarted 后用 ScriptProcessorNode 实时采集并重采样为 16k PCM 发送。
   * options: { expectedText } 可选，若提供则在 TranscriptionResultChanged 中一旦中间结果包含该文本即提前结束并判定成功。
   * 返回 { stop: function() => Promise<string> }，调用 stop() 发送 StopTranscription 并返回识别结果。
   */
  function startPcmWebSocketSession(stream, setStatus, options) {
    var opts = options || {};
    if (typeof setStatus === 'function') setStatus('正在连接...');
    var taskId = randomHex32();
    return fetch('/api/token')
      .then(function(r) {
        if (!r.ok) {
          return r.json().then(function(body) {
            var err = new Error(body.error || body.message || r.statusText);
            err.response = { status: r.status, statusText: r.statusText, data: body };
            throw err;
          }).catch(function(e) {
            if (e.response) throw e;
            throw new Error(e.message || r.statusText);
          });
        }
        return r.json();
      })
      .then(function(data) {
        var token = data.token || (data.Token && data.Token.Id);
        var appkey = data.appkey;
        if (!token || !appkey) {
          var err = new Error('Token 或 Appkey 缺失');
          err.response = { status: 500, data: data };
          throw err;
        }
        var wsUrl = 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1?token=' + encodeURIComponent(token);
        var ws = new WebSocket(wsUrl);
        var results = [];
        var finishResolve, finishReject;
        var finishPromise = new Promise(function(resolve, reject) { finishResolve = resolve; finishReject = reject; });
        var finished = false;
        var processor = null;
        var audioCtx = null;
        var connectionTimeoutId = null;

        function finish() {
          if (finished) return;
          finished = true;
          if (connectionTimeoutId) { clearTimeout(connectionTimeoutId); connectionTimeoutId = null; }
          if (processor) try { processor.disconnect(); } catch (e) {}
          if (audioCtx) try { audioCtx.close(); } catch (e) {}
          try { ws.close(); } catch (e) {}
          finishResolve(results.length ? results.join('') : '');
        }

        ws.onerror = function() {
          if (!finished) { finished = true; if (connectionTimeoutId) clearTimeout(connectionTimeoutId); finishReject(new Error('WebSocket 连接失败')); }
        };
        ws.onclose = function(ev) {
          if (!finished && !ev.wasClean) finishReject(new Error('连接异常关闭'));
          else if (!finished) finish();
        };
        ws.onopen = function() {
          connectionTimeoutId = setTimeout(function() {
            if (finished) return;
            finished = true;
            finishReject(new Error('连接超时，请重试'));
            try { ws.close(); } catch (e) {}
          }, 3000);
          var startMsg = {
            header: {
              message_id: randomHex32(),
              task_id: taskId,
              namespace: 'SpeechTranscriber',
              name: 'StartTranscription',
              appkey: appkey
            },
            payload: {
              format: 'pcm',
              sample_rate: 16000,
              enable_punctuation_prediction: true,
              enable_intermediate_result: true
            }
          };
          ws.send(JSON.stringify(startMsg));
        };
        ws.onmessage = function(ev) {
          if (typeof ev.data !== 'string') return;
          var msg;
          try { msg = JSON.parse(ev.data); } catch (e) { return; }
          var header = msg.header || {};
          var status = header.status;
          if (status !== undefined && status !== 20000000) {
            if (!finished) {
              finished = true;
              finishReject(new Error(header.status_message || ('status ' + status)));
            }
            return;
          }
          var name = header.name;
          if (name === 'TranscriptionStarted') {
            if (connectionTimeoutId) { clearTimeout(connectionTimeoutId); connectionTimeoutId = null; }
            if (typeof setStatus === 'function') setStatus('🔴 正在听...');
            var streamOk = stream && stream.active && stream.getTracks && stream.getTracks().length > 0;
            if (!streamOk) {
              if (!finished) { finished = true; finishReject(new Error('麦克风流无效或已断开')); }
              return;
            }
            var Ctx = window.AudioContext || window.webkitAudioContext;
            audioCtx = new Ctx();
            var source = audioCtx.createMediaStreamSource(stream);
            var bufferSize = 4096;
            processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
            var gain = audioCtx.createGain();
            gain.gain.value = 0;
            source.connect(processor);
            processor.onaudioprocess = function(e) {
              if (ws.readyState !== 1) return;
              var input = e.inputBuffer.getChannelData(0);
              var resampled = resampleTo16k(input, audioCtx.sampleRate);
              var pcm = float32ToPcm16(resampled);
              ws.send(pcm);
            };
            function connectToDestination() {
              if (!processor || !audioCtx || audioCtx.state === 'closed') return;
              if (!stream.active) return;
              processor.connect(gain);
              gain.connect(audioCtx.destination);
            }
            if (audioCtx.state === 'suspended') {
              audioCtx.resume().then(function() {
                if (audioCtx.state === 'running') connectToDestination();
              }).catch(function(err) {
                if (!finished) { finished = true; finishReject(err); }
              });
            } else if (audioCtx.state === 'running') {
              connectToDestination();
            } else {
              connectToDestination();
            }
            return;
          }
          if (name === 'TranscriptionResultChanged' && msg.payload && msg.payload.result != null) {
            var mid = String(msg.payload.result).trim();
            if (opts.expectedText && intermediateContainsExpected(mid, opts.expectedText)) {
              results = [opts.expectedText];
              if (ws.readyState === 1) ws.send(JSON.stringify(stopMsg));
              finish();
              return;
            }
          }
          if (name === 'SentenceEnd' && msg.payload && msg.payload.result != null) {
            results.push(String(msg.payload.result).trim());
          }
          if (name === 'TranscriptionCompleted') finish();
        };

        var stopMsg = {
          header: {
            message_id: randomHex32(),
            task_id: taskId,
            namespace: 'SpeechTranscriber',
            name: 'StopTranscription',
            appkey: appkey
          }
        };

        return {
          stop: function() {
            if (connectionTimeoutId) { clearTimeout(connectionTimeoutId); connectionTimeoutId = null; }
            if (processor) { try { processor.disconnect(); } catch (e) {} processor = null; }
            if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
            if (ws.readyState === 1) ws.send(JSON.stringify(stopMsg));
            return finishPromise.then(function(t) { return (t || '').trim(); });
          }
        };
      });
  }

  function isStreamActive(s) {
    if (!s || !s.active) return false;
    var tracks = s.getTracks();
    return tracks.length > 0 && tracks.every(function(t) { return t.readyState === 'live'; });
  }

  /** 页面 load 时仅调用一次，申请麦克风并存入 window.sharedAudioStream；由 app.js 的 window.onload 触发 */
  function initAudioStream() {
    if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
    if (isStreamActive(window.sharedAudioStream)) return Promise.resolve(window.sharedAudioStream);
    var constraints = {
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      var err = new Error('getUserMedia not supported');
      var msg = 'getUserMedia not supported';
      if (typeof console !== 'undefined' && console.error) console.error('[录音] 获取麦克风失败:', msg);
      showRecorderError(msg);
      return Promise.reject(err);
    }
    return navigator.mediaDevices.getUserMedia(constraints).catch(function(err) {
      var msg = (err.name || 'Error') + ': ' + (err.message || '');
      if (err.constraint) msg += ' (constraint: ' + err.constraint + ')';
      if (typeof console !== 'undefined' && console.error) console.error('[录音] getUserMedia 失败 Name:', err.name, 'Message:', err.message);
      showRecorderError(msg);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('请点击「允许」以使用麦克风进行跟读。如已拒绝，请刷新页面后再次允许。');
        }
        return Promise.reject(err);
      }
      if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        if (typeof console !== 'undefined' && console.warn) console.warn('[录音] 使用宽松约束重试: { audio: true }');
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(function(e) {
          var fallbackMsg = (e.name || 'Error') + ': ' + (e.message || '');
          if (typeof console !== 'undefined' && console.error) console.error('[录音] 宽松约束仍失败 Name:', e.name, 'Message:', e.message);
          showRecorderError(fallbackMsg);
          return Promise.reject(e);
        });
      }
      return Promise.reject(err);
    }).then(function(stream) {
      window.sharedAudioStream = stream;
      monitorMicSignal(stream);
      return stream;
    });
  }

  /** 简单音量监测：确认流未被安全策略静音，检测到信号时在控制台打印「麦克风信号已捕捉」 */
  function monitorMicSignal(stream) {
    if (typeof window === 'undefined' || !window.AudioContext && !window.webkitAudioContext) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      var source = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      var data = new Uint8Array(analyser.frequencyBinCount);
      var logged = false;
      var count = 0;
      var maxChecks = 30;
      function check() {
        if (logged) return;
        analyser.getByteFrequencyData(data);
        for (var i = 0; i < data.length; i++) {
          if (data[i] > 2) {
            logged = true;
            if (typeof console !== 'undefined' && console.log) console.log('麦克风信号已捕捉');
            return;
          }
        }
        count++;
        if (count < maxChecks) setTimeout(check, 200);
        else if (typeof console !== 'undefined' && console.log) console.log('麦克风已接通，等待说话');
      }
      setTimeout(check, 300);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[录音] 音量监测未启用:', e.message || e);
    }
  }

  /** 仅返回 window.sharedAudioStream，严禁调用 getUserMedia；未初始化时需先执行 initAudioStream（页面 onload） */
  function getMicStream() {
    if (typeof window !== 'undefined' && isStreamActive(window.sharedAudioStream)) {
      return Promise.resolve(window.sharedAudioStream);
    }
    var msg = 'Microphone not initialized. Allow access when the page loads.';
    showRecorderError(msg);
    return Promise.reject(new Error(msg));
  }

  function blobToBase64(blob) {
      return new Promise(function(resolve, reject) {
        var r = new FileReader();
        r.onload = function() {
          var base64 = (r.result || '').split(',')[1] || '';
          resolve(base64);
        };
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }
  
  /** 跟读：Web Audio 采集麦克风 -> 16k PCM -> 阿里云 WebSocket 实时识别。options.setStatus、options.expectedText 可选。 */
  function listenSTT(options) {
    var opts = options || {};
    var setStatus = opts.setStatus || function() {};
    var sessionRef = null;
    var timeoutId = null;
    var deferredResolve, deferredReject;
    var mainPromise = new Promise(function(resolve, reject) { deferredResolve = resolve; deferredReject = reject; });

    if (typeof navigator !== 'undefined' && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
      showRecorderError('NotSupportedError: 当前浏览器不支持 getUserMedia');
      return { promise: Promise.reject(new Error('getUserMedia not supported')), stop: function() {} };
    }
    if (typeof window === 'undefined' || (!window.AudioContext && !window.webkitAudioContext)) {
      showRecorderError('当前浏览器不支持 Web Audio API');
      return { promise: Promise.reject(new Error('Web Audio not supported')), stop: function() {} };
    }

    setStatus('正在连接...');
    getMicStream()
      .then(function(stream) { return startPcmWebSocketSession(stream, setStatus, { expectedText: opts.expectedText }); })
      .then(function(session) {
        sessionRef = session;
        timeoutId = setTimeout(function() {
          if (sessionRef) sessionRef.stop().then(deferredResolve).catch(deferredReject);
        }, MAX_LISTEN_MS);
      })
      .catch(function(err) {
        if (err && err.response) {
          var r = err.response;
          if (typeof console !== 'undefined' && console.error) {
            console.error('[录音] 接口响应:', r.status, r.statusText, r.data);
          }
          showRecorderError('接口 ' + r.status + (r.statusText ? ' ' + r.statusText : '') + (r.data && r.data.message ? ' ' + r.data.message : ''));
        } else {
          var msg = (err && err.name ? err.name : 'Error') + ': ' + (err && err.message ? err.message : String(err));
          if (typeof console !== 'undefined' && console.error) console.error('[录音] 跟读失败', msg);
          showRecorderError(msg);
        }
        deferredReject(err);
      });

    return {
      promise: mainPromise,
      stop: function() {
        if (timeoutId) clearTimeout(timeoutId);
        if (sessionRef) sessionRef.stop().then(deferredResolve).catch(deferredReject);
      }
    };
  }

  /** 按住录音、松开后识别：Web Audio 采集 16k PCM，阿里云 WebSocket 实时识别 */
  function listenSTTHold() {
    var sessionRef = null;
    return {
      start: function() {
        getMicStream().then(function(stream) {
          return startPcmWebSocketSession(stream, function() {});
        }).then(function(session) {
          sessionRef = session;
        }).catch(function(err) {
          if (typeof console !== 'undefined' && console.error) console.error('[录音] 按住录音启动失败:', err.message);
          showRecorderError(err.message || '启动识别失败');
        });
      },
      stop: function() {
        return new Promise(function(resolve) {
          if (!sessionRef) { resolve(''); return; }
          sessionRef.stop().then(resolve).catch(function() { resolve(''); });
          sessionRef = null;
        });
      }
    };
  }
  
  function playCorrectSound() {
  try {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(ctx.destination);
  o.frequency.value = 523;
  o.type = 'sine';
  g.gain.setValueAtTime(0.2, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
  o.start(ctx.currentTime);
  o.stop(ctx.currentTime + 0.2);
  } catch (e) {}
  }
  
  function triggerAppleFlyToBackpack(callback) {
  const backpack = document.querySelector('[data-backpack]');
  if (!backpack) {
  if (callback) callback();
  return;
  }
  const apple = document.createElement('div');
  apple.className = 'fixed text-4xl z-50 pointer-events-none animate-bounce';
  apple.textContent = '🍎';
  apple.style.left = '50%';
  apple.style.top = '40%';
  apple.style.transform = 'translate(-50%, -50%)';
  document.body.appendChild(apple);
  const rect = backpack.getBoundingClientRect();
  const endX = rect.left + rect.width / 2;
  const endY = rect.top + rect.height / 2;
  apple.animate([
  { left: '50%', top: '40%', transform: 'translate(-50%, -50%) scale(1)' },
  { left: endX + 'px', top: endY + 'px', transform: 'translate(-50%, -50%) scale(0.6)' }
  ], { duration: 600, easing: 'ease-out' }).onfinish = () => {
  apple.remove();
  if (callback) callback();
  };
  }
  
  function rewardAppleAndAnimate() {
  KiddoStore.addApples(1);
  if (typeof KiddoStore !== 'undefined' && KiddoStore.addLearnMinutes) KiddoStore.addLearnMinutes(1);
  triggerAppleFlyToBackpack(() => {
  if (typeof KiddoApp !== 'undefined' && KiddoApp.refreshApples) KiddoApp.refreshApples();
  });
  }
  
  // ---- Listen: 听单词选图/词，累计 3 次正确得 1 苹果 ----
  function runListenGame(container, onComplete, totalCorrect) {
  const acc = typeof totalCorrect === 'number' ? totalCorrect : 0;
  const words = pickWords(4);
  if (!words.length) {
  container.innerHTML = '<p class="text-center text-gray-500 py-8">当前年级暂无单词。</p>';
  return;
  }
  const target = words[0];
  const options = shuffle(words.map(w => w.word));
  let done = 0;
  
  container.innerHTML = `
       <div class="text-center p-4">
         <p class="text-lg text-gray-700 mb-2">听一听，选正确的单词</p>
         <button type="button" data-listen-play class="px-6 py-3 bg-blue-500 text-white rounded-2xl shadow-lg text-xl">🔊 播放</button>
         <div class="mt-6 grid grid-cols-2 gap-3" data-listen-options></div>
         <p class="mt-4 text-sm text-amber-600" data-listen-progress>正确 ${acc} / ${TASKS_PER_APPLE} → 得 🍎</p>
       </div>
     `;
  const optsEl = container.querySelector('[data-listen-options]');
  const progressEl = container.querySelector('[data-listen-progress]');
  options.forEach(w => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'py-4 px-4 bg-white border-2 border-gray-200 rounded-xl text-lg font-bold shadow hover:border-blue-400';
  btn.textContent = w;
  btn.dataset.word = w;
  optsEl.appendChild(btn);
  btn.addEventListener('click', () => {
  if (done) return;
  const right = w === target.word;
  if (right) {
  playCorrectSound();
  const newTotal = acc + 1;
  progressEl.textContent = `正确 ${newTotal} / ${TASKS_PER_APPLE} → 得 🍎`;
  if (newTotal >= TASKS_PER_APPLE) {
  done = 1;
  rewardAppleAndAnimate();
  KiddoStore.addLearnedWordId(target.id);
  setTimeout(() => onComplete && onComplete(), 800);
  } else {
  runListenGame(container, onComplete, newTotal);
  }
  } else {
  KiddoStore.addWrongWordId(target.id);
  btn.classList.add('border-red-400', 'bg-red-50');
  }
  });
  });
  container.querySelector('[data-listen-play]').addEventListener('click', () => speakTTS(target.word));
  }
  
  // ---- Speak: 跟读，英文下方显示中文翻译，底部与 Listen 一致的进度条 ----
  function runSpeakGame(container, onComplete) {
  var list = getList();
  var words = shuffle(list).slice(0, Math.min(TASKS_PER_APPLE, list.length));
  if (!words.length) {
  container.innerHTML = '<p class="text-center text-gray-500 py-8">当前年级暂无单词，请切换年级。</p>';
  return;
  }
  let idx = 0;
  let correctCount = 0;
  
  function showOne() {
  if (idx >= words.length) {
  rewardAppleAndAnimate();
  words.forEach(w => KiddoStore.addLearnedWordId(w.id));
  setTimeout(() => onComplete && onComplete(), 800);
  return;
  }
  const w = words[idx];
  container.innerHTML = `
         <div class="text-center p-4">
           <p class="text-lg text-gray-700 mb-2">跟读这个单词</p>
           <p class="text-3xl font-bold text-blue-600 mb-1">${w.word}</p>
           <p class="text-base text-gray-500 mb-2">${w.translation || ''}</p>
           <p class="text-gray-400 text-sm mb-4">${w.phonetic}</p>
           <button type="button" data-speak-play class="px-4 py-2 bg-gray-200 rounded-xl mr-2">🔊 听</button>
           <button type="button" data-speak-mic class="px-4 py-2 bg-green-500 text-white rounded-xl">🎤 说</button>
           <p class="mt-4 text-sm" data-speak-result></p>
           <p class="mt-4 text-sm text-amber-600" data-speak-progress>正确 ${correctCount} / ${TASKS_PER_APPLE} → 得 🍎</p>
         </div>
       `;
  container.querySelector('[data-speak-play]').addEventListener('click', function() { speakTTS(w.word); });
  var speakMicBtn = container.querySelector('[data-speak-mic]');
  speakMicBtn.addEventListener('click', function() {
    var resultEl = container.querySelector('[data-speak-result]');
    function setStatus(t) {
      resultEl.textContent = t;
      if (speakMicBtn) {
        speakMicBtn.textContent = (t === '正在连接...' || t === '🔴 正在听...') ? t : '🎤 说';
        speakMicBtn.disabled = (t === '正在连接...' || t === '🔴 正在听...');
      }
    }
    var session = listenSTT({ setStatus: setStatus, expectedText: w.word });
    session.promise.then(function(transcript) {
      speakMicBtn.textContent = '🎤 说';
      speakMicBtn.disabled = false;
      var normalized = (transcript || '').toLowerCase().replace(/\s/g, '');
      var expected = w.word.toLowerCase().replace(/\s/g, '');
      var ok = normalized === expected || normalized.includes(expected) || expected.includes(normalized);
      if (ok) {
        playCorrectSound();
        correctCount++;
        var progEl = container.querySelector('[data-speak-progress]');
        if (progEl) progEl.textContent = '正确 ' + correctCount + ' / ' + TASKS_PER_APPLE + ' → 得 🍎';
        resultEl.textContent = '✓ 读得真好！';
        idx++;
        setTimeout(showOne, 600);
      } else {
        resultEl.textContent = '再试一次吧！你说: ' + (transcript || '(没听到)');
        KiddoStore.addWrongWordId(w.id);
      }
    }).catch(function(err) {
      speakMicBtn.textContent = '🎤 说';
      speakMicBtn.disabled = false;
      resultEl.textContent = (err && err.message) ? err.message : '请允许麦克风后再试';
    });
  });
  }
  showOne();
  }
  
  // ---- Read: 看词选意思，进入自动播放发音，单词旁显眼喇叭可重播 ----
  function runReadGame(container, onComplete, totalCorrect) {
  const acc = typeof totalCorrect === 'number' ? totalCorrect : 0;
  const words = pickWords(4);
  if (!words.length) {
  container.innerHTML = '<p class="text-center text-gray-500 py-8">当前年级暂无单词。</p>';
  return;
  }
  const target = words[0];
  const options = shuffle(words.map(w => ({ word: w.word, trans: w.translation })));
  let done = 0;
  
  container.innerHTML = `
       <div class="text-center p-4">
         <p class="text-lg text-gray-700 mb-2">这个单词的意思是？</p>
         <div class="flex items-center justify-center gap-2 mb-4">
           <span class="text-3xl font-bold text-blue-600">${target.word}</span>
           <button type="button" data-read-speaker class="p-2 rounded-full bg-amber-100 hover:bg-amber-200 text-2xl" title="播放发音">🔊</button>
         </div>
         <div class="mt-4 grid grid-cols-2 gap-3" data-read-options></div>
         <p class="mt-4 text-sm text-amber-600" data-read-progress>正确 ${acc} / ${TASKS_PER_APPLE} → 得 🍎</p>
       </div>
     `;
  speakTTS(target.word);
  const optsEl = container.querySelector('[data-read-options]');
  const progressEl = container.querySelector('[data-read-progress]');
  container.querySelector('[data-read-speaker]').addEventListener('click', () => speakTTS(target.word));
  options.forEach(({ trans }) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'py-4 px-4 bg-white border-2 border-gray-200 rounded-xl text-lg shadow hover:border-blue-400';
  btn.textContent = trans;
  optsEl.appendChild(btn);
  btn.addEventListener('click', () => {
  if (done) return;
  const right = trans === target.translation;
  if (right) {
  playCorrectSound();
  const newTotal = acc + 1;
  progressEl.textContent = `正确 ${newTotal} / ${TASKS_PER_APPLE} → 得 🍎`;
  if (newTotal >= TASKS_PER_APPLE) {
  done = 1;
  rewardAppleAndAnimate();
  KiddoStore.addLearnedWordId(target.id);
  setTimeout(() => onComplete && onComplete(), 800);
  } else {
  runReadGame(container, onComplete, newTotal);
  }
  } else {
  KiddoStore.addWrongWordId(target.id);
  btn.classList.add('border-red-400', 'bg-red-50');
  }
  });
  });
  }
  
  // ---- Write: 填空题，显示图片+挖空单词，底部字母选项点击填入 ----
  function runWriteGame(container, onComplete, totalCorrect) {
  const acc = typeof totalCorrect === 'number' ? totalCorrect : 0;
  const words = pickWords(Math.max(3, TASKS_PER_APPLE));
  if (!words.length) {
  container.innerHTML = '<p class="text-center text-gray-500 py-8">当前年级暂无单词。</p>';
  return;
  }
  const target = words[0];
  const word = target.word.toUpperCase();
  if (word.length < 2) {
  runWriteGame(container, onComplete, acc);
  return;
  }
  const hideIndex = Math.floor(Math.random() * word.length);
  const correctLetter = word[hideIndex];
  const allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  let wrongPool = shuffle(allLetters.filter(c => c !== correctLetter)).slice(0, 3);
  const letterOptions = shuffle([correctLetter, ...wrongPool]);
  const displayWord = word.split('').map((c, i) => i === hideIndex ? '_' : c).join(' ');
  
  let done = 0;
  container.innerHTML = `
       <div class="text-center p-4">
         <p class="text-lg text-gray-700 mb-2">听一听，选字母填进空格</p>
         <button type="button" data-write-play class="p-2 rounded-full bg-blue-100 mb-2 text-2xl">🔊</button>
         <div class="text-[80px] leading-none mb-4 flex justify-center items-center" data-write-emoji>${target.image || '📝'}</div>
         <p class="text-2xl font-bold text-gray-800 tracking-widest mb-4" data-write-blank>${displayWord}</p>
         <div class="flex flex-wrap justify-center gap-2" data-write-letters></div>
         <p class="mt-4 text-sm text-amber-600" data-write-progress>正确 ${acc} / ${TASKS_PER_APPLE} → 得 🍎</p>
       </div>
     `;
  const blankEl = container.querySelector('[data-write-blank]');
  const lettersEl = container.querySelector('[data-write-letters]');
  const progressEl = container.querySelector('[data-write-progress]');
  
  letterOptions.forEach(letter => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'w-12 h-12 rounded-xl bg-white border-2 border-gray-200 text-xl font-bold shadow hover:border-blue-400';
  btn.textContent = letter;
  btn.dataset.letter = letter;
  lettersEl.appendChild(btn);
  btn.addEventListener('click', () => {
  if (done) return;
  if (letter !== correctLetter) {
  KiddoStore.addWrongWordId(target.id);
  btn.classList.add('border-red-400', 'bg-red-50');
  return;
  }
  playCorrectSound();
  const newTotal = acc + 1;
  blankEl.textContent = word.split('').join(' ');
  progressEl.textContent = `正确 ${newTotal} / ${TASKS_PER_APPLE} → 得 🍎`;
  done = 1;
  if (newTotal >= TASKS_PER_APPLE) {
  rewardAppleAndAnimate();
  KiddoStore.addLearnedWordId(target.id);
  setTimeout(() => onComplete && onComplete(), 800);
  } else {
  setTimeout(() => runWriteGame(container, onComplete, newTotal), 600);
  }
  });
  });
  container.querySelector('[data-write-play]').addEventListener('click', () => speakTTS(target.word));
  speakTTS(target.word);
  }
  
  // ---- 单词课堂：卡片轮播，大图(80px emoji)+英文+中文，自动朗读，点击跟读(与学句子同逻辑)+兜底模拟测试 ----
  const FLASHCARD_COUNT = 5;

  function runFlashcardView(container, onComplete) {
  var list = getList();
  var n = list.length;
  var recentCount = Math.min(3, n);
  var recent = list.slice(n - recentCount);
  var rest = n > recentCount ? shuffle(list.slice(0, n - recentCount)) : [];
  var words = (recent.concat(rest)).slice(0, Math.min(FLASHCARD_COUNT, list.length));
  if (!words.length) { container.innerHTML = '<p class="text-center text-gray-500">当前年级暂无单词，请切换年级或先解锁更多单词。</p>'; return; }
  var idx = 0;
  
  function showCard() {
  if (idx >= words.length) {
  container.innerHTML = `
           <div class="text-center p-6">
             <p class="text-2xl font-bold text-green-600 mb-4">🎉 学完啦！</p>
             <p class="text-gray-600 mb-6">去闯关拿苹果吧～</p>
             <button type="button" data-flashcard-done class="py-3 px-6 bg-green-500 text-white rounded-2xl font-bold">去闯关</button>
           </div>
         `;
  container.querySelector('[data-flashcard-done]').addEventListener('click', function() { if (onComplete) onComplete(); });
  return;
  }
  var w = words[idx];
  var learnedIds = (typeof KiddoStore !== 'undefined' && KiddoStore.getLearnedWords) ? KiddoStore.getLearnedWords() : [];
  var isCollected = learnedIds.indexOf(w.id) !== -1;
  container.innerHTML = `
         <div class="text-center p-4 relative">
           ${isCollected ? '<span class="absolute top-2 right-2 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-sm font-bold">✅ 已收集</span>' : ''}
           <p class="text-sm text-gray-500 mb-2">${idx + 1} / ${words.length}</p>
           <div class="text-[80px] leading-none mb-4 flex justify-center items-center" data-flash-emoji>${w.image || '📝'}</div>
           <p class="text-3xl font-bold text-blue-600 mb-1">${w.word}</p>
           <p class="text-xl text-gray-600 mb-4">${w.translation || ''}</p>
           <button type="button" data-flash-speaker class="p-2 rounded-full bg-amber-100 text-2xl mb-2">🔊</button>
           <p class="text-sm text-gray-500 mb-2">点击「跟读」说话，说完自动评分</p>
           <button type="button" data-flash-mic class="py-3 px-6 bg-green-500 text-white rounded-2xl font-bold">🎤 跟读</button>
           <p class="mt-4 text-sm min-h-[1.5rem]" data-flash-result></p>
           <div class="mt-6">
             <button type="button" data-flash-next class="py-2 px-4 bg-blue-100 text-blue-700 rounded-xl font-bold">下一个 →</button>
           </div>
         </div>
       `;
  speakTTS(w.word);
  var resultEl = container.querySelector('[data-flash-result]');
  
  function doScore(transcript) {
  var normalized = (transcript || '').toLowerCase().replace(/\s/g, '');
  var expected = w.word.toLowerCase().replace(/\s/g, '');
  var ok = normalized === expected || normalized.includes(expected) || expected.includes(normalized);
  resultEl.textContent = ok ? '✓ 读得真好！' : ('再试一次吧～ 你说: ' + (transcript || '(没听到)'));
  if (ok) {
  playCorrectSound();
  if (typeof KiddoStore !== 'undefined' && KiddoStore.addLearnedWord) KiddoStore.addLearnedWord(w.id);
  if (typeof window !== 'undefined' && window.unlockNewContent) window.unlockNewContent('vocabulary', 1);
  }
  }
  
  container.querySelector('[data-flash-speaker]').addEventListener('click', function() { speakTTS(w.word); });
  var micBtn = container.querySelector('[data-flash-mic]');
  if (micBtn) {
    micBtn.addEventListener('click', function() {
      function setStatus(t) {
        resultEl.textContent = t;
        micBtn.textContent = (t === '正在连接...' || t === '🔴 正在听...') ? t : '🎤 跟读';
        micBtn.disabled = (t === '正在连接...' || t === '🔴 正在听...');
      }
      var session = listenSTT({ setStatus: setStatus, expectedText: w.word });
      session.promise.then(function(transcript) {
        micBtn.textContent = '🎤 跟读';
        micBtn.disabled = false;
        doScore(transcript);
      }).catch(function(err) {
        micBtn.textContent = '🎤 跟读';
        micBtn.disabled = false;
        resultEl.textContent = (err && err.message) ? err.message : '请允许麦克风后再试';
      });
    });
  }
  container.querySelector('[data-flash-next]').addEventListener('click', function() {
  if (typeof KiddoStore !== 'undefined' && KiddoStore.addLearnedWord) KiddoStore.addLearnedWord(w.id);
  if (typeof window !== 'undefined' && window.unlockNewContent) window.unlockNewContent('vocabulary', 1);
  idx++;
  showCard();
  });
  }
  showCard();
  }
  
  // ---- 学句子：按 store.userProgress.sentenceIndex 顺序展示，上一句/下一句，保存进度；标题为「当前进度: 第 X / 总 Y 句」----
  function runSentenceView(container, onBack) {
  var levelKey = (typeof window !== 'undefined' && window.currentLevel === 'Level 2') ? 'junior' : 'primary';
  var list = (typeof window !== 'undefined' && window.getPlayableContent)
  ? window.getPlayableContent('sentence')
  : ((typeof window !== 'undefined' && window.sentenceList) ? window.sentenceList : []);
  var filtered = list.filter(function(s) { return s.level === levelKey; });
  var total = filtered.length;
  if (total === 0) {
  container.innerHTML = '<div class="p-4 text-center text-gray-500">当前年级暂无句子</div>';
  if (onBack) { var b = document.createElement('button'); b.className = 'text-blue-600 font-bold'; b.textContent = '← 返回'; b.addEventListener('click', onBack); container.appendChild(b); }
  return;
  }
  var idx = typeof KiddoStore !== 'undefined' ? Math.min(KiddoStore.getSentenceIndex(levelKey), total - 1) : 0;
  idx = Math.max(0, idx);
  
  function render() {
  var s = filtered[idx];
  if (!s) return;
  var en = s.text || '';
  var zh = s.translation || '';
  var img = s.image || '📝';
  container.innerHTML =
  '<div class="p-4 max-w-lg mx-auto text-center">' +
  '<p class="text-sm text-gray-500 mb-2">当前进度: 第 ' + (idx + 1) + ' / 总 ' + total + ' 句</p>' +
  '<div class="text-[80px] leading-none mb-4 flex justify-center items-center">' + img + '</div>' +
  '<p class="text-xl md:text-2xl font-bold text-gray-800 mb-4 leading-relaxed">' + en + '</p>' +
  '<p class="text-lg text-gray-600 mb-6">' + zh + '</p>' +
  '<div class="flex justify-center gap-4">' +
  '<button type="button" data-sentence-speaker class="py-3 px-6 bg-amber-100 rounded-2xl font-bold text-amber-800">🔊 读句子</button>' +
  '<button type="button" data-sentence-mic class="py-3 px-6 bg-green-500 text-white rounded-2xl font-bold">🎤 跟读</button>' +
  '</div>' +
  '<p class="mt-4 text-sm min-h-[1.5rem]" data-sentence-result></p>' +
  '<div class="mt-6 flex justify-center gap-4">' +
  '<button type="button" data-sentence-prev class="py-2 px-4 bg-gray-200 rounded-xl font-bold">⬅️ 上一句</button>' +
  '<button type="button" data-sentence-next class="py-2 px-4 bg-blue-500 text-white rounded-xl font-bold">➡️ 下一句</button>' +
  '</div>' +
  '</div>';
  container.querySelector('[data-sentence-speaker]').addEventListener('click', function() { speakTTS(en); });
  var sentenceMicBtn = container.querySelector('[data-sentence-mic]');
  sentenceMicBtn.addEventListener('click', function() {
    var resultEl = container.querySelector('[data-sentence-result]');
    function setStatus(t) {
      resultEl.textContent = t;
      sentenceMicBtn.textContent = (t === '正在连接...' || t === '🔴 正在听...') ? t : '🎤 跟读';
      sentenceMicBtn.disabled = (t === '正在连接...' || t === '🔴 正在听...');
    }
    var session = listenSTT({ setStatus: setStatus, expectedText: en });
    session.promise.then(function(transcript) {
      sentenceMicBtn.textContent = '🎤 跟读';
      sentenceMicBtn.disabled = false;
      var t = (transcript || '').trim();
      var ok = t.length > 3 && (en.toLowerCase().indexOf(t.toLowerCase()) !== -1 || t.toLowerCase().indexOf(en.toLowerCase().slice(0, 8)) !== -1);
      resultEl.textContent = ok ? '✓ 读得真好！' : ('再试一次～ 你说: ' + (t || '(没听到)'));
      if (ok) {
        playCorrectSound();
        if (typeof KiddoStore !== 'undefined' && KiddoStore.addLearnedSentenceId) KiddoStore.addLearnedSentenceId(s.id);
        if (typeof window !== 'undefined' && window.unlockNewContent) window.unlockNewContent('sentence', 1);
      }
    }).catch(function(err) {
      sentenceMicBtn.textContent = '🎤 跟读';
      sentenceMicBtn.disabled = false;
      resultEl.textContent = (err && err.message) ? err.message : '请允许麦克风后再试';
    });
  });
  var prevBtn = container.querySelector('[data-sentence-prev]');
  var nextBtn = container.querySelector('[data-sentence-next]');
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= total - 1;
  if (idx <= 0) prevBtn.classList.add('opacity-50', 'cursor-not-allowed');
  if (idx >= total - 1) nextBtn.classList.add('opacity-50', 'cursor-not-allowed');
  nextBtn.addEventListener('click', function() {
  if (idx < total - 1) {
  idx++;
  if (typeof KiddoStore !== 'undefined' && KiddoStore.setSentenceIndex) KiddoStore.setSentenceIndex(levelKey, idx);
  if (typeof window !== 'undefined' && window.unlockNewContent) window.unlockNewContent('sentence', 1);
  render();
  }
  });
  prevBtn.addEventListener('click', function() {
  if (idx > 0) {
  idx--;
  if (typeof KiddoStore !== 'undefined' && KiddoStore.setSentenceIndex) KiddoStore.setSentenceIndex(levelKey, idx);
  render();
  }
  });
  }
  render();
  }
  
  function releaseAudioStream() {
    if (typeof window !== 'undefined' && window.sharedAudioStream) {
      window.sharedAudioStream.getTracks().forEach(function(t) { t.stop(); });
      window.sharedAudioStream = null;
    }
  }

  /** 上传/请求失败时在控制台打印 error.response（status、statusText、data），便于排查 400/415 等；若有 response 也会在页面上红色提示 */
  function logUploadError(err) {
    if (!err) return;
    if (err.response) {
      var r = err.response;
      var status = r.status, statusText = r.statusText || '', data = r.data;
      if (typeof console !== 'undefined' && console.error) {
        console.error('[录音] 上传/接口 response:', 'status', status, 'statusText', statusText, 'data', data);
      }
      showRecorderError('接口 ' + status + (statusText ? ' ' + statusText : '') + (data != null ? ' ' + JSON.stringify(data).slice(0, 100) : ''));
    } else {
      if (typeof console !== 'undefined' && console.error) console.error('[录音] 上传/请求错误', err.message || err);
      showRecorderError((err.message || String(err)).slice(0, 120));
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', releaseAudioStream);
    window.addEventListener('beforeunload', releaseAudioStream);
  }

  global.KiddoLearn = {
    runListenGame,
    runSpeakGame,
    runReadGame,
    runWriteGame,
    runFlashcardView,
    runSentenceView,
    pickWords,
    getList,
    speakTTS,
    listenSTT,
    listenSTTHold,
    getMicStream,
    initAudioStream,
    blobToBase64,
    showRecorderError,
    logUploadError
  };
})(typeof window !== 'undefined' ? window : this);