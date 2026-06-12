/* ============================================================
   Google Apps Script - テスト範囲表 バックエンド
   ============================================================
   デプロイ方法:
   1. このファイルを GAS エディタの Code.gs に貼り付け
   2. 以下のファイルも GAS プロジェクトに追加（ファイル→新規作成→HTML）:
      - Page_Index.html（メインページ）
      - Page_Suggest.html（提案ページ）
      - Page_Admin.html（管理者ページ）
      - Style.html（デザイン）
      - ScriptJs.html（メイン画面のJS）
      - SuggestJs.html（提案画面のJS）
      - AdminJs.html（管理者画面のJS）
   3. デプロイ→新しいデプロイ→ウェブアプリ で公開
   ============================================================ */

const SPREADSHEET_ID = '1-swR6oEpddez8xotXDC2r7BSnkklx_k8-2EKMqppg3E';

const SHEETS = {
  config: 'config',
  subjects: 'subjects',
  schedule: 'schedule',
  suggestions: 'suggestions',
  submissions: 'submissions',
  users: 'users',
  tokens: 'tokens'
};

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === SHEETS.config) {
      sheet.appendRow(['key', 'value']);
      sheet.appendRow(['version', '1学期 中間テスト']);
      sheet.appendRow(['versionLabel', '2026年度']);
    } else if (name === SHEETS.subjects) {
      sheet.appendRow(['course', 'subject', 'color']);
    } else if (name === SHEETS.schedule) {
      sheet.appendRow(['version', 'course', 'subject', 'date', 'period', 'scope', 'notes', 'color']);
    } else if (name === SHEETS.suggestions) {
      sheet.appendRow(['id', 'version', 'course', 'subject', 'type', 'date', 'period', 'scope', 'notes', 'reason', 'status', 'createdAt']);
    } else if (name === SHEETS.submissions) {
      sheet.appendRow(['version', 'course', 'subject', 'notes', 'color']);
    } else if (name === SHEETS.users) {
      sheet.appendRow(['userId', 'email', 'passwordHash', 'displayName', 'savedData', 'createdAt', 'updatedAt', 'resetToken', 'resetTokenExpiry', 'role']);
    } else if (name === SHEETS.tokens) {
      sheet.appendRow(['token', 'userId', 'createdAt', 'lastActiveAt']);
    }
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0];
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = { _row: i + 1 };
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = rows[i][j];
    }
    result.push(obj);
  }
  return result;
}

// ---- Template include helper ----
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---- GET handlers ----
function doGet(e) {
  try {
    // Serve PWA manifest
    if (e.parameter.manifest === '1') {
      return serveManifest();
    }

    const action = e.parameter.action;
    if (action) {
      let result;
      switch (action) {
        case 'getConfig':
          result = getConfig();
          break;
        case 'getSchedule':
          result = getSchedule(e.parameter.version, e.parameter.course);
          break;
        case 'getSubjects':
          result = getSubjects(e.parameter.course, e.parameter.version);
          break;
        case 'getSuggestions':
          result = getSuggestionsData();
          break;
        case 'getSubmissions':
          result = getSubmissions(e.parameter.version, e.parameter.course);
          break;
        case 'getVersions':
          result = getVersions();
          break;
        default:
          throw new Error('Unknown action: ' + action);
      }
      return outputJson({ success: true, data: result });
    }
    const page = e.parameter.page || 'index';
    const resetToken = e.parameter.resetToken || '';
    return servePage(page, resetToken);
  } catch (err) {
    return outputJson({ success: false, error: err.toString() });
  }
}

