/**
 * Kiddo World - 本地存储模块
 * 自动保存：宠物状态、苹果数、学习时长、学会/错词
 */
(function (global) {
  const KEY = 'kiddo_world_save';

  const defaults = {
    apples: 0,
    totalLearnMinutes: 0,
    lastActiveAt: null,
    learnedWordIds: [],
    wrongWordIds: [],
    todayMinutes: 0,
    todayDate: null,
    userProgress: {
      primarySentenceIndex: 0,
      juniorSentenceIndex: 0,
      learnedWords: [],
      currentPetId: 'a',
      petXp: 0,
      petStage: 0
    },
    collectedPets: [],   // 已毕业收集的宠物 id 列表 ['a','b',...]
    readStoryIds: [],
    learnedSentenceIds: []
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(defaults);
      const data = JSON.parse(raw);
      return mergeDeep(clone(defaults), data);
    } catch (e) {
      return clone(defaults);
    }
  }

  function save(data) {
    try {
      data.lastActiveAt = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function mergeDeep(target, source) {
    const out = clone(target);
    for (const key of Object.keys(source || {})) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        out[key] = mergeDeep(out[key] || {}, source[key]);
      } else {
        out[key] = source[key];
      }
    }
    return out;
  }

  function addApples(n) {
    const data = load();
    data.apples = (data.apples || 0) + n;
    save(data);
    return data.apples;
  }

  function useApple() {
    const data = load();
    if ((data.apples || 0) < 1) return false;
    data.apples--;
    save(data);
    return true;
  }

  function getApples() {
    return load().apples || 0;
  }

  function addLearnMinutes(minutes) {
    const data = load();
    const today = new Date().toDateString();
    data.totalLearnMinutes = (data.totalLearnMinutes || 0) + minutes;
    if (data.todayDate !== today) {
      data.todayDate = today;
      data.todayMinutes = 0;
    }
    data.todayMinutes = (data.todayMinutes || 0) + minutes;
    save(data);
    return { total: data.totalLearnMinutes, today: data.todayMinutes };
  }

  function getLearnStats() {
    const data = load();
    const today = new Date().toDateString();
    if (data.todayDate !== today) return { total: data.totalLearnMinutes || 0, today: 0 };
    return { total: data.totalLearnMinutes || 0, today: data.todayMinutes || 0 };
  }

  function addLearnedWordId(id) {
    const data = load();
    data.learnedWordIds = data.learnedWordIds || [];
    if (!data.learnedWordIds.includes(id)) data.learnedWordIds.push(id);
    data.userProgress = data.userProgress || {};
    data.userProgress.learnedWords = data.userProgress.learnedWords || [];
    if (!data.userProgress.learnedWords.includes(id)) data.userProgress.learnedWords.push(id);
    save(data);
  }

  function addLearnedWord(id) {
    const data = load();
    data.userProgress = data.userProgress || {};
    data.userProgress.learnedWords = data.userProgress.learnedWords || [];
    if (!data.userProgress.learnedWords.includes(id)) data.userProgress.learnedWords.push(id);
    data.learnedWordIds = data.learnedWordIds || [];
    if (!data.learnedWordIds.includes(id)) data.learnedWordIds.push(id);
    save(data);
  }

  function getLearnedWords() {
    const data = load();
    const up = data.userProgress || {};
    const fromProgress = up.learnedWords || [];
    const fromIds = data.learnedWordIds || [];
    const set = {};
    fromProgress.forEach(function(id) { set[id] = true; });
    fromIds.forEach(function(id) { set[id] = true; });
    return Object.keys(set).map(Number);
  }

  function addWrongWordId(id) {
    const data = load();
    data.wrongWordIds = data.wrongWordIds || [];
    if (!data.wrongWordIds.includes(id)) data.wrongWordIds.push(id);
    save(data);
  }

  function getLearnedWordIds() {
    return load().learnedWordIds || [];
  }

  function getWrongWordIds() {
    return load().wrongWordIds || [];
  }

  function getLastActiveAt() {
    return load().lastActiveAt || null;
  }

  function getSentenceIndex(levelKey) {
    const data = load();
    const up = data.userProgress || {};
    const key = levelKey === 'junior' ? 'juniorSentenceIndex' : 'primarySentenceIndex';
    return Math.max(0, parseInt(up[key], 10) || 0);
  }

  function setSentenceIndex(levelKey, index) {
    const data = load();
    data.userProgress = data.userProgress || {};
    const key = levelKey === 'junior' ? 'juniorSentenceIndex' : 'primarySentenceIndex';
    data.userProgress[key] = Math.max(0, index);
    save(data);
    return data.userProgress[key];
  }

  function addReadStoryId(id) {
    const data = load();
    data.readStoryIds = data.readStoryIds || [];
    if (data.readStoryIds.indexOf(id) === -1) data.readStoryIds.push(id);
    save(data);
  }

  function getReadStoryIds() {
    return load().readStoryIds || [];
  }

  function addLearnedSentenceId(id) {
    const data = load();
    data.learnedSentenceIds = data.learnedSentenceIds || [];
    if (data.learnedSentenceIds.indexOf(id) === -1) data.learnedSentenceIds.push(id);
    save(data);
  }

  function getLearnedSentenceIds() {
    return load().learnedSentenceIds || [];
  }

  function getFirstLearnDate() {
    const data = load();
    return data.firstLearnDate || null;
  }

  function setFirstLearnDate(dateStr) {
    const data = load();
    data.firstLearnDate = dateStr;
    save(data);
  }

  function getCurrentPetState() {
    const data = load();
    const up = data.userProgress || {};
    return {
      currentPetId: up.currentPetId || 'a',
      petXp: Math.max(0, parseInt(up.petXp, 10) || 0),
      petStage: Math.max(0, Math.min(4, parseInt(up.petStage, 10) || 0))
    };
  }

  function setCurrentPetState(updates) {
    const data = load();
    data.userProgress = data.userProgress || {};
    if (updates.currentPetId !== undefined) data.userProgress.currentPetId = updates.currentPetId;
    if (updates.petXp !== undefined) data.userProgress.petXp = Math.max(0, updates.petXp);
    if (updates.petStage !== undefined) data.userProgress.petStage = Math.max(0, Math.min(4, updates.petStage));
    save(data);
    return getCurrentPetState();
  }

  function getCollectedPets() {
    return load().collectedPets || [];
  }

  function addCollectedPet(id) {
    const data = load();
    data.collectedPets = data.collectedPets || [];
    if (data.collectedPets.indexOf(id) === -1) data.collectedPets.push(id);
    save(data);
  }

  function feedPet() {
    if ((load().apples || 0) < 1) return { ok: false };
    useApple();
    const state = getCurrentPetState();
    let xp = state.petXp + 10;
    const stage = state.petStage;
    if (xp >= 100) {
      const newStage = stage + 1;
      xp = 0;
      if (newStage >= 5) {
        addCollectedPet(state.currentPetId);
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        const idx = letters.indexOf(state.currentPetId);
        const nextId = idx >= 0 && idx < 25 ? letters[idx + 1] : null;
        setCurrentPetState({ currentPetId: nextId || 'a', petStage: 0, petXp: 0 });
        return { ok: true, graduated: true, petId: state.currentPetId, nextPetId: nextId || 'a', allDone: getCollectedPets().length >= 26 };
      }
      setCurrentPetState({ petStage: newStage, petXp: 0 });
      return { ok: true, graduated: false, leveledUp: true, newStage: newStage };
    }
    setCurrentPetState({ petXp: xp });
    return { ok: true, graduated: false, leveledUp: false };
  }

  global.KiddoStore = {
    load,
    save,
    addApples,
    useApple,
    getApples,
    addLearnMinutes,
    getLearnStats,
    addLearnedWordId,
    addWrongWordId,
    getLearnedWordIds,
    getLearnedWords,
    addLearnedWord,
    getWrongWordIds,
    getLastActiveAt,
    getSentenceIndex,
    setSentenceIndex,
    addReadStoryId,
    getReadStoryIds,
    addLearnedSentenceId,
    getLearnedSentenceIds,
    getFirstLearnDate,
    setFirstLearnDate,
    getCurrentPetState,
    setCurrentPetState,
    getCollectedPets,
    addCollectedPet,
    feedPet,
    defaults
  };
})(typeof window !== 'undefined' ? window : this);
