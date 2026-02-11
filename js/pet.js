/**
 * Kiddo World - 宠物养成模块
 * 宠物集库：26 只 A-Z 养成、进化、收集
 */
(function (global) {
  function playLevelUpSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 523;
      o.type = 'sine';
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  }

  function getPetList() {
    return (typeof window !== 'undefined' && window.petList) ? window.petList : [];
  }

  function renderPetPage(container, onClose) {
    if (!container) return;
    const list = getPetList();
    const state = typeof KiddoStore !== 'undefined' ? KiddoStore.getCurrentPetState() : { currentPetId: 'a', petXp: 0, petStage: 0 };
    const collected = typeof KiddoStore !== 'undefined' ? KiddoStore.getCollectedPets() : [];
    const apples = typeof KiddoStore !== 'undefined' ? KiddoStore.getApples() : 0;
    const current = list.find(function(p) { return p.id === state.currentPetId; }) || list[0];
    const xp = state.petXp;
    const stage = state.petStage;
    const stageEmoji = current && current.stages && current.stages[stage] ? current.stages[stage] : '🥚';

    container.innerHTML = '<div class="p-4 flex flex-col md:flex-row gap-4 min-h-[500px]">' +
      '<div class="flex-shrink-0 md:w-1/2 lg:w-1/3 bg-amber-50 rounded-2xl border-2 border-amber-200 p-4">' +
      '<div class="flex justify-between items-center mb-2"><button type="button" data-pet-back class="text-blue-600 font-bold">← 返回</button><h2 class="text-lg font-bold text-amber-800">养成中心</h2></div>' +
      '<div class="text-center py-4">' +
      '<div class="text-7xl mb-2" data-pet-emoji>' + stageEmoji + '</div>' +
      '<p class="text-xl font-bold text-gray-800">' + (current ? current.name_cn || current.name : '') + '</p>' +
      '<p class="text-sm text-gray-500">' + (current ? current.name : '') + ' · 阶段 ' + (stage + 1) + '/5</p>' +
      '<p class="text-xs text-gray-500 mt-1">' + (current ? current.desc : '') + '</p>' +
      '<div class="mt-3"><div class="h-4 bg-gray-200 rounded-full overflow-hidden"><div class="h-full bg-green-500 rounded-full transition-all" data-pet-xp-bar style="width:' + xp + '%"></div></div><p class="text-xs text-gray-600 mt-0.5" data-pet-xp-text>XP ' + xp + ' / 100</p></div>' +
      '<button type="button" data-pet-feed class="mt-4 py-3 px-6 bg-orange-500 text-white rounded-2xl font-bold shadow">🍎 喂食 (+10 XP)</button>' +
      '<p class="text-xs text-gray-500 mt-2">苹果: ' + apples + '</p>' +
      '</div></div>' +
      '<div class="flex-1">' +
      '<h3 class="text-lg font-bold text-gray-800 mb-2">图鉴 A-Z</h3>' +
      '<div class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2" data-pet-grid></div>' +
      '</div></div>';

    const grid = container.querySelector('[data-pet-grid]');
    list.forEach(function(p) {
      const isCollected = collected.indexOf(p.id) !== -1;
      const isCurrent = p.id === state.currentPetId;
      const emoji = isCollected ? (p.stages && p.stages[4] ? p.stages[4] : '✅') : (isCurrent && p.stages ? p.stages[stage] : '🔒');
      const card = document.createElement('div');
      card.className = 'aspect-square rounded-xl border-2 flex flex-col items-center justify-center text-center p-1 ' +
        (isCollected ? 'bg-green-100 border-green-400' : isCurrent ? 'bg-amber-100 border-amber-500 ring-2 ring-amber-400' : 'bg-gray-200 border-gray-300');
      card.innerHTML = '<span class="text-2xl">' + emoji + '</span><span class="text-xs font-bold text-gray-700 truncate w-full">' + (isCollected || isCurrent ? (p.name_cn || p.name) : '?') + '</span>';
      grid.appendChild(card);
    });

    container.querySelector('[data-pet-back]').addEventListener('click', function() { if (onClose) onClose(); });

    container.querySelector('[data-pet-feed]').addEventListener('click', function() {
      if (typeof KiddoStore === 'undefined' || !KiddoStore.feedPet) return;
      var result = KiddoStore.feedPet();
      if (!result.ok) return;
      if (result.graduated) {
        const name = (current && (current.name_cn || current.name)) || '';
        if (result.allDone) {
          alert('🎉 恭喜！你已集齐全部 26 只神奇动物！\n获得【终极守护神】证书！');
        } else {
          alert('恭喜集齐 ' + name + '！\n下一只宠物已开启～');
        }
        if (typeof KiddoApp !== 'undefined' && KiddoApp.refreshApples) KiddoApp.refreshApples();
        renderPetPage(container, onClose);
        return;
      }
      if (result.leveledUp) playLevelUpSound();
      if (typeof KiddoApp !== 'undefined' && KiddoApp.refreshApples) KiddoApp.refreshApples();
      renderPetPage(container, onClose);
    });
  }

  function getFloatingPetData() {
    const state = typeof KiddoStore !== 'undefined' ? KiddoStore.getCurrentPetState() : { currentPetId: 'a', petXp: 0, petStage: 0 };
    const list = getPetList();
    const current = list.find(function(p) { return p.id === state.currentPetId; }) || list[0];
    const emoji = (current && current.stages && current.stages[state.petStage]) ? current.stages[state.petStage] : '🥚';
    return { state: state, current: current, emoji: emoji, xp: state.petXp };
  }

  function initPetDOM(container, onFeed, onOpenCollection) {
    if (!container) return;
    const data = getFloatingPetData();
    const xp = data.xp;
    container.innerHTML =
      '<div class="pet-area flex flex-col items-center justify-center cursor-pointer" data-pet-area title="点击打开宠物集库">' +
      '<div class="pet-sprite text-6xl md:text-7xl select-none transition transform" data-pet-sprite>' + data.emoji + '</div>' +
      '<div class="mt-2 w-24 h-3 bg-gray-200 rounded-full overflow-hidden">' +
      '<div class="h-full bg-green-500 rounded-full transition-all duration-500" data-pet-xp-bar style="width:' + xp + '%"></div>' +
      '</div>' +
      '<p class="text-xs text-gray-600 mt-1" data-pet-xp-text>XP ' + xp + ' / 100</p>' +
      '</div>';
    const sprite = container.querySelector('[data-pet-sprite]');
    const bar = container.querySelector('[data-pet-xp-bar]');
    const text = container.querySelector('[data-pet-xp-text]');

    function refreshPetUI() {
      const d = getFloatingPetData();
      if (sprite) sprite.textContent = d.emoji;
      if (bar) bar.style.width = d.xp + '%';
      if (text) text.textContent = 'XP ' + d.xp + ' / 100';
    }

    container.refreshPetUI = refreshPetUI;

    const petArea = container.querySelector('[data-pet-area]');
    if (petArea) {
      petArea.addEventListener('click', function() {
        if (typeof onOpenCollection === 'function') onOpenCollection();
      });
      petArea.addEventListener('dragover', function(e) { e.preventDefault(); petArea.classList.add('ring-4', 'ring-yellow-300'); });
      petArea.addEventListener('dragleave', function() { petArea.classList.remove('ring-4', 'ring-yellow-300'); });
      petArea.addEventListener('drop', function(e) {
        e.preventDefault();
        petArea.classList.remove('ring-4', 'ring-yellow-300');
        const kind = e.dataTransfer.getData('text/plain');
        if (kind === 'apple' && typeof KiddoStore !== 'undefined' && KiddoStore.feedPet) {
          const result = KiddoStore.feedPet();
          if (result.ok) {
            if (onFeed) onFeed();
            refreshPetUI();
            if (sprite) {
              sprite.classList.add('animate-spin');
              setTimeout(function() { sprite.classList.remove('animate-spin'); }, 800);
            }
            if (result.graduated) {
              const list = getPetList();
              const grad = list.find(function(p) { return p.id === result.petId; });
              const name = grad ? (grad.name_cn || grad.name) : '';
              if (result.allDone) alert('🎉 恭喜！你已集齐全部 26 只神奇动物！\n获得【终极守护神】证书！');
              else alert('恭喜集齐 ' + name + '！\n下一只宠物已开启～');
              refreshPetUI();
            } else if (result.leveledUp) playLevelUpSound();
          }
        }
      });
    }
    return refreshPetUI;
  }

  global.KiddoPet = {
    initPetDOM,
    renderPetPage,
    getPetList,
    playLevelUpSound
  };
})(typeof window !== 'undefined' ? window : this);