// ---- PWA Manifest ----
function serveManifest() {
  var iconUrl = 'https://drive.google.com/thumbnail?id=1Gm9vT1ndaRkRFun0H5ZPmsCFuuTPlyK8&sz=w512';
  var manifest = {
    name: '範囲表',
    short_name: '範囲表',
    display: 'standalone',
    start_url: '.',
    background_color: '#ffffff',
    theme_color: '#4f8cff',
    icons: [
      {
        src: iconUrl,
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: iconUrl,
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  };
  return ContentService.createTextOutput(JSON.stringify(manifest))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- HTML serving ----
function servePage(page, resetToken) {
  const name = page === 'suggest' ? 'Page_Suggest' : page === 'admin' ? 'Page_Admin' : 'Page_Index';
  const tpl = HtmlService.createTemplateFromFile(name);
  tpl.resetToken = resetToken || '';
  return tpl.evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setTitle(
      page === 'suggest' ? '変更点を提案 - テスト範囲表' :
      page === 'admin' ? '管理者画面 - テスト範囲表' :
      'テスト範囲表'
    );
}

// ---- POST handlers ----
function doPost(e) {
  try {
    let params, action;
    try {
      params = JSON.parse(e.postData.contents);
      action = params.action;
    } catch (jsonErr) {
      params = e.parameter;
      action = params.action;
    }
    let result;
    switch (action) {
      case 'getConfig':
        result = getConfig();
        break;
      case 'getSchedule':
        result = getSchedule(params.version, params.course);
        break;
      case 'getSubjects':
        result = getSubjects(params.course, params.version);
        break;
      case 'getSuggestions':
        result = getSuggestionsData();
        break;
      case 'getVersions':
        result = getVersions();
        break;
      case 'addSuggestion':
        result = addSuggestion(params.data, params.token);
        break;
      case 'register':
        result = registerUser(params.email, params.password, params.displayName, params.savedData);
        break;
      case 'login':
        result = loginUser(params.email, params.password);
        break;
      case 'autoLogin':
        result = autoLogin(params.token);
        break;
      case 'save':
        result = saveUserData(params.token, params.savedData);
        break;
      case 'requestPasswordReset':
        result = requestPasswordReset(params.email);
        break;
      case 'resetPassword':
        result = resetPassword(params.token, params.newPassword);
        break;
      case 'checkAdmin':
        result = checkAdminStatus(params.token);
        break;
      case 'approveSuggestion':
        result = approveSuggestion(params.id, params.token);
        break;
      case 'rejectSuggestion':
        result = rejectSuggestion(params.id, params.token);
        break;
      case 'updateVersion':
        result = updateVersion(params.version, params.token);
        break;
      case 'updateSubjects':
        result = updateSubjects(params.course, params.subjects, params.token);
        break;
      case 'addScheduleEntry':
        result = addScheduleEntry(params.data, params.token);
        break;
      case 'updateScheduleEntry':
        result = updateScheduleEntry(params.rowIndex, params.data, params.token);
        break;
      case 'deleteScheduleEntry':
        result = deleteScheduleEntry(params.rowIndex, params.token);
        break;
      case 'replaceSchedule':
        result = replaceSchedule(params.version, params.course, params.rows, params.token);
        break;
      case 'addSubmission':
        result = addSubmission(params.data, params.token);
        break;
      case 'updateSubmission':
        result = updateSubmission(params.rowIndex, params.data, params.token);
        break;
      case 'deleteSubmission':
        result = deleteSubmission(params.rowIndex, params.token);
        break;
      case 'replaceSubmissions':
        result = replaceSubmissions(params.version, params.course, params.rows, params.token);
        break;
      case 'updateConfig':
        result = updateConfig(params.key, params.value, params.token);
        break;
      case 'heartbeat':
        result = heartbeat(params.token);
        break;
      case 'getActiveSessions':
        result = getActiveSessions(params.token);
        break;
      default:
        throw new Error('Unknown action: ' + action);
    }
    return outputJson({ success: true, data: result });
  } catch (err) {
    return outputJson({ success: false, error: err.toString() });
  }
}

function outputJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- Config ----
function getConfig() {
  const sheet = getSheet(SHEETS.config);
  const data = sheetToObjects(sheet);
  const config = {};
  data.forEach(row => { config[row.key] = row.value; });
  return config;
}

function getVersions() {
  const sheet = getSheet(SHEETS.schedule);
  const data = sheetToObjects(sheet);
  let versions = [...new Set(data.map(r => r.version).filter(Boolean))];
  try {
    const config = getConfig();
    if (config.version && !versions.includes(config.version)) {
      versions.push(config.version);
    }
  } catch (e) {}
  return versions.sort();
}

// ---- Schedule ----
function getSchedule(version, course) {
  const sheet = getSheet(SHEETS.schedule);
  const data = sheetToObjects(sheet);
  return data.filter(row => {
    if (version && row.version !== version) return false;
    if (course && row.course !== course && row.course !== '共通') return false;
    return true;
  });
}

// ---- Subjects ----
function getSubjects(course, version) {
  function getBasicSubjects() {
    const isFinal = version && version.indexOf('期末') !== -1;
    const midtermBasics = [
      '論理国語', '古典国語', '数学①', '数学②', '英C', '論表', '化学', '公共'
    ];
    const finalBasics = [
      '論理国語', '古典国語', '数学①', '数学②', '英C', '論表', '化学', '公共', '情報', '保健'
    ];
    return isFinal ? finalBasics : midtermBasics;
  }

  function getElectiveSubjects() {
    if (course === 'K/文系') return ['歴史'];
    if (course === 'K/理系（物理）' || course === 'SS/理系（物理）') return ['地理', '物理'];
    if (course === 'K/理系（生物）' || course === 'SS/理系（生物）') return ['地理', '生物'];
    return [];
  }

  const colors = {
    '論理国語': '#EF4444', '古典国語': '#DC2626',
    '数学①': '#3B82F6', '数学②': '#2563EB',
    '英C': '#10B981', '論表': '#F97316',
    '化学': '#14B8A6', '公共': '#6B7280',
    '情報': '#6366F1', '保健': '#EC4899',
    '地理': '#8B5CF6', '歴史': '#F59E0B',
    '物理': '#06B6D4', '生物': '#EC4899'
  };

  const basicSubjects = getBasicSubjects();
  const electiveSubjects = getElectiveSubjects();
  const allSubjects = [...basicSubjects, ...electiveSubjects];

  return allSubjects.map(subject => ({
    course: course,
    subject: subject,
    color: colors[subject] || '#6B7280'
  }));
}

function updateSubjects(course, subjects, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.subjects);
  const existing = sheetToObjects(sheet);
  const toRemove = existing.filter(r => r.course === course);
  for (let i = sheet.getLastRow(); i >= 2; i--) {
    const rowCourse = sheet.getRange(i, 1).getValue();
    if (rowCourse === course) {
      sheet.deleteRow(i);
    }
  }
  subjects.forEach(s => {
    sheet.appendRow([course, s.subject, s.color || '#3B82F6']);
  });
  return { updated: subjects.length };
}

// ---- Suggestions ----
function addSuggestion(data, token) {
  requireAuth(token);
  const sheet = getSheet(SHEETS.suggestions);
  const existing = sheetToObjects(sheet);
  const maxId = existing.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0);
  const nextId = maxId + 1;
  const now = new Date().toISOString();
  const type = data.type || 'test_scope';
  sheet.appendRow([
    nextId,
    data.version,
    data.course,
    data.subject,
    type,
    data.date || '',
    data.period || '',
    data.scope || '',
    data.notes || '',
    '',
    '承認待ち',
    now
  ]);
  return { id: nextId };
}

function getSuggestionsData() {
  const sheet = getSheet(SHEETS.suggestions);
  return sheetToObjects(sheet);
}

function approveSuggestion(id, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.suggestions);
  const data = sheetToObjects(sheet);
  const target = data.find(r => r.id == id);
  if (!target) throw new Error('提案が見つかりません');
  if (target.status !== '承認待ち') throw new Error('この提案は既に処理されています');

  const rowIndex = data.indexOf(target) + 2;
  const statusCol = 11;
  sheet.getRange(rowIndex, statusCol).setValue('承認済み');

  if (target.type === 'submission') {
    const subSheet = getSheet(SHEETS.submissions);
    subSheet.appendRow([
      target.version,
      target.course,
      target.subject,
      target.notes || '',
      ''
    ]);
  } else {
    const schedSheet = getSheet(SHEETS.schedule);
    const schedData = sheetToObjects(schedSheet);
    const existing = schedData.findIndex(r =>
      r.version === target.version &&
      r.course === target.course &&
      r.subject === target.subject
    );

    if (existing >= 0) {
      const rowNum = existing + 2;
      schedSheet.getRange(rowNum, 4).setValue(target.date || '');
      schedSheet.getRange(rowNum, 5).setValue(target.period || '');
      schedSheet.getRange(rowNum, 6).setValue(target.scope || '');
      schedSheet.getRange(rowNum, 7).setValue(target.notes || '');
    } else {
      schedSheet.appendRow([
        target.version,
        target.course,
        target.subject,
        target.date || '',
        target.period || '',
        target.scope || '',
        target.notes || '',
        ''
      ]);
    }
  }
  return { id, status: 'approved' };
}

