/**
 * Kiddo World - 主应用
 * 视图切换、护眼休息（startStudyTimer 统一触发）
 */
(function (global) {
  let currentView = 'home';
  if (typeof window !== 'undefined') window.currentLevel = window.currentLevel || 'Level 1';

  // 1. 确保数据严格按照难度(ID)排序：Level 1 简单词/句在前，Level 2 难词/句在后
  if (typeof window !== 'undefined') {
    if (window.vocabularyList && Array.isArray(window.vocabularyList)) window.vocabularyList.sort((a, b) => a.id - b.id);
    if (window.sentenceList && Array.isArray(window.sentenceList)) window.sentenceList.sort((a, b) => a.id - b.id);
  }

  // 2. 初始化进度系统（开放进度：前 N 个单词/句子）
  const STORAGE_KEY_PROGRESS = 'kiddo_learning_progress';
  let userProgress = { wordIndex: 50, sentenceIndex: 20, xp: 0, readStories: [] };
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PROGRESS);
    if (saved) userProgress = Object.assign({}, userProgress, JSON.parse(saved));
    if (!Array.isArray(userProgress.readStories)) userProgress.readStories = [];
  } catch (e) {}
  if (typeof window !== 'undefined') window.userProgress = userProgress;

  // 3. 保存进度的辅助函数
  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(userProgress));
    } catch (e) {}
  }
  if (typeof window !== 'undefined') window.saveProgress = saveProgress;

  // 4. 核心控制：根据进度返回已解锁内容切片
  function getPlayableContent(type) {
    const list = type === 'word' || type === 'vocabulary'
      ? (window.vocabularyList || [])
      : (window.sentenceList || []);
    const currentIndex = type === 'word' || type === 'vocabulary'
      ? (userProgress.wordIndex || 0)
      : (userProgress.sentenceIndex || 0);
    return list.slice(0, currentIndex);
  }

  // 5. 学习完成时增加解锁数量并保存
  function unlockNewContent(type, count) {
    const list = type === 'word' || type === 'vocabulary'
      ? (window.vocabularyList || [])
      : (window.sentenceList || []);
    const maxLen = list.length;
    const add = Math.max(0, parseInt(count, 10) || 1);
    if (type === 'word' || type === 'vocabulary') {
      userProgress.wordIndex = Math.min((userProgress.wordIndex || 0) + add, maxLen);
    } else {
      userProgress.sentenceIndex = Math.min((userProgress.sentenceIndex || 0) + add, maxLen);
    }
    saveProgress();
    if (typeof window !== 'undefined') window.userProgress = userProgress;
  }

  if (typeof window !== 'undefined') {
    window.getPlayableContent = getPlayableContent;
    window.unlockNewContent = unlockNewContent;
  }

  // ---- 家长验证：乘法题（仪表盘入口用，锁按钮暂用 alert）----
  function randomMultiply() {
    const a = Math.floor(Math.random() * 9) + 2;
    const b = Math.floor(Math.random() * 9) + 2;
    return { a, b, answer: a * b };
  }

  function showParentGate(callback) {
    const q = randomMultiply();
    const modal = document.getElementById('parent-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.innerHTML = `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
          <p class="text-lg font-bold text-gray-800 mb-2">家长验证</p>
          <p class="text-gray-600 mb-4">请计算：${q.a} × ${q.b} = ?</p>
          <input type="number" data-parent-answer class="w-full border-2 border-gray-300 rounded-xl px-4 py-2 text-lg" placeholder="输入答案">
          <div class="mt-4 flex gap-2">
            <button type="button" data-parent-cancel class="flex-1 py-2 bg-gray-200 rounded-xl">取消</button>
            <button type="button" data-parent-ok class="flex-1 py-2 bg-blue-500 text-white rounded-xl">确定</button>
          </div>
        </div>
      </div>
    `;
    const input = modal.querySelector('[data-parent-answer]');
    modal.querySelector('[data-parent-ok]').addEventListener('click', () => {
      const val = parseInt(input.value, 10);
      if (val === q.answer) {
        modal.classList.add('hidden');
        if (callback) callback();
      } else {
        input.classList.add('border-red-500');
        input.placeholder = '再试一次';
      }
    });
    modal.querySelector('[data-parent-cancel]').addEventListener('click', () => modal.classList.add('hidden'));
  }

  // ---- 听故事：故事列表（封面+已读标签），进入后逐句气泡；翻到最后一页自动标记已读 ----
  function showStoryListView() {
    var container = document.getElementById('main-content');
    if (!container) return;
    currentView = 'story';
    var list = (typeof window !== 'undefined' && window.storyList) ? window.storyList : [];
    if (!list.length && window.mockStory) list = [window.mockStory];
    var readIds = typeof KiddoStore !== 'undefined' ? KiddoStore.getReadStoryIds() : [];
    container.innerHTML = '<div class="p-4"><div class="flex justify-between items-center mb-4">' +
      '<button type="button" data-story-back class="text-blue-600 font-bold">← 返回</button>' +
      '<h2 class="text-xl font-bold text-blue-600">📖 听故事</h2></div>' +
      '<p class="text-sm text-gray-600 mb-4">选一本绘本，点一句听一句～</p>' +
      '<div class="grid grid-cols-2 gap-4" data-story-list></div></div>';
    container.querySelector('[data-story-back]').addEventListener('click', function() { showView('home'); });
    var wrap = container.querySelector('[data-story-list]');
    list.forEach(function(story) {
      var id = story.id;
      var read = readIds.indexOf(id) !== -1;
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'block text-center p-4 rounded-2xl border-2 border-amber-200 bg-white shadow hover:border-amber-400 relative';
      card.innerHTML = '<span class="text-5xl block mb-2">' + (story.cover || '📖') + '</span>' +
        '<span class="font-bold text-gray-800">' + (story.title_cn || story.title || '故事') + '</span>' +
        (read ? '<span class="absolute top-2 right-2 text-green-600 font-bold">✅ 已读</span>' : '');
      card.addEventListener('click', function() { showStoryDetailView(story); });
      wrap.appendChild(card);
    });
  }

  function showStoryDetailView(story) {
    var container = document.getElementById('main-content');
    if (!container) return;
    var pages = story.pages || [];
    var readIds = typeof KiddoStore !== 'undefined' ? KiddoStore.getReadStoryIds() : [];
    container.innerHTML = '<div class="p-4 max-w-lg mx-auto">' +
      '<div class="flex justify-between items-center mb-4">' +
      '<button type="button" data-story-back class="text-blue-600 font-bold">← 返回</button>' +
      '<h2 class="text-xl font-bold text-blue-600">📖 ' + (story.title_cn || story.title || '') + '</h2></div>' +
      '<p class="text-sm text-gray-600 mb-4">点一句，听一句，读一句～</p>' +
      '<div class="space-y-3" data-story-bubbles></div>' +
      '<div class="mt-4 p-4 bg-amber-50 rounded-2xl border-2 border-amber-200 min-h-[3rem] text-gray-700 text-center" data-story-zh></div></div>';
    container.querySelector('[data-story-back]').addEventListener('click', function() { showStoryListView(); });
    var bubblesEl = container.querySelector('[data-story-bubbles]');
    var zhEl = container.querySelector('[data-story-zh]');
    zhEl.textContent = '点击上面的句子听发音、看中文';
    pages.forEach(function(p, i) {
      var bubble = document.createElement('button');
      bubble.type = 'button';
      bubble.className = 'block w-full text-left py-3 px-4 rounded-2xl bg-white border-2 border-gray-200 shadow-sm hover:border-amber-400 transition-colors';
      var emoji = p.image || '📝';
      var isLast = i === pages.length - 1;
      bubble.innerHTML = '<span class="text-[80px] leading-none block text-center mb-2">' + emoji + '</span><span class="text-lg font-bold text-gray-800">' + (p.en || '') + '</span>';
      bubble.addEventListener('click', function() {
        document.querySelectorAll('[data-story-bubbles] button').forEach(function(b) { b.classList.remove('border-amber-400', 'bg-amber-50'); });
        bubble.classList.add('border-amber-400', 'bg-amber-50');
        zhEl.textContent = p.cn || '';
        if (typeof KiddoLearn !== 'undefined' && KiddoLearn.speakTTS) KiddoLearn.speakTTS(p.en || '');
        if (isLast && story.id) {
          if (typeof KiddoStore !== 'undefined' && KiddoStore.addReadStoryId) KiddoStore.addReadStoryId(story.id);
          if (typeof window !== 'undefined' && window.userProgress) {
            window.userProgress.readStories = window.userProgress.readStories || [];
            if (window.userProgress.readStories.indexOf(story.id) === -1) window.userProgress.readStories.push(story.id);
            if (typeof window.saveProgress === 'function') window.saveProgress();
          }
        }
      });
      bubblesEl.appendChild(bubble);
    });
  }

  function showStoryView() {
    showStoryListView();
  }

  var MEMORY_MATCH_MIN = 6;
  var MEMORY_BONUS_APPLES = 3;

  function tryShowMemoryMatch() {
    var ids = (typeof KiddoStore !== 'undefined' && KiddoStore.getLearnedWords) ? KiddoStore.getLearnedWords() : [];
    if (ids.length < MEMORY_MATCH_MIN) {
      var modal = document.getElementById('parent-modal');
      if (!modal) return;
      modal.classList.remove('hidden');
      modal.innerHTML = '<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">' +
        '<div class="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">' +
        '<p class="text-lg text-gray-800 mb-2">你的单词卡片不够哦！😱</p>' +
        '<p class="text-gray-600 mb-4">目前只有 <strong>' + ids.length + '</strong> 张卡片。</p>' +
        '<p class="text-gray-600 mb-6">先去 [先学单词] 收集至少 6 个单词再来玩吧！💪</p>' +
        '<button type="button" data-memory-gate-ok class="w-full py-3 bg-purple-500 text-white rounded-xl font-bold">去收集单词</button>' +
        '</div></div>';
      modal.querySelector('[data-memory-gate-ok]').addEventListener('click', function() {
        modal.classList.add('hidden');
        showFlashcardView();
      });
      return;
    }
    showMemoryMatchView();
  }

  function showMemoryMatchView() {
    var container = document.getElementById('main-content');
    if (!container) return;
    currentView = 'memory';
    var vocab = (typeof window !== 'undefined' && window.getPlayableContent)
      ? window.getPlayableContent('vocabulary')
      : ((typeof window !== 'undefined' && window.vocabularyList) ? window.vocabularyList : []);
    var ids = (typeof KiddoStore !== 'undefined' && KiddoStore.getLearnedWords) ? KiddoStore.getLearnedWords() : [];
    var learned = ids.map(function(id) { return vocab.find(function(w) { return w.id === id; }); }).filter(Boolean);
    if (learned.length < MEMORY_MATCH_MIN) {
      tryShowMemoryMatch();
      return;
    }
    var pool = learned.length > MEMORY_MATCH_MIN ? shuffle(learned.slice()).slice(0, MEMORY_MATCH_MIN) : learned.slice();
    var cards = [];
    pool.forEach(function(w) {
      cards.push({ type: 'emoji', wordId: w.id, value: w.image || '📝', word: w.word });
      cards.push({ type: 'text', wordId: w.id, value: w.word, word: w.word });
    });
    cards = shuffle(cards);
    var startTime = Date.now();
    var matched = 0;
    var open = [];
    var locked = false;

    function shuffle(a) {
      var arr = a.slice();
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }

    container.innerHTML = '<div class="p-4">' +
      '<div class="flex justify-between items-center mb-4"><button type="button" data-memory-back class="text-blue-600 font-bold">← 返回</button><h2 class="text-xl font-bold text-purple-600">🧩 单词消消乐</h2></div>' +
      '<p class="text-center text-gray-600 mb-2">配对 图案 ↔ 单词，配对一个得 1 🍎，全部通关再得 ' + MEMORY_BONUS_APPLES + ' 🍎</p>' +
      '<div class="grid grid-cols-4 gap-2 max-w-sm mx-auto" data-memory-grid></div>' +
      '<div class="mt-4 text-center text-sm text-gray-500" data-memory-status></div>' +
      '</div>';
    container.querySelector('[data-memory-back]').addEventListener('click', function() { showView('home'); });
    var grid = container.querySelector('[data-memory-grid]');
    var statusEl = container.querySelector('[data-memory-status]');
    var cardEls = [];

    function renderCard(i) {
      var c = cards[i];
      var el = cardEls[i];
      if (!el) return;
      var isOpen = open.indexOf(i) !== -1 || (c.matched);
      el.innerHTML = isOpen ? '<span class="text-2xl">' + (c.type === 'emoji' ? c.value : c.value) + '</span>' : '?';
      el.className = 'aspect-square rounded-xl border-2 flex items-center justify-center font-bold text-gray-700 ' + (c.matched ? 'bg-green-100 border-green-400 opacity-75' : isOpen ? 'bg-white border-purple-300' : 'bg-purple-100 border-purple-200 cursor-pointer hover:bg-purple-200');
      el.style.pointerEvents = c.matched ? 'none' : 'auto';
    }

    function checkMatch() {
      if (open.length !== 2) return;
      var a = cards[open[0]];
      var b = cards[open[1]];
      if (a.wordId === b.wordId) {
        a.matched = true;
        b.matched = true;
        matched += 1;
        if (typeof KiddoLearn !== 'undefined' && KiddoLearn.speakTTS) KiddoLearn.speakTTS(a.word);
        if (typeof KiddoStore !== 'undefined') KiddoStore.addApples(1);
        if (typeof KiddoApp !== 'undefined' && KiddoApp.refreshApples) KiddoApp.refreshApples();
        open = [];
        locked = false;
        if (matched >= MEMORY_MATCH_MIN) {
          var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          if (typeof KiddoStore !== 'undefined') KiddoStore.addApples(MEMORY_BONUS_APPLES);
          if (typeof KiddoApp !== 'undefined' && KiddoApp.refreshApples) KiddoApp.refreshApples();
          grid.innerHTML = '';
          statusEl.parentElement.innerHTML = '<div class="text-center p-6">' +
            '<p class="text-3xl font-bold text-green-600 mb-2">🎉 闯关成功！</p>' +
            '<p class="text-gray-600 mb-4">用时 ' + elapsed + ' 秒 · 获得 ' + (MEMORY_MATCH_MIN + MEMORY_BONUS_APPLES) + ' 🍎</p>' +
            '<button type="button" data-memory-again class="py-3 px-6 bg-purple-500 text-white rounded-2xl font-bold">再玩一次</button>' +
            ' <button type="button" data-memory-back2 class="py-3 px-4 bg-gray-200 rounded-2xl font-bold">返回首页</button>' +
            '</div>';
          container.querySelector('[data-memory-again]').addEventListener('click', showMemoryMatchView);
          container.querySelector('[data-memory-back2]').addEventListener('click', function() { showView('home'); });
          return;
        }
      } else {
        locked = true;
        setTimeout(function() {
          open = [];
          locked = false;
          cards.forEach(function(_, idx) { renderCard(idx); });
        }, 1000);
      }
      cardEls.forEach(function(_, idx) { renderCard(idx); });
    }

    cards.forEach(function(_, i) {
      var el = document.createElement('button');
      el.type = 'button';
      el.dataset.index = i;
      cardEls.push(el);
      grid.appendChild(el);
      renderCard(i);
      el.addEventListener('click', function() {
        if (locked || open.indexOf(i) !== -1 || cards[i].matched) return;
        if (open.length === 2) return;
        open.push(i);
        renderCard(i);
        if (open.length === 2) checkMatch();
      });
    });
    statusEl.textContent = '已配对 0 / ' + MEMORY_MATCH_MIN;
    var statusInterval = setInterval(function() {
      if (matched >= MEMORY_MATCH_MIN) { clearInterval(statusInterval); return; }
      statusEl.textContent = '已配对 ' + matched + ' / ' + MEMORY_MATCH_MIN;
    }, 200);
  }

  function showFlashcardView() {
    const container = document.getElementById('main-content');
    if (!container) return;
    currentView = 'flashcard';
    container.innerHTML = `
      <div class="p-4">
        <div class="flex justify-between items-center mb-4">
          <button type="button" data-flash-back class="text-blue-600 font-bold">← 返回</button>
          <h2 class="text-xl font-bold text-amber-600">📝 先学单词</h2>
        </div>
        <div id="flashcard-area" class="min-h-[280px] bg-white rounded-2xl border-2 border-amber-200 p-4"></div>
      </div>
    `;
    container.querySelector('[data-flash-back]').addEventListener('click', () => showView('home'));
    const area = document.getElementById('flashcard-area');
    if (area && typeof KiddoLearn !== 'undefined' && KiddoLearn.runFlashcardView) {
      KiddoLearn.runFlashcardView(area, () => showView('home'));
    }
  }

  function showSentenceView() {
    const container = document.getElementById('main-content');
    if (!container) return;
    currentView = 'sentence';
    container.innerHTML = `
      <div class="p-4">
        <div class="flex justify-between items-center mb-4">
          <button type="button" data-sentence-back class="text-blue-600 font-bold">← 返回</button>
          <h2 class="text-xl font-bold text-sky-600">🗣️ 学句子</h2>
        </div>
        <div id="sentence-area" class="min-h-[200px] bg-white rounded-2xl border-2 border-sky-200 p-4"></div>
      </div>
    `;
    container.querySelector('[data-sentence-back]').addEventListener('click', () => showView('home'));
    const area = document.getElementById('sentence-area');
    if (area && typeof KiddoLearn !== 'undefined' && KiddoLearn.runSentenceView) {
      KiddoLearn.runSentenceView(area, () => showView('home'));
    }
  }

  // ---- 家长仪表盘 ----
  // ---- 学习足迹：全屏层，概览+单词墙+句型本+绘本架 ----
  function showDashboard() {
    var overlay = document.getElementById('dashboard-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'dashboard-overlay';
      overlay.className = 'fixed inset-0 z-[90] bg-white overflow-auto hidden';
      document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');
    var apples = typeof KiddoStore !== 'undefined' ? KiddoStore.getApples() : 0;
    var level = (typeof window !== 'undefined' && window.currentLevel) ? window.currentLevel : 'Level 1';
    var learnedIds = typeof KiddoStore !== 'undefined' ? KiddoStore.getLearnedWordIds() : [];
    var learnedSentIds = typeof KiddoStore !== 'undefined' ? KiddoStore.getLearnedSentenceIds() : [];
    var firstDate = typeof KiddoStore !== 'undefined' ? KiddoStore.getFirstLearnDate() : null;
    var days = firstDate ? Math.max(1, Math.floor((Date.now() - new Date(firstDate).getTime()) / 86400000)) : 0;
    // 严格按解锁进度：单词墙遍历全部已解锁单词，卡片数 = 解锁数
    var unlockedWords = (typeof window !== 'undefined' && window.getPlayableContent) ? window.getPlayableContent('vocabulary') : ((typeof window !== 'undefined' && window.vocabularyList) ? window.vocabularyList : []);
    var levelKey = level === 'Level 2' ? 'junior' : 'primary';
    var playableSentences = (typeof window !== 'undefined' && window.getPlayableContent) ? window.getPlayableContent('sentence') : ((typeof window !== 'undefined' && window.sentenceList) ? window.sentenceList : []);
    var sentFiltered = playableSentences.filter(function(s) { return s.level === levelKey; });
    var learnedSentences = sentFiltered.filter(function(s) { return learnedSentIds.indexOf(s.id) !== -1; });
    var storyList = (typeof window !== 'undefined' && window.storyList) ? window.storyList : [];
    if (!storyList.length && window.mockStory) storyList = [window.mockStory];
    var readStories = (typeof window !== 'undefined' && window.userProgress && Array.isArray(window.userProgress.readStories)) ? window.userProgress.readStories : [];
    if (readStories.length === 0 && typeof KiddoStore !== 'undefined' && KiddoStore.getReadStoryIds) {
      var fromStore = KiddoStore.getReadStoryIds();
      if (fromStore.length) { readStories = fromStore.slice(); window.userProgress.readStories = readStories; if (typeof window.saveProgress === 'function') window.saveProgress(); }
    }
    overlay.innerHTML = '<div class="p-4 max-w-4xl mx-auto pb-12">' +
      '<div class="flex justify-between items-center mb-4">' +
      '<h2 class="text-xl font-bold text-indigo-600">📊 学习足迹</h2>' +
      '<button type="button" data-dashboard-close class="py-2 px-4 bg-gray-200 rounded-xl font-bold">关闭</button>' +
      '</div>' +
      '<div class="grid grid-cols-3 gap-4 mb-6">' +
      '<div class="bg-blue-50 rounded-xl p-4 text-center"><p class="text-sm text-gray-600">学习天数</p><p class="text-2xl font-bold text-blue-600">' + days + ' 天</p></div>' +
      '<div class="bg-green-50 rounded-xl p-4 text-center"><p class="text-sm text-gray-600">总苹果数</p><p class="text-2xl font-bold text-green-600">' + apples + '</p></div>' +
      '<div class="bg-amber-50 rounded-xl p-4 text-center"><p class="text-sm text-gray-600">当前等级</p><p class="text-lg font-bold text-amber-600">' + (level === 'Level 2' ? 'Level 2' : 'Level 1') + '</p></div>' +
      '</div>' +
      '<h3 class="font-bold text-gray-800 mb-2">单词墙</h3>' +
      '<div class="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-6" data-dashboard-words></div>' +
      '<h3 class="font-bold text-gray-800 mb-2">句型本（已学）</h3>' +
      '<div class="bg-sky-50 rounded-xl p-4 mb-6 min-h-[80px]" data-dashboard-sentences></div>' +
      '<h3 class="font-bold text-gray-800 mb-2">绘本架</h3>' +
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-4" data-dashboard-stories></div>' +
      '</div>';
    var wordsEl = overlay.querySelector('[data-dashboard-words]');
    unlockedWords.forEach(function(w) {
      var learned = learnedIds.indexOf(w.id) !== -1;
      var span = document.createElement('span');
      span.className = 'vocab-card inline-flex items-center justify-center w-10 h-10 rounded-lg text-xl ' + (learned ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-400');
      span.title = w.word + ' ' + w.translation;
      span.textContent = learned ? (w.image || '✓') : '❓';
      wordsEl.appendChild(span);
    });
    var sentEl = overlay.querySelector('[data-dashboard-sentences]');
    sentEl.innerHTML = '';
    if (learnedSentences.length) {
      learnedSentences.forEach(function(s) {
        var item = document.createElement('div');
        item.className = 'py-2 px-3 border-b border-sky-200 last:border-b-0 text-gray-700';
        item.innerHTML = '<span class="font-medium text-gray-800">' + (s.text || '') + '</span> — <span class="text-gray-600">' + (s.translation || '') + '</span>';
        sentEl.appendChild(item);
      });
    } else {
      sentEl.innerHTML = '<p class="text-gray-500">暂无已学句子</p>';
    }
    var storiesEl = overlay.querySelector('[data-dashboard-stories]');
    storiesEl.innerHTML = '';
    if (readStories.length === 0) {
      storiesEl.innerHTML = '<p class="col-span-full text-gray-500 text-center py-6">你还没有读过绘本哦，快去听故事吧！</p>';
    } else {
      storyList.forEach(function(story) {
        if (readStories.indexOf(story.id) === -1) return;
        var card = document.createElement('div');
        card.className = 'text-center p-3 rounded-xl border-2 border-green-300 bg-green-50';
        card.innerHTML = '<span class="text-4xl block mb-1">' + (story.cover || '📖') + '</span><span class="text-sm font-bold text-gray-800">' + (story.title_cn || story.title || '') + '</span><span class="block text-green-600 text-xs">✅ 已读</span>';
        storiesEl.appendChild(card);
      });
    }
    overlay.querySelector('[data-dashboard-close]').addEventListener('click', function() { overlay.classList.add('hidden'); });
  }

  function showParentDashboard() {
    const stats = KiddoStore.getLearnStats();
    const learnedIds = KiddoStore.getLearnedWordIds();
    const wrongIds = KiddoStore.getWrongWordIds();
    const list = (typeof window !== 'undefined' && window.getPlayableContent) ? window.getPlayableContent('vocabulary') : ((typeof window !== 'undefined' && window.vocabularyList) ? window.vocabularyList : []);
    const learnedWords = learnedIds.map(id => list.find(w => w.id === id)).filter(Boolean);
    const wrongWords = wrongIds.map(id => list.find(w => w.id === id)).filter(Boolean);

    const container = document.getElementById('main-content');
    if (!container) return;
    currentView = 'parent';
    container.innerHTML = `
      <div class="p-4 max-w-lg mx-auto">
        <div class="flex justify-between items-center mb-4">
          <button type="button" data-parent-back class="text-blue-600 font-bold">← 返回</button>
          <h2 class="text-xl font-bold text-gray-800">📊 家长仪表盘</h2>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-6">
          <div class="bg-blue-50 rounded-xl p-4">
            <p class="text-sm text-gray-600">今日学习</p>
            <p class="text-2xl font-bold text-blue-600">${Math.round(stats.today)} 分钟</p>
          </div>
          <div class="bg-green-50 rounded-xl p-4">
            <p class="text-sm text-gray-600">累计学习</p>
            <p class="text-2xl font-bold text-green-600">${Math.round(stats.total)} 分钟</p>
          </div>
        </div>
        <div class="mb-4">
          <p class="font-bold text-gray-700 mb-2">已学会的单词</p>
          <p class="text-sm text-gray-600">${learnedWords.map(w => w.word).join(', ') || '暂无'}</p>
        </div>
        <div>
          <p class="font-bold text-gray-700 mb-2">需要复习的错词</p>
          <p class="text-sm text-gray-600">${wrongWords.map(w => w.word).join(', ') || '暂无'}</p>
        </div>
        <button type="button" data-parent-back-bottom class="mt-4 w-full py-2 bg-gray-200 rounded-xl font-bold">返回首页</button>
      </div>
    `;
    container.querySelector('[data-parent-back]').addEventListener('click', () => showView('home'));
    const backBottom = container.querySelector('[data-parent-back-bottom]');
    if (backBottom) backBottom.addEventListener('click', () => showView('home'));
  }

  function showView(name) {
    currentView = name;
    const container = document.getElementById('main-content');
    const petContainer = document.getElementById('pet-container');
    if (!container) return;

    if (name === 'home') {
      var level = (typeof window !== 'undefined' && window.currentLevel) ? window.currentLevel : 'Level 1';
      var learnedCount = (typeof KiddoStore !== 'undefined' && KiddoStore.getLearnedWords) ? KiddoStore.getLearnedWords().length : 0;
      var matchUnlocked = learnedCount >= 6;
      container.innerHTML = `
        <div class="p-4 text-center">
          <h1 class="text-2xl md:text-3xl font-bold text-blue-600 mb-2">🌟 奇妙世界 Kiddo World</h1>
          <p class="text-gray-600 mb-2">学习英语，喂饱小宠物！</p>
          <div class="flex justify-center gap-2 mb-4">
            <span class="text-sm text-gray-500">年级：</span>
            <button type="button" data-level="Level 1" class="px-3 py-1 rounded-xl text-sm font-bold ${level === 'Level 1' ? 'bg-blue-500 text-white' : 'bg-gray-200'}">Level 1</button>
            <button type="button" data-level="Level 2" class="px-3 py-1 rounded-xl text-sm font-bold ${level === 'Level 2' ? 'bg-blue-500 text-white' : 'bg-gray-200'}">Level 2</button>
          </div>
          <div class="grid grid-cols-2 gap-3 max-w-md mx-auto mb-3">
            <button type="button" data-nav="flashcard" class="py-4 px-4 bg-amber-400 text-white rounded-2xl font-bold shadow-lg text-lg">📝 先学单词</button>
            <button type="button" data-nav="sentence" class="py-4 px-4 bg-sky-500 text-white rounded-2xl font-bold shadow-lg text-lg">🗣️ 学句子</button>
            <button type="button" data-nav="learn" class="py-4 px-4 bg-green-500 text-white rounded-2xl font-bold shadow-lg text-lg">📚 去闯关</button>
            <button type="button" data-nav="story" class="py-4 px-4 bg-amber-500 text-white rounded-2xl font-bold shadow-lg text-lg">📖 听故事</button>
            <button type="button" data-feed-pet class="py-4 px-4 bg-orange-400 text-white rounded-2xl font-bold shadow-lg text-lg">🍎 喂宠物</button>
            <button type="button" data-nav="dashboard" class="py-4 px-4 bg-indigo-500 text-white rounded-2xl font-bold shadow-lg text-lg">📊 学习足迹</button>
          </div>
          <button type="button" data-nav="memory" class="w-full max-w-md mx-auto py-3 px-4 rounded-2xl font-bold shadow-lg text-lg block ${matchUnlocked ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white' : 'bg-gray-300 text-gray-500 opacity-75'}">
            ${matchUnlocked ? '🧩 单词消消乐 · 开始挑战' : '🔒 单词消消乐 (收集至少 6 个单词解锁)'}
          </button>
        </div>
      `;
      container.querySelectorAll('[data-nav]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var nav = btn.dataset.nav;
          if (nav === 'learn') showLearnView();
          else if (nav === 'story') showStoryView();
          else if (nav === 'flashcard') showFlashcardView();
          else if (nav === 'sentence') showSentenceView();
          else if (nav === 'dashboard') showDashboard();
          else if (nav === 'memory') tryShowMemoryMatch();
        });
      });
      container.querySelectorAll('[data-level]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var l = btn.dataset.level;
          if (typeof window !== 'undefined') window.currentLevel = l;
          showView('home');
        });
      });
      var feedBtn = container.querySelector('[data-feed-pet]');
      if (feedBtn) feedBtn.addEventListener('click', function() {
        if (typeof KiddoPet !== 'undefined' && KiddoPet.renderPetPage) {
          var main = document.getElementById('main-content');
          if (main) KiddoPet.renderPetPage(main, function() { showView('home'); });
        }
      });
      if (petContainer && typeof KiddoPet !== 'undefined') {
        KiddoPet.initPetDOM(petContainer, refreshApples, function() {
          var main = document.getElementById('main-content');
          if (main && KiddoPet.renderPetPage) KiddoPet.renderPetPage(main, function() { showView('home'); });
        });
      }
    } else if (name === 'learn') {
      showLearnView();
    }
    refreshApples();
  }

  function showLearnView() {
    const container = document.getElementById('main-content');
    if (!container) return;
    currentView = 'learn';
    container.innerHTML = `
      <div class="p-4">
        <div class="flex justify-between items-center mb-4">
          <button type="button" data-back class="text-blue-600 font-bold">← 返回</button>
          <h2 class="text-xl font-bold text-gray-800">学习区</h2>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-6">
          <button type="button" data-game="listen" class="py-4 bg-blue-100 rounded-xl font-bold text-blue-700">👂 听</button>
          <button type="button" data-game="speak" class="py-4 bg-green-100 rounded-xl font-bold text-green-700">🎤 说</button>
          <button type="button" data-game="read" class="py-4 bg-amber-100 rounded-xl font-bold text-amber-700">👀 读</button>
          <button type="button" data-game="write" class="py-4 bg-purple-100 rounded-xl font-bold text-purple-700">✏️ 写</button>
        </div>
        <div id="game-area" class="min-h-[200px] bg-white rounded-xl border-2 border-gray-200 p-4"></div>
      </div>
    `;
    container.querySelector('[data-back]').addEventListener('click', () => showView('home'));
    const gameArea = document.getElementById('game-area');
    if (!gameArea) return;
    const run = (type) => {
      if (type === 'listen') KiddoLearn.runListenGame(gameArea, () => run('listen'));
      else if (type === 'speak') KiddoLearn.runSpeakGame(gameArea, () => run('speak'));
      else if (type === 'read') KiddoLearn.runReadGame(gameArea, () => run('read'));
      else if (type === 'write') KiddoLearn.runWriteGame(gameArea, () => run('write'));
    };
    container.querySelector('[data-game="listen"]').addEventListener('click', () => run('listen'));
    container.querySelector('[data-game="speak"]').addEventListener('click', () => run('speak'));
    container.querySelector('[data-game="read"]').addEventListener('click', () => run('read'));
    container.querySelector('[data-game="write"]').addEventListener('click', () => run('write'));
  }

  function updateProgressDisplay() {
    const totalWords = (typeof window !== 'undefined' && window.vocabularyList) ? window.vocabularyList.length : 0;
    const totalSentences = (typeof window !== 'undefined' && window.sentenceList) ? window.sentenceList.length : 0;
    const wordIndex = (typeof window !== 'undefined' && window.userProgress) ? (window.userProgress.wordIndex || 0) : 0;
    const sentenceIndex = (typeof window !== 'undefined' && window.userProgress) ? (window.userProgress.sentenceIndex || 0) : 0;
    const wordEl = document.querySelector('[data-word-progress]');
    const sentenceEl = document.querySelector('[data-sentence-progress]');
    if (wordEl) wordEl.textContent = '📖 单词解锁: ' + wordIndex + ' / ' + totalWords;
    if (sentenceEl) sentenceEl.textContent = '🗣️ 句子解锁: ' + sentenceIndex + ' / ' + totalSentences;
  }

  function refreshApples() {
    const n = typeof KiddoStore !== 'undefined' ? KiddoStore.getApples() : 0;
    const el = document.querySelector('[data-apple-count]');
    if (el) el.textContent = n;
    updateProgressDisplay();
    const backpack = document.querySelector('[data-backpack]');
    if (backpack) {
      const label = document.createElement('span');
      label.className = 'text-xs font-bold text-gray-600 mb-1 block';
      label.textContent = '背包';
      const wrap = document.createElement('div');
      wrap.className = 'flex flex-wrap gap-0.5 justify-center';
      for (let i = 0; i < Math.min(n, 10); i++) {
        const apple = document.createElement('span');
        apple.className = 'inline-block text-2xl cursor-grab select-none';
        apple.textContent = '🍎';
        apple.draggable = true;
        apple.dataset.kind = 'apple';
        apple.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', 'apple');
          e.dataTransfer.effectAllowed = 'move';
        });
        wrap.appendChild(apple);
      }
      if (n > 10) {
        const more = document.createElement('span');
        more.className = 'text-sm text-gray-600';
        more.textContent = `+${n - 10}`;
        wrap.appendChild(more);
      }
      backpack.innerHTML = '';
      backpack.appendChild(label);
      backpack.appendChild(wrap);
    }
  }

  function init() {
    var container = document.getElementById('main-content');
    if (!container) return;
    if (typeof KiddoStore === 'undefined' || typeof KiddoPet === 'undefined' || typeof KiddoLearn === 'undefined') {
      container.innerHTML = '<div class="p-4 text-center text-red-600">请按顺序加载：data.js → store.js → pet.js → learn.js → app.js</div>';
      return;
    }
    if (!window.vocabularyList || !window.vocabularyList.length) {
      container.innerHTML = '<div class="p-4 text-center text-red-600">词汇表未加载，请先加载 data.js</div>';
      return;
    }
    if (typeof KiddoStore !== 'undefined' && KiddoStore.getFirstLearnDate && !KiddoStore.getFirstLearnDate()) KiddoStore.setFirstLearnDate(new Date().toISOString().slice(0, 10));
    showView('home');

    var lockBtn = document.getElementById('parent-lock');
    if (lockBtn) {
      lockBtn.addEventListener('click', function() { alert('家长控制功能开发中...'); });
    }
    refreshApples();
  }

  // ---------- 防沉迷系统配置 ----------
  const STUDY_TIME = 20 * 60 * 1000;  // 学习时间：20 分钟 (毫秒)
  const REST_TIME = 2 * 60;            // 休息时间：2 分钟 (秒)

  function startStudyTimer() {
    if (typeof window !== 'undefined' && window.studyTimer) clearTimeout(window.studyTimer);
    window.studyTimer = setTimeout(function () {
      showRestOverlay();
    }, STUDY_TIME);
  }

  function showRestOverlay() {
    var overlay = document.getElementById('break-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex', 'items-center', 'justify-center', 'bg-black/90');
    var secondsLeft = REST_TIME;

    function renderContent() {
      var mins = Math.floor(secondsLeft / 60);
      var secs = secondsLeft % 60;
      var timeString = mins + ':' + String(secs).padStart(2, '0');
      overlay.innerHTML = '<div class="text-center text-white">' +
        '<div class="text-6xl mb-4">👀 休息一下</div>' +
        '<div class="text-2xl mb-8">你已经学习 20 分钟啦，休息 2 分钟再玩吧！</div>' +
        '<div class="text-4xl font-mono font-bold text-yellow-300">剩余 ' + timeString + '</div>' +
        '<div class="text-8xl mt-8">🌙</div></div>';
    }

    renderContent();
    var countdownInterval = setInterval(function () {
      secondsLeft--;
      renderContent();
      if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        startStudyTimer();
      }
    }, 1000);
  }

  global.KiddoApp = {
    showView,
    showStoryView,
    showStoryListView,
    showStoryDetailView,
    showParentGate,
    showParentDashboard,
    showDashboard,
    refreshApples,
    updateProgressDisplay,
    init,
    mockStory,
    startStudyTimer,
    showRestOverlay
  };

  // 保证在 DOM 加载完成后才渲染，适配 file:// 直接打开
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
      startStudyTimer();
    });
  } else {
    setTimeout(function () {
      init();
      startStudyTimer();
    }, 0);
  }
})(typeof window !== 'undefined' ? window : this);
