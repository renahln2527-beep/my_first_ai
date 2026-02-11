const fs = require('fs');
const s = fs.readFileSync('data.js', 'utf8');

// vocabularyList
const vStart = s.indexOf('window.vocabularyList = [');
const vEnd = s.indexOf('];\n\n// 句子表', vStart);
const vocabStr = s.slice(vStart, vEnd);
const vocabIdMatches = vocabStr.match(/\{\s*id:\s*(\d+),/g) || [];
const vocabCount = vocabIdMatches.length;

let primaryMin = Infinity, primaryMax = -1, juniorMin = Infinity, juniorMax = -1;
const idLevelRe = /\{\s*id:\s*(\d+),[\s\S]*?level:\s*"(primary|junior)"/g;
let m;
while ((m = idLevelRe.exec(vocabStr)) !== null) {
  const id = parseInt(m[1], 10);
  if (m[2] === 'primary') {
    if (id < primaryMin) primaryMin = id;
    if (id > primaryMax) primaryMax = id;
  } else {
    if (id < juniorMin) juniorMin = id;
    if (id > juniorMax) juniorMax = id;
  }
}

const hasImage = (vocabStr.match(/\bimage:\s*[^,\n]+/g) || []).length;
const hasSentence = (vocabStr.match(/\bsentence:\s*[^,\n]+/g) || []).length;
const missing = [];
const entryRe = /\{\s*id:\s*(\d+),[\s\S]*?\},?\s*(?=\n\s*[\{\/]|\n\])/g;
let em;
let idx = 0;
while ((em = entryRe.exec(vocabStr)) !== null && missing.length < 5) {
  const block = em[0];
  if (!/\bimage:\s*/.test(block) || !/\bsentence:\s*/.test(block)) {
    const idMatch = block.match(/\bid:\s*(\d+)/);
    if (idMatch) missing.push(idMatch[1]);
  }
  idx++;
}

// sentenceList
const sStart = s.indexOf('window.sentenceList = [');
const sEnd = s.indexOf('];\n\n// 故事表', sStart);
const sentStr = s.slice(sStart, sEnd);
const sentCount = (sentStr.match(/\{\s*id:\s*\d+,/g) || []).length;

// storyList
const stStart = s.indexOf('window.storyList = [');
const stEnd = s.indexOf('];\n\n(function', stStart);
const storyStr = s.slice(stStart, stEnd);
const storyCount = (storyStr.match(/\n\s+\{\s*\n\s+id:\s*\d+,/g) || []).length;
const storyCountAlt = (storyStr.match(/\sid:\s*\d+,\s*\n\s+title:/g) || []).length;

console.log(JSON.stringify({
  vocabularyList: vocabCount,
  sentenceList: sentCount,
  storyList: storyCountAlt || storyCount,
  level1_id_range: [primaryMin, primaryMax],
  level2_id_range: [juniorMin, juniorMax],
  all_have_image_and_sentence: missing.length === 0,
  missing_image_or_sentence_ids: missing.slice(0, 3)
}, null, 2));