function rejectSuggestion(id, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.suggestions);
  const data = sheetToObjects(sheet);
  const target = data.find(r => r.id == id);
  if (!target) throw new Error('提案が見つかりません');
  if (target.status !== '承認待ち') throw new Error('この提案は既に処理されています');

  const rowIndex = data.indexOf(target) + 2;
  const statusCol = 11;
  sheet.getRange(rowIndex, statusCol).setValue('却下');
  return { id, status: 'rejected' };
}

// ---- Schedule CRUD (Admin) ----
function replaceSchedule(version, course, rows, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.schedule);
  const allData = sheet.getDataRange().getValues();
  for (let i = allData.length - 1; i >= 1; i--) {
    if (allData[i][0] === version && allData[i][1] === course) {
      sheet.deleteRow(i + 1);
    }
  }
  rows.forEach(r => {
    sheet.appendRow([
      version,
      course,
      r.subject || '',
      r.date || '',
      r.period || '',
      r.scope || '',
      r.notes || '',
      r.color || ''
    ]);
  });
  return { inserted: rows.length };
}

function addScheduleEntry(data, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.schedule);
  sheet.appendRow([
    data.version,
    data.course,
    data.subject,
    data.date || '',
    data.period || '',
    data.scope || '',
    data.notes || '',
    data.color || ''
  ]);
  return { success: true };
}

