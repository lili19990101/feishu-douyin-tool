const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

function getArg(name, defaultValue) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  if (index === -1) return defaultValue;
  return args[index + 1];
}

function requireArg(name) {
  const value = getArg(name);
  if (!value) {
    throw new Error(`Missing required argument ${name}`);
  }
  return value;
}

function base36ToBigInt(str) {
  return [...str.toLowerCase()].reduce((acc, ch) => {
    const digit = parseInt(ch, 36);
    if (Number.isNaN(digit)) throw new Error(`Invalid rank digit: ${ch}`);
    return acc * 36n + BigInt(digit);
  }, 0n);
}

function bigIntToBase36(value, length) {
  let result = value.toString(36);
  if (result.length > length) {
    throw new Error('Rank overflow');
  }
  while (result.length < length) {
    result = '0' + result;
  }
  return result;
}

function bumpRank(rank) {
  if (!rank || rank.length < 2) {
    return 'i00000001';
  }
  const prefix = rank[0];
  const digits = rank.slice(1);
  const next = base36ToBigInt(digits) + 1n;
  return prefix + bigIntToBase36(next, digits.length);
}

function formatTextValue(text) {
  return [{ text: String(text), type: 'text' }];
}

function formatUrlValue(url) {
  return [{ text: url, link: url, type: 'url' }];
}

function buildRecordPayload(data, shareUrl, userMeta) {
  const now = Date.now();
  const modifiedTime = Math.floor(now / 1000);
  const modifiedUser = userMeta.modifiedUser ?? 'local-script';

  const record = {};

  const setText = (fieldId, value) => {
    if (value === undefined || value === null || value === '') return;
    record[fieldId] = {
      modifiedTime,
      modifiedUser,
      value: formatTextValue(value),
    };
  };

  const setUrl = (fieldId, value) => {
    if (!value) return;
    record[fieldId] = {
      modifiedTime,
      modifiedUser,
      value: formatUrlValue(value),
    };
  };

  const setNumber = (fieldId, value) => {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return;
    record[fieldId] = {
      modifiedTime,
      modifiedUser,
      value: Number(value),
    };
  };

  const setTimestamp = (fieldId, value) => {
    if (!value) return;
    record[fieldId] = {
      modifiedTime,
      modifiedUser,
      value: Number(value),
    };
  };

  setUrl('fldBu2FljL', shareUrl);
  setText('fldTgtOMSM', data.type);
  setText('fld7LoXcV1', data.title);
  setText('fldYW8HPbs', data.nickname);
  setTimestamp('fld5Bo91zG', data.releaseTime);
  setNumber('fld09N7qxG', data.collectionCount);
  setNumber('fldkjgNrEW', data.likeCount);
  setNumber('fldbiQYsb6', data.shareCount);
  setNumber('fldtDViShS', data.commentCount);
  setText('fldfyB7DEN', data.videoUrl);
  setText('fldkM79RfU', data.videoId);
  setText('flduEhM1D3', data.noteCover);
  setText('fldGeEBrrL', data.musicUrl);
  setText('fldpkHPbC3', data.musicTitle);
  setText('fldopkToqU', data.signature);
  setText('fld2tsgR7J', data.userhome);
  setNumber('fldel6Elxp', now);

  return { record, meta: { modifiedTime, modifiedUser } };
}

function appendRecordToSnapshot(snapshot, payload, shareUrl) {
  const targetEntry = snapshot.find(
    (entry) => entry?.schema?.data?.table?.meta?.id === 'tblrxut3bkhpqz9o',
  );
  if (!targetEntry) {
    throw new Error('无法在模板中找到“抖音作品数据测试”表');
  }

  const tableData = targetEntry.schema.data;
  const recordMap = tableData.recordMap ?? (tableData.recordMap = {});
  const recordMeta = tableData.recordMeta ?? (tableData.recordMeta = {});
  const tableMeta = tableData.table.meta;
  const rankInfo = tableData.table.rankInfo ?? { nextRank: 'i00000000', rankMap: {} };

  const existingRecord = Object.values(recordMap)[0];
  const sampleField = existingRecord ? recordFirstField(existingRecord) : null;
  const userMeta = {
    modifiedUser: sampleField?.modifiedUser ?? '6980035362873688067',
  };

  const { record, meta } = buildRecordPayload(payload, shareUrl, userMeta);
  const recId = `rec${crypto.randomBytes(6).toString('hex')}`;

  recordMap[recId] = record;
  recordMeta[recId] = {
    recMeta: {
      createdTime: meta.modifiedTime,
      createdUser: meta.modifiedUser,
      modifiedTime: meta.modifiedTime,
      modifiedUser: meta.modifiedUser,
      rev: 0,
    },
  };

  tableMeta.recordsNum = (tableMeta.recordsNum ?? 0) + 1;
  rankInfo.rankMap ??= {};
  rankInfo.rankMap[recId] = rankInfo.nextRank ?? 'i00000000';
  rankInfo.nextRank = bumpRank(rankInfo.nextRank ?? 'i00000000');

  tableData.recordMap = recordMap;
  tableData.recordMeta = recordMeta;
  tableData.table.rankInfo = rankInfo;
}

function recordFirstField(record) {
  if (!record) return null;
  for (const field of Object.values(record)) {
    if (field && typeof field === 'object') return field;
  }
  return null;
}

async function fetchDouyinData(apiHost, url, cookie, cookieJsonPath) {
  const endpoint = new URL('/douyin/getVideoInfo', apiHost).href;
  const payload = { url };
  if (cookieJsonPath) {
    const cookieJson = JSON.parse(fs.readFileSync(path.resolve(cookieJsonPath), 'utf-8'));
    payload.dyCookie = cookieJson;
  } else if (cookie) {
    payload.cookie = cookie;
  } else {
    throw new Error('需要通过 --cookie 或 --cookie-json 传入 Douyin Cookie');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`调用 ${endpoint} 失败: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(`接口返回错误: ${result.msg || '未知原因'}`);
  }
  return result.data;
}

function loadSnapshot(basePath) {
  const raw = fs.readFileSync(basePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const buffer = Buffer.from(parsed.gzipSnapshot, 'base64');
  const snapshot = JSON.parse(zlib.gunzipSync(buffer).toString('utf-8'));
  return { parsed, snapshot };
}

function writeSnapshot(basePath, outputPath, parsed, snapshot) {
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(snapshot), 'utf-8'));
  parsed.gzipSnapshot = compressed.toString('base64');
  fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2), 'utf-8');
}

async function main() {
  const basePath = path.resolve(getArg('--base', '数据采集模版.base'));
  const outputPath = path.resolve(getArg('--output', basePath));
  const shareUrl = requireArg('--url');
  const apiHost = getArg('--api', 'http://127.0.0.1:4000');
  const cookie = getArg('--cookie');
  const cookieJsonPath = getArg('--cookie-json');

  if (!fs.existsSync(basePath)) {
    throw new Error(`Base 文件不存在: ${basePath}`);
  }

  const douyinData = await fetchDouyinData(apiHost, shareUrl, cookie, cookieJsonPath);
  const { parsed, snapshot } = loadSnapshot(basePath);
  appendRecordToSnapshot(snapshot, douyinData, shareUrl);
  writeSnapshot(basePath, outputPath, parsed, snapshot);
  console.log(`已将 ${shareUrl} 的数据写入 ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
