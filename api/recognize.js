/**
 * Vercel Serverless: 接收前端上传的音频，调用阿里云一句话识别，返回识别文字。
 * 环境变量：ALIYUN_APPKEY, ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET
 * 不硬编码 Key，全部从 process.env 读取。
 */
const crypto = require('crypto');
const fs = require('fs');

function percentEncode(str) {
  if (!str) return '';
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~')
    .replace(/\+/g, '%20');
}

function uuid() {
  const b = crypto.randomBytes(16);
  return [b.slice(0, 4), b.slice(4, 6), b.slice(6, 8), b.slice(8, 10), b.slice(10, 16)]
    .map((x) => x.toString('hex'))
    .join('-');
}

/** 阿里云 POP 签名，获取 Token */
function createToken(accessKeyId, accessKeySecret) {
  const params = {
    AccessKeyId: accessKeyId,
    Action: 'CreateToken',
    Format: 'JSON',
    RegionId: 'cn-shanghai',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: uuid(),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2019-02-28',
  };
  const sortedKeys = Object.keys(params).sort();
  const canonicalizedQuery = sortedKeys
    .map((k) => percentEncode(k) + '=' + percentEncode(params[k]))
    .join('&');
  const stringToSign =
    'GET&' + percentEncode('/') + '&' + percentEncode(canonicalizedQuery);
  const hmac = crypto.createHmac(
    'sha1',
    accessKeySecret + '&'
  );
  hmac.update(stringToSign);
  const signature = percentEncode(hmac.digest('base64'));
  const url =
    'https://nls-meta.cn-shanghai.aliyuncs.com/?' +
    'Signature=' +
    signature +
    '&' +
    canonicalizedQuery;
  return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
    .then((r) => r.json())
    .then((body) => {
      if (body.Token && body.Token.Id) return body.Token.Id;
      throw new Error(body.Message || body.Code || 'CreateToken failed');
    });
}

/** 阿里云一句话识别 REST：POST 二进制音频，返回识别结果 */
function recognizeSpeech(token, appkey, audioBuffer, format, sampleRate) {
  const formatParam = format || 'wav';
  const sampleRateParam = sampleRate || 16000;
  const query =
    'appkey=' +
    encodeURIComponent(appkey) +
    '&format=' +
    formatParam +
    '&sample_rate=' +
    sampleRateParam +
    '&enable_punctuation_prediction=true';
  const url =
    'https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr?' + query;
  return fetch(url, {
    method: 'POST',
    headers: {
      'X-NLS-Token': token,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(audioBuffer.length),
    },
    body: audioBuffer,
  })
    .then((r) => r.json())
    .then((body) => {
      if (body.status === 20000000) return (body.result || '').trim();
      throw new Error(body.message || 'status ' + body.status);
    });
}

exports.config = { api: { bodyParser: false } };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const appkey = process.env.ALIYUN_APPKEY;
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  if (!appkey || !accessKeyId || !accessKeySecret) {
    res.status(500).json({
      error: 'Server config error',
      message: 'Missing ALIYUN_APPKEY / ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET',
    });
    return;
  }

  let audioBuffer;
  let format = 'wav';
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (contentType.indexOf('multipart/form-data') !== -1) {
    const formidable = require('formidable');
    const form = formidable({ maxFileSize: 10 * 1024 * 1024 });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });
    const file = files.audio || files.file || files[0];
    if (!file || !file.filepath) {
      res.status(400).json({ error: 'No audio file in multipart' });
      return;
    }
    audioBuffer = fs.readFileSync(file.filepath);
    const name = (file.originalFilename || file.name || '').toLowerCase();
    if (name.endsWith('.webm') || (file.mimetype || '').indexOf('webm') !== -1)
      format = 'opus';
  } else {
    res.status(400).json({ error: 'Send audio as multipart/form-data with field "audio"' });
    return;
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    res.status(400).json({ error: 'Empty audio body' });
    return;
  }

  try {
    const token = await createToken(accessKeyId, accessKeySecret);
    const text = await recognizeSpeech(
      token,
      appkey,
      audioBuffer,
      format,
      16000
    );
    res.status(200).json({ text: text || '' });
  } catch (e) {
    const msg = e.message || String(e);
    if (typeof console !== 'undefined') console.error('[api/recognize]', msg);
    res.status(500).json({ error: 'Recognition failed', message: msg });
  }
};