function updateScheduleEntry(rowIndex, data, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.schedule);
  if (rowIndex < 2 || rowIndex > sheet.getLastRow()) throw new Error('不正な行番号です');
  const row = sheet.getRange(rowIndex, 1, 1, 8);
  const current = row.getValues()[0];
  row.setValues([[
    data.version ?? current[0],
    data.course ?? current[1],
    data.subject ?? current[2],
    data.date ?? current[3],
    data.period ?? current[4],
    data.scope ?? current[5],
    data.notes ?? current[6],
    data.color ?? current[7]
  ]]);
  return { success: true };
}

function deleteScheduleEntry(rowIndex, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.schedule);
  if (rowIndex < 2 || rowIndex > sheet.getLastRow()) throw new Error('不正な行番号です');
  sheet.deleteRow(rowIndex);
  return { success: true };
}

// ---- Submissions CRUD ----
function getSubmissions(version, course) {
  const sheet = getSheet(SHEETS.submissions);
  const data = sheetToObjects(sheet);
  return data.filter(row => {
    if (version && row.version !== version) return false;
    if (course && row.course !== course) return false;
    return true;
  });
}

function addSubmission(data, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.submissions);
  sheet.appendRow([
    data.version,
    data.course,
    data.subject,
    data.notes || '',
    data.color || '#3B82F6'
  ]);
  return { success: true };
}

function updateSubmission(rowIndex, data, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.submissions);
  if (rowIndex < 2 || rowIndex > sheet.getLastRow()) throw new Error('不正な行番号です');
  const row = sheet.getRange(rowIndex, 1, 1, 5);
  const current = row.getValues()[0];
  row.setValues([[
    data.version ?? current[0],
    data.course ?? current[1],
    data.subject ?? current[2],
    data.notes ?? current[3],
    data.color ?? current[4]
  ]]);
  return { success: true };
}

function deleteSubmission(rowIndex, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.submissions);
  if (rowIndex < 2 || rowIndex > sheet.getLastRow()) throw new Error('不正な行番号です');
  sheet.deleteRow(rowIndex);
  return { success: true };
}

function replaceSubmissions(version, course, rows, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.submissions);
  const allData = sheet.getDataRange().getValues();
  for (let i = allData.length - 1; i >= 1; i--) {
    if (allData[i][0] === version && allData[i][1] === course) {
      sheet.deleteRow(i + 1);
    }
  }
  rows.forEach(r => {
    sheet.appendRow([
      version,
      course,
      r.subject || '',
      r.notes || '',
      r.color || '#3B82F6'
    ]);
  });
  return { inserted: rows.length };
}

function updateVersion(version, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.config);
  const data = sheetToObjects(sheet);
  const rowIndex = data.findIndex(r => r.key === 'version');
  if (rowIndex >= 0) {
    sheet.getRange(rowIndex + 2, 2).setValue(version);
  } else {
    sheet.appendRow(['version', version]);
  }
  return { version };
}

function updateConfig(key, value, token) {
  requireAdmin(token);
  const sheet = getSheet(SHEETS.config);
  const data = sheetToObjects(sheet);
  const rowIndex = data.findIndex(r => r.key === key);
  if (rowIndex >= 0) {
    sheet.getRange(rowIndex + 2, 2).setValue(value);
  } else {
    sheet.appendRow([key, value]);
  }
  return { key, value };
}

// ---- google.script.run handler ----
function serverHandler(action, params) {
  try {
    let result;
    switch (action) {
      case 'getConfig':
        result = getConfig();
        break;
      case 'getSchedule':
        result = getSchedule(params ? params.version : null, params ? params.course : null);
        break;
      case 'getSubjects':
        result = getSubjects(params ? params.course : null, params ? params.version : null);
        break;
      case 'getSuggestions':
        result = getSuggestionsData();
        break;
      case 'getVersions':
        result = getVersions();
        break;
      case 'addSuggestion':
        result = addSuggestion(params.data, params.token);
        break;
      case 'checkAdmin':
        result = checkAdminStatus(params.token);
        break;
      case 'approveSuggestion':
        result = approveSuggestion(params.id, params.token);
        break;
      case 'rejectSuggestion':
        result = rejectSuggestion(params.id, params.token);
        break;
      case 'updateVersion':
        result = updateVersion(params.version, params.token);
        break;
      case 'updateSubjects':
        result = updateSubjects(params.course, params.subjects, params.token);
        break;
      case 'addScheduleEntry':
        result = addScheduleEntry(params.data, params.token);
        break;
      case 'updateScheduleEntry':
        result = updateScheduleEntry(params.rowIndex, params.data, params.token);
        break;
      case 'deleteScheduleEntry':
        result = deleteScheduleEntry(params.rowIndex, params.token);
        break;
      case 'replaceSchedule':
        result = replaceSchedule(params.version, params.course, params.rows, params.token);
        break;
      case 'getSubmissions':
        result = getSubmissions(params.version, params.course);
        break;
      case 'addSubmission':
        result = addSubmission(params.data, params.token);
        break;
      case 'updateSubmission':
        result = updateSubmission(params.rowIndex, params.data, params.token);
        break;
      case 'deleteSubmission':
        result = deleteSubmission(params.rowIndex, params.token);
        break;
      case 'replaceSubmissions':
        result = replaceSubmissions(params.version, params.course, params.rows, params.token);
        break;
      case 'register':
        result = registerUser(params.email, params.password, params.displayName, params.savedData);
        break;
      case 'login':
        result = loginUser(params.email, params.password);
        break;
      case 'autoLogin':
        result = autoLogin(params.token);
        break;
      case 'save':
        result = saveUserData(params.token, params.savedData);
        break;
      case 'requestPasswordReset':
        result = requestPasswordReset(params.email);
        break;
      case 'resetPassword':
        result = resetPassword(params.token, params.newPassword);
        break;
      case 'updateConfig':
        result = updateConfig(params.key, params.value, params.token);
        break;
      case 'heartbeat':
        result = heartbeat(params.token);
        break;
      case 'getActiveSessions':
        result = getActiveSessions(params.token);
        break;
      default:
        throw new Error('Unknown action: ' + action);
    }
    return JSON.stringify({ success: true, data: result });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.toString() });
  }
}

// ---- Account Management ----
function hashPassword(password) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );
  return digest.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function generateUserId() {
  return 'u_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function generateToken() {
  return 'tok_' + Utilities.getUuid().replace(/-/g, '') + '_' + Math.floor(Date.now() / 1000).toString(36);
}

function verifyToken(token) {
  if (!token) return null;
  var sheet = getSheet(SHEETS.tokens);
  var data = sheetToObjects(sheet);
  var row = data.find(function(r) { return r.token === token; });
  return row ? row.userId : null;
}

function registerUser(email, password, displayName, savedData) {
  var sheet = getSheet(SHEETS.users);
  var data = sheetToObjects(sheet);

  if (data.some(function(u) { return u.email === email; })) {
    throw new Error('このメールアドレスは既に登録されています');
  }

  if (!password || password.length < 8) {
    throw new Error('パスワードは8文字以上必要です');
  }

  var userId = generateUserId();
  var passwordHash = hashPassword(password);
  var now = new Date().toISOString();
  var savedDataStr = savedData ? JSON.stringify(savedData) : '{}';

  sheet.appendRow([userId, email, passwordHash, displayName, savedDataStr, now, now]);

  var token = generateToken();
  var tokenSheet = getSheet(SHEETS.tokens);
  tokenSheet.appendRow([token, userId, now, now]);

  return {
    success: true,
    token: token,
    displayName: displayName,
    savedData: savedData || {}
  };
}

function loginUser(email, password) {
  var sheet = getSheet(SHEETS.users);
  var data = sheetToObjects(sheet);

  var user = data.find(function(u) { return u.email === email; });
  if (!user) {
    throw new Error('メールアドレスまたはパスワードが正しくありません');
  }

  var passwordHash = hashPassword(password);
  if (user.passwordHash !== passwordHash) {
    throw new Error('メールアドレスまたはパスワードが正しくありません');
  }

  var token = generateToken();
  var tokenSheet = getSheet(SHEETS.tokens);
  tokenSheet.appendRow([token, user.userId, new Date().toISOString(), new Date().toISOString()]);

  var savedData = {};
  try { savedData = JSON.parse(user.savedData || '{}'); } catch (e) {}

  return {
    success: true,
    token: token,
    displayName: user.displayName,
    savedData: savedData
  };
}

function autoLogin(token) {
  var userId = verifyToken(token);
  if (!userId) throw new Error('認証が必要です');

  var sheet = getSheet(SHEETS.users);
  var data = sheetToObjects(sheet);
  var user = data.find(function(u) { return u.userId === userId; });
  if (!user) throw new Error('ユーザーが見つかりません');

  var savedData = {};
  try { savedData = JSON.parse(user.savedData || '{}'); } catch (e) {}

  return {
    success: true,
    displayName: user.displayName,
    savedData: savedData
  };
}

function saveUserData(token, savedData) {
  var userId = verifyToken(token);
  if (!userId) throw new Error('認証が必要です');

  var sheet = getSheet(SHEETS.users);
  var data = sheetToObjects(sheet);
  var userIndex = data.findIndex(function(u) { return u.userId === userId; });
  if (userIndex < 0) throw new Error('ユーザーが見つかりません');

  var rowNum = userIndex + 2;
  var savedDataStr = savedData ? JSON.stringify(savedData) : '{}';
  var now = new Date().toISOString();

  sheet.getRange(rowNum, 5).setValue(savedDataStr);
  sheet.getRange(rowNum, 7).setValue(now);

  return { success: true };
}

// ---- Auth ----
function requireAuth(token) {
  var userId = verifyToken(token);
  if (!userId) throw new Error('ログインが必要です');
  return userId;
}

// ---- Admin Auth ----
function requireAdmin(token) {
  var userId = verifyToken(token);
  if (!userId) throw new Error('ログインが必要です');

  var sheet = getSheet(SHEETS.users);
  var data = sheetToObjects(sheet);
  var user = data.find(function(u) { return u.userId === userId; });
  if (!user) throw new Error('ユーザーが見つかりません');
  if (user.role !== 'admin') throw new Error('管理者権限が必要です');

  return user;
}

function checkAdminStatus(token) {
  if (!token) return { isAdmin: false, loggedIn: false };
  var userId = verifyToken(token);
  if (!userId) return { isAdmin: false, loggedIn: false };

  var sheet = getSheet(SHEETS.users);
  var data = sheetToObjects(sheet);
  var user = data.find(function(u) { return u.userId === userId; });
  if (!user) return { isAdmin: false, loggedIn: true };

  return { isAdmin: user.role === 'admin', loggedIn: true, displayName: user.displayName };
}

// ---- Active Sessions ----
function heartbeat(token) {
  if (!token) throw new Error('認証が必要です');
  var sheet = getSheet(SHEETS.tokens);
  var data = sheetToObjects(sheet);
  var idx = data.findIndex(function(r) { return r.token === token; });
  if (idx < 0) throw new Error('トークンが見つかりません');
  sheet.getRange(idx + 2, 4).setValue(new Date().toISOString());
  return { success: true };
}

function getActiveSessions(token) {
  requireAdmin(token);
  var tokenSheet = getSheet(SHEETS.tokens);
  var userSheet = getSheet(SHEETS.users);
  var tokens = sheetToObjects(tokenSheet);
  var users = sheetToObjects(userSheet);
  var now = new Date();
  var limit = new Date(now.getTime() - 2 * 60 * 1000);
  var sessions = tokens.map(function(t) {
    var user = users.find(function(u) { return u.userId === t.userId; });
    var lastActive = t.lastActiveAt ? new Date(t.lastActiveAt) : null;
    return {
      userId: t.userId,
      email: user ? user.email : '',
      displayName: user ? (user.displayName || '未設定') : '不明なユーザー',
      createdAt: t.createdAt || '',
      lastActiveAt: t.lastActiveAt || '',
      isActive: lastActive ? (lastActive >= limit) : false
    };
  });
  sessions.sort(function(a, b) {
    var aTime = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
    var bTime = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
    return bTime - aTime;
  });
  return sessions;
}

// Setup first admin (run this function manually from GAS editor after registering)
function setupInitialAdmin(email) {
  var sheet = getSheet(SHEETS.users);
  var data = sheetToObjects(sheet);
  var idx = data.findIndex(function(u) { return u.email === email; });
  if (idx < 0) throw new Error('ユーザーが見つかりません: ' + email);
  sheet.getRange(idx + 2, 10).setValue('admin');
  return '管理者権限を付与しました: ' + email;
}

// ---- Password Reset ----
function requestPasswordReset(email) {
  if (!email) throw new Error('メールアドレスを入力してください');

  var sheet = getSheet(SHEETS.users);
  var data = sheetToObjects(sheet);
  var userIndex = data.findIndex(function(u) { return u.email === email; });

  // Don't reveal whether the email exists
  if (userIndex < 0) {
    return { success: true, message: 'パスワードリセットのメールを送信しました' };
  }

  var rowNum = userIndex + 2;
  var resetToken = 'reset_' + Utilities.getUuid().replace(/-/g, '') + '_' + Math.floor(Date.now() / 1000).toString(36);
  var expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  sheet.getRange(rowNum, 8).setValue(resetToken);  // resetToken column
  sheet.getRange(rowNum, 9).setValue(expiry);       // resetTokenExpiry column

  var webAppUrl = ScriptApp.getService().getUrl();
  var resetLink = webAppUrl + '?resetToken=' + encodeURIComponent(resetToken);

  var subject = 'パスワードリセット - テスト範囲表';
  var body = 'パスワードリセットのリクエストを受け付けました。\n\n'
    + '以下のリンクをクリックして新しいパスワードを設定してください。\n'
    + 'このリンクの有効期限は1時間です。\n\n'
    + resetLink + '\n\n'
    + '心当たりがない場合はこのメールを無視してください。\n'
    + '---\n'
    + 'テスト範囲表';

  MailApp.sendEmail(email, subject, body);

  return { success: true, message: 'パスワードリセットのメールを送信しました' };
}

function validateResetToken(token) {
  if (!token) return null;

  var sheet = getSheet(SHEETS.users);
  var data = sheetToObjects(sheet);
  var user = data.find(function(u) { return u.resetToken === token; });

  if (!user) return null;

  var expiry = new Date(user.resetTokenExpiry);
  if (expiry < new Date()) return null;

  return { userId: user.userId, email: user.email };
}

function resetPassword(token, newPassword) {
  if (!token) throw new Error('リセットトークンが無効です');
  if (!newPassword || newPassword.length < 8) throw new Error('パスワードは8文字以上必要です');

  var sheet = getSheet(SHEETS.users);
  var data = sheetToObjects(sheet);
  var userIndex = data.findIndex(function(u) { return u.resetToken === token; });

  if (userIndex < 0) throw new Error('リセットトークンが無効です');

  var user = data[userIndex];
  var expiry = new Date(user.resetTokenExpiry);
  if (expiry < new Date()) throw new Error('リセットトークンの有効期限が切れています');

  var rowNum = userIndex + 2;
  var passwordHash = hashPassword(newPassword);
  var now = new Date().toISOString();

  sheet.getRange(rowNum, 3).setValue(passwordHash);  // passwordHash
  sheet.getRange(rowNum, 7).setValue(now);            // updatedAt
  sheet.getRange(rowNum, 8).setValue('');              // clear resetToken
  sheet.getRange(rowNum, 9).setValue('');              // clear resetTokenExpiry

  return { success: true, message: 'パスワードをリセットしました' };
}

// ---- Test / Setup helper ----
function setupInitialData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let sheet = ss.getSheetByName(SHEETS.config);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.config);
    sheet.appendRow(['key', 'value']);
    sheet.appendRow(['version', '1学期 中間テスト']);
    sheet.appendRow(['versionLabel', '2026年度']);
  }

  sheet = ss.getSheetByName(SHEETS.subjects);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.subjects);
    sheet.appendRow(['course', 'subject', 'color']);
    const basicSubjects = [
      '論理国語', '古典国語', '数学①', '数学②', '英C', '論表', '化学', '公共', '情報', '保健'
    ];
    const basicColors = {
      '論理国語': '#EF4444', '古典国語': '#DC2626',
      '数学①': '#3B82F6', '数学②': '#2563EB',
      '英C': '#10B981', '論表': '#F97316',
      '化学': '#14B8A6', '公共': '#6B7280',
      '情報': '#6366F1', '保健': '#EC4899'
    };
    const electiveData = {
      'K/文系': ['歴史'],
      'K/理系（物理）': ['地理', '物理'],
      'K/理系（生物）': ['地理', '生物'],
      'SS/理系（物理）': ['地理', '物理'],
      'SS/理系（生物）': ['地理', '生物']
    };
    const electiveColors = {
      '地理': '#8B5CF6', '歴史': '#F59E0B',
      '物理': '#06B6D4', '生物': '#EC4899'
    };
    for (const [course, electives] of Object.entries(electiveData)) {
      for (const subj of basicSubjects) {
        sheet.appendRow([course, subj, basicColors[subj] || '#6B7280']);
      }
      for (const subj of electives) {
        sheet.appendRow([course, subj, electiveColors[subj] || '#6B7280']);
      }
    }
  }

  sheet = ss.getSheetByName(SHEETS.schedule);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.schedule);
    sheet.appendRow(['version', 'course', 'subject', 'date', 'period', 'scope', 'notes', 'color']);
    sheet.appendRow(['1学期 中間テスト', 'K/文系', '論理国語', '6/15(月)', '1時間目', '教科書 p.10~45\nワーク p.2~20', '漢字テストあり', '#EF4444']);
    sheet.appendRow(['1学期 中間テスト', 'K/文系', '古典国語', '6/15(月)', '2時間目', '教科書 古文編 p.1~30', '古文学習あり', '#DC2626']);
    sheet.appendRow(['1学期 中間テスト', 'K/文系', '数学①', '6/16(火)', '1時間目', '教科書 p.10~45\n問題集 p.5~25', '計算問題中心', '#3B82F6']);
    sheet.appendRow(['1学期 中間テスト', 'K/文系', '歴史', '6/18(木)', '3時間目', '教科書 第1章~第3章\nノートまとめ', '記述問題あり', '#F59E0B']);
  }

  sheet = ss.getSheetByName(SHEETS.suggestions);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.suggestions);
    sheet.appendRow(['id', 'version', 'course', 'subject', 'type', 'date', 'period', 'scope', 'notes', 'reason', 'status', 'createdAt']);
  }

  sheet = ss.getSheetByName(SHEETS.submissions);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.submissions);
    sheet.appendRow(['version', 'course', 'subject', 'notes', 'color']);
  }

  return '初期データを作成しました';
}
