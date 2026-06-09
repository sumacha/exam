/* ============================================================
   Google Apps Script - テスト範囲表 バックエンド
   ============================================================
   使い方:
   1. 新しいGoogleスプレッドシートを作成
   2. 拡張機能 > Apps Script を開く
   3. このコードを貼り付ける
   4. スプレッドシートIDを SPREADSHEET_ID に設定
   5. デプロイ > 新しいデプロイ > ウェブアプリ で公開
   6. 取得したURLを frontend/*.js の API_BASE_URL に設定
   ============================================================ */

const SPREADSHEET_ID = '1-swR6oEpddez8xotXDC2r7BSnkklx_k8-2EKMqppg3E';

const SHEETS = {
  config: 'config',
  subjects: 'subjects',
  schedule: 'schedule',
  suggestions: 'suggestions'
};

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === SHEETS.config) {
      sheet.appendRow(['key', 'value']);
      sheet.appendRow(['password', 'exam2026']);
      sheet.appendRow(['version', '1学期 中間テスト']);
      sheet.appendRow(['versionLabel', '2026年度']);
    } else if (name === SHEETS.subjects) {
      sheet.appendRow(['course', 'subject', 'color']);
    } else if (name === SHEETS.schedule) {
      sheet.appendRow(['version', 'course', 'subject', 'date', 'period', 'scope', 'notes', 'color']);
    } else if (name === SHEETS.suggestions) {
      sheet.appendRow(['id', 'version', 'course', 'subject', 'type', 'date', 'period', 'scope', 'notes', 'reason', 'status', 'createdAt']);
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

// ---- Auth ----
function generateToken() {
  return Utilities.getUuid() + ':' + new Date().getTime();
}

function verifyToken(token) {
  if (!token) return false;
  const props = PropertiesService.getScriptProperties();
  const stored = props.getProperty('session_' + token);
  if (!stored) return false;
  const parts = stored.split(':');
  const expiry = parseInt(parts[0]);
  if (new Date().getTime() > expiry) {
    props.deleteProperty('session_' + token);
    return false;
  }
  return true;
}

// ---- GET handlers ----
function doGet(e) {
  try {
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
          if (!verifyToken(e.parameter.token)) {
            throw new Error('認証が必要です');
          }
          result = getSuggestionsData();
          break;
        case 'checkAuth':
          result = { valid: verifyToken(e.parameter.token) };
          break;
        case 'getVersions':
          result = getVersions();
          break;
        default:
          throw new Error('Unknown action: ' + action);
      }
      return outputJson({ success: true, data: result });
    }
    // action がない → HTML ページを返す
    const page = e.parameter.page || 'admin';
    return servePage(page);
  } catch (err) {
    return outputJson({ success: false, error: err.toString() });
  }
}

// ---- HTML serving ----
function servePage(page) {
  const name = (page === 'index' || page === 'suggest') ? page : 'admin';
  let title, body, jsFile;
  if (name === 'admin') {
    title = '管理者画面 - テスト範囲表';
    body = ADMIN_BODY;
    jsFile = 'admin.js';
  } else if (name === 'index') {
    title = 'テスト範囲表';
    body = INDEX_BODY;
    jsFile = 'script.js';
  } else {
    title = '変更点を提案 - テスト範囲表';
    body = SUGGEST_BODY;
    jsFile = 'suggest.js';
  }
  const css = getGithubContent('style.css');
  const js = getGithubContent(jsFile)
    .replace(/^const API_BASE_URL\s*=.*$/m, 'const API_BASE_URL = window.location.origin + window.location.pathname;');
  const html = '<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' + title + '</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n' + body + '\n<script>\n' + js + '\n<\/script>\n</body>\n</html>';
  return HtmlService.createHtmlOutput(html)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function getGithubContent(filename) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'gh_' + filename;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const url = 'https://raw.githubusercontent.com/sumacha/exam/main/' + filename;
  try {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const content = resp.getContentText();
    cache.put(cacheKey, content, 300);
    return content;
  } catch (e) {
    return '// Error loading ' + filename;
  }
}

// ---- POST handlers ----
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    let result;
    switch (action) {
      case 'addSuggestion':
        result = addSuggestion(params.data);
        break;
      case 'verifyPassword':
        result = verifyPassword();
        break;
      case 'approveSuggestion':
        if (!verifyToken(params.token)) throw new Error('認証が必要です');
        result = approveSuggestion(params.id);
        break;
      case 'rejectSuggestion':
        if (!verifyToken(params.token)) throw new Error('認証が必要です');
        result = rejectSuggestion(params.id);
        break;
      case 'updateVersion':
        if (!verifyToken(params.token)) throw new Error('認証が必要です');
        result = updateVersion(params.version);
        break;
      case 'updateSubjects':
        if (!verifyToken(params.token)) throw new Error('認証が必要です');
        result = updateSubjects(params.course, params.subjects);
        break;
      case 'addScheduleEntry':
        if (!verifyToken(params.token)) throw new Error('認証が必要です');
        result = addScheduleEntry(params.data);
        break;
      case 'updateScheduleEntry':
        if (!verifyToken(params.token)) throw new Error('認証が必要です');
        result = updateScheduleEntry(params.rowIndex);
        break;
      case 'deleteScheduleEntry':
        if (!verifyToken(params.token)) throw new Error('認証が必要です');
        result = deleteScheduleEntry(params.rowIndex);
        break;
      case 'replaceSchedule':
        if (!verifyToken(params.token)) throw new Error('認証が必要です');
        result = replaceSchedule(params.version, params.course, params.rows);
        break;
      case 'updateConfig':
        if (!verifyToken(params.token)) throw new Error('認証が必要です');
        result = updateConfig(params.key, params.value);
        break;
      default:
        throw new Error('Unknown action: ' + action);
    }
    return outputJson({ success: true, data: result });
  } catch (err) {
    return outputJson({ success: false, error: err.toString() });
  }
}

function setJsonHeader() {
  ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);
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
  // Also include the current version from config
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
  // Determine basic subjects based on version (midterm vs final)
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

  // Determine elective subjects based on course
  function getElectiveSubjects() {
    if (course === 'K/文系') return ['歴史'];
    if (course === 'K/理系（物理）' || course === 'SS/理系（物理）') return ['地理', '物理'];
    if (course === 'K/理系（生物）' || course === 'SS/理系（生物）') return ['地理', '生物'];
    return [];
  }

  // Color map
  const colors = {
    '論理国語': '#EF4444', '古典国語': '#DC2626',
    '数学①': '#3B82F6', '数学②': '#2563EB',
    '英C': '#10B981', '論表': '#F97316',
    '化学': '#14B8A6', '公共': '#6B7280',
    '情報': '#6366F1', '保健': '#EC4899',
    '地理': '#8B5CF6', '歴史': '#F59E0B',
    '物理': '#06B6D4', '生物': '#EC4899'
  };

  // Build subject list with proper ordering: basics first, then electives
  const basicSubjects = getBasicSubjects();
  const electiveSubjects = getElectiveSubjects();
  const allSubjects = [...basicSubjects, ...electiveSubjects];

  return allSubjects.map(subject => ({
    course: course,
    subject: subject,
    color: colors[subject] || '#6B7280'
  }));
}

function updateSubjects(course, subjects) {
  const sheet = getSheet(SHEETS.subjects);
  const existing = sheetToObjects(sheet);
  const toRemove = existing.filter(r => r.course === course);
  // Remove old rows for this course (reverse order)
  for (let i = sheet.getLastRow(); i >= 2; i--) {
    const rowCourse = sheet.getRange(i, 1).getValue();
    if (rowCourse === course) {
      sheet.deleteRow(i);
    }
  }
  // Add new rows
  subjects.forEach(s => {
    sheet.appendRow([course, s.subject, s.color || '#3B82F6']);
  });
  return { updated: subjects.length };
}

// ---- Suggestions ----
function addSuggestion(data) {
  const sheet = getSheet(SHEETS.suggestions);
  const rows = sheet.getDataRange().getValues();
  const nextId = rows.length;
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

function approveSuggestion(id) {
  const sheet = getSheet(SHEETS.suggestions);
  const data = sheetToObjects(sheet);
  const target = data.find(r => r.id == id);
  if (!target) throw new Error('提案が見つかりません');
  if (target.status !== '承認待ち') throw new Error('この提案は既に処理されています');

  const rowIndex = data.indexOf(target) + 2;
  const statusCol = 11; // column 11 = status
  sheet.getRange(rowIndex, statusCol).setValue('承認済み');

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
  return { id, status: 'approved' };
}

function rejectSuggestion(id) {
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

// ---- Admin ----
function verifyPassword() {
  const token = generateToken();
  const props = PropertiesService.getScriptProperties();
  const expiry = new Date().getTime() + 2 * 60 * 60 * 1000;
  props.setProperty('session_' + token, expiry + ':admin');
  return { token, expiresIn: 7200 };
}

// ---- Schedule CRUD (Admin) ----
function replaceSchedule(version, course, rows) {
  const sheet = getSheet(SHEETS.schedule);
  // Delete existing rows for version+course (bottom-to-top)
  const allData = sheet.getDataRange().getValues();
  for (let i = allData.length - 1; i >= 1; i--) {
    if (allData[i][0] === version && allData[i][1] === course) {
      sheet.deleteRow(i + 1);
    }
  }
  // Add new rows
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

function addScheduleEntry(data) {
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

function updateScheduleEntry(rowIndex) {
  const sheet = getSheet(SHEETS.schedule);
  const data = sheetToObjects(sheet);
  const target = data.find(r => r._rowIndex == rowIndex);
  if (!target) throw new Error('エントリが見つかりません');
  return { success: true };
}

function deleteScheduleEntry(rowIndex) {
  const sheet = getSheet(SHEETS.schedule);
  if (rowIndex < 2 || rowIndex > sheet.getLastRow()) throw new Error('不正な行番号です');
  sheet.deleteRow(rowIndex);
  return { success: true };
}

function updateVersion(version) {
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

function updateConfig(key, value) {
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

// ---- Test / Setup helper ----
function setupInitialData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Create config
  let sheet = ss.getSheetByName(SHEETS.config);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.config);
    sheet.appendRow(['key', 'value']);
    sheet.appendRow(['password', 'exam2026']);
    sheet.appendRow(['version', '1学期 中間テスト']);
    sheet.appendRow(['versionLabel', '2026年度']);
  }

  // Create subjects
  sheet = ss.getSheetByName(SHEETS.subjects);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.subjects);
    sheet.appendRow(['course', 'subject', 'color']);
    // Basic subjects (midterm - used as reference; actual subjects are computed)
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
    // Write reference subjects (basics + electives per course)
    for (const [course, electives] of Object.entries(electiveData)) {
      for (const subj of basicSubjects) {
        sheet.appendRow([course, subj, basicColors[subj] || '#6B7280']);
      }
      for (const subj of electives) {
        sheet.appendRow([course, subj, electiveColors[subj] || '#6B7280']);
      }
    }
  }

  // Create schedule
  sheet = ss.getSheetByName(SHEETS.schedule);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.schedule);
    sheet.appendRow(['version', 'course', 'subject', 'date', 'period', 'scope', 'notes', 'color']);
    sheet.appendRow(['1学期 中間テスト', 'K/文系', '論理国語', '6/15(月)', '1時間目', '教科書 p.10~45\nワーク p.2~20', '漢字テストあり', '#EF4444']);
    sheet.appendRow(['1学期 中間テスト', 'K/文系', '古典国語', '6/15(月)', '2時間目', '教科書 古文編 p.1~30', '古文学習あり', '#DC2626']);
    sheet.appendRow(['1学期 中間テスト', 'K/文系', '数学①', '6/16(火)', '1時間目', '教科書 p.10~45\n問題集 p.5~25', '計算問題中心', '#3B82F6']);
    sheet.appendRow(['1学期 中間テスト', 'K/文系', '歴史', '6/18(木)', '3時間目', '教科書 第1章~第3章\nノートまとめ', '記述問題あり', '#F59E0B']);
  }

  // Create suggestions
  sheet = ss.getSheetByName(SHEETS.suggestions);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.suggestions);
    sheet.appendRow(['id', 'version', 'course', 'subject', 'type', 'date', 'period', 'scope', 'notes', 'reason', 'status', 'createdAt']);
  }

  return '初期データを作成しました';
}

// ============================================================
//  HTML Body Templates (inline)
//  JS/CSS は GitHub から取得
// ============================================================

const ADMIN_BODY = '  <!-- Header -->\n\
  <header class="header">\n\
    <div class="header-inner">\n\
      <div class="header-title">\n\
        <span class="icon">⚙️</span>\n\
        管理者画面\n\
      </div>\n\
      <div style="display:flex; align-items:center; gap:4px;">\n\
        <a class="menu-btn" href="?page=index" aria-label="トップ" title="トップに戻る" style="text-decoration:none; font-size:0.85rem; color:var(--gray-500); padding:6px 10px;">📋 トップ</a>\n\
        <button class="menu-btn" id="backBtn" aria-label="戻る">\n\
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>\n\
        </button>\n\
      </div>\n\
    </div>\n\
  </header>\n\
  <!-- Auth Guard -->\n\
  <div class="auth-guard" id="authGuard">\n\
    <div class="modal-card password-modal" style="max-width:380px; margin:0 16px;">\n\
      <div class="modal-title">🔑</div>\n\
      <div class="modal-title" style="font-size:1rem; margin-top:8px;">管理者認証</div>\n\
      <div class="modal-subtitle">パスワードを入力してください</div>\n\
      <form id="passwordForm" novalidate>\n\
        <div class="form-group">\n\
          <input class="form-input" type="password" id="passwordInput" placeholder="パスワード" required autocomplete="off">\n\
        </div>\n\
        <div class="error-box hidden" id="authError">\n\
          <span>⚠️</span>\n\
          <span id="authErrorMessage"></span>\n\
        </div>\n\
        <button type="submit" class="btn btn-primary btn-full">ログイン</button>\n\
      </form>\n\
    </div>\n\
  </div>\n\
  <!-- Admin Content -->\n\
  <main class="container admin-content" id="adminContent">\n\
    <div class="admin-panel">\n\
      <div class="admin-card">\n\
        <h3>📌 バージョン管理</h3>\n\
        <div style="margin-bottom:12px;"><span style="font-size:0.85rem; color:var(--gray-500);">現在のバージョン:</span> <span class="version-current" id="currentVersion">--</span></div>\n\
        <div class="version-control">\n\
          <select class="form-select" id="versionSelect" style="width:auto; min-width:200px;" disabled><option value="">読み込み中...</option></select>\n\
          <button class="btn btn-primary btn-sm" id="updateVersionBtn" disabled>反映</button>\n\
          <button class="btn btn-outline btn-sm" id="addVersionBtn">＋ 新規作成</button>\n\
        </div>\n\
      </div>\n\
      <div class="admin-card">\n\
        <h3>📅 スケジュール編集</h3>\n\
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px; align-items:center;">\n\
          <select class="form-select" id="editVersionSelect" style="width:auto; min-width:180px;"><option value="">バージョン</option></select>\n\
          <select class="form-select" id="editCourseSelect" style="width:auto; min-width:180px;">\n\
            <option value="K/文系">K/文系</option><option value="K/理系（物理）">K/理系（物理）</option>\n\
            <option value="K/理系（生物）">K/理系（生物）</option><option value="SS/理系（物理）">SS/理系（物理）</option>\n\
            <option value="SS/理系（生物）">SS/理系（生物）</option>\n\
          </select>\n\
          <button class="btn btn-primary btn-sm" id="loadScheduleBtn">読み込み</button>\n\
          <button class="btn btn-outline btn-sm" id="addEntryBtn">＋ 行を追加</button>\n\
          <button class="btn btn-success btn-sm" id="saveScheduleBtn">💾 保存</button>\n\
        </div>\n\
        <div class="schedule-editor" id="scheduleEditor"><div class="empty-state"><p>「読み込み」ボタンでデータを取得してください</p></div></div>\n\
      </div>\n\
      <div class="admin-card">\n\
        <h3>💡 提案一覧</h3>\n\
        <div class="tab-bar" id="sugTabBar">\n\
          <button class="tab-btn active" data-filter="all">すべて</button>\n\
          <button class="tab-btn" data-filter="test_scope">📖 範囲</button>\n\
          <button class="tab-btn" data-filter="submission">📝 提出物</button>\n\
        </div>\n\
        <div class="loading" id="sugLoading"><div class="spinner"></div><p>読み込み中...</p></div>\n\
        <div id="suggestionList"></div>\n\
      </div>\n\
    </div>\n\
  </main>';

const INDEX_BODY = '  <!-- Header -->\n\
  <header class="header">\n\
    <div class="header-inner">\n\
      <div class="header-title">\n\
        <span class="icon">📋</span>\n\
        テスト範囲表\n\
      </div>\n\
      <div style="display:flex; align-items:center; gap:4px;">\n\
        <button class="menu-btn" id="printBtn" aria-label="印刷" title="印刷">\n\
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;">\n\
            <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>\n\
            <path d="M6 14h12v8H6z"/>\n\
          </svg>\n\
        </button>\n\
        <button class="dark-toggle-btn" id="darkModeBtn" aria-label="ダークモード切替" title="ダークモード">🌙</button>\n\
        <button class="menu-btn" id="menuBtn" aria-label="メニューを開く">\n\
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">\n\
            <line x1="4" y1="6" x2="20" y2="6"/>\n\
            <line x1="4" y1="12" x2="20" y2="12"/>\n\
            <line x1="4" y1="18" x2="20" y2="18"/>\n\
          </svg>\n\
        </button>\n\
      </div>\n\
    </div>\n\
  </header>\n\
  <div class="menu-overlay" id="menuOverlay"></div>\n\
  <div class="menu-dropdown" id="menuDropdown">\n\
    <div class="menu-course-label" id="menuCourseLabel">現在: --</div>\n\
    <div class="menu-section-label">セクション</div>\n\
    <button class="menu-item" data-action="scrollTo" data-target="topSection"><span class="menu-icon">📋</span> トップ</button>\n\
    <button class="menu-item" data-action="openTimer"><span class="menu-icon">⏱</span> タイマーを開く</button>\n\
    <button class="menu-item" data-action="scrollTo" data-target="scheduleCard"><span class="menu-icon">📅</span> テスト日程</button>\n\
    <div class="menu-section-label">設定</div>\n\
    <button class="menu-item" data-action="changeCourse"><span class="menu-icon">🔄</span> コース変更</button>\n\
    <button class="menu-item" data-action="toggleDarkMode"><span class="menu-icon">🌙</span> ダークモード切替</button>\n\
    <div class="menu-divider"></div>\n\
    <button class="menu-item" data-action="exportCalendar"><span class="menu-icon">📅</span> カレンダーに追加 (.ics)</button>\n\
    <a class="menu-item" href="?page=suggest"><span class="menu-icon">💡</span> 変更点を提案</a>\n\
    <a class="menu-item" href="?page=admin"><span class="menu-icon">⚙️</span> 管理者画面</a>\n\
  </div>\n\
  <main class="container" id="mainContent">\n\
    <div class="info-card" id="topSection">\n\
      <div class="info-header">\n\
        <div><span class="info-badge badge-course" id="courseBadge">コース未選択</span><span class="info-badge badge-version" id="versionBadge">--</span></div>\n\
        <div class="info-title" id="versionLabel">2026年度</div>\n\
      </div>\n\
    </div>\n\
    <div class="info-card countdown-card hidden" id="countdownCard">\n\
      <div class="countdown-number" id="countdownNumber">--</div>\n\
      <div class="countdown-label">次のテストまであと</div>\n\
      <div class="countdown-sub" id="countdownSub">テスト日程を読み込んでいます...</div>\n\
    </div>\n\
    <div class="info-card" id="topProgressCard">\n\
      <div class="progress-top">\n\
        <span class="label">📝 提出物進捗</span>\n\
        <span class="stat" id="topProgressText">0 / 0</span>\n\
        <div class="progress-bar-wrap"><div class="progress-bar-fill" id="topProgressBar" style="width:0%"></div></div>\n\
        <button class="progress-reset-btn" id="resetProgressBtn">リセット</button>\n\
      </div>\n\
    </div>\n\
    <div class="loading" id="loading"><div class="spinner"></div><p>読み込み中...</p></div>\n\
    <div class="error-box hidden" id="errorBox"><span>⚠️</span><span id="errorMessage"></span></div>\n\
    <div class="info-card" id="scheduleCard">\n\
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:12px;">\n\
        <span style="font-size:1rem; font-weight:700; color:var(--text-secondary);">📅 テスト時間割・範囲</span>\n\
        <div style="display:flex; align-items:center; gap:8px;">\n\
          <button class="calendar-export-btn" id="calendarExportBtn">📅 .ics エクスポート</button>\n\
          <span style="font-size:0.75rem; color:var(--gray-400);" id="lastUpdated"></span>\n\
        </div>\n\
      </div>\n\
      <div class="subj-progress-grid" id="subjectProgressContainer" style="margin-bottom:16px;"></div>\n\
      <div class="schedule-wrapper">\n\
        <table class="schedule-table" id="scheduleTable">\n\
          <thead><tr><th>教科</th><th>日程</th><th>時限</th><th>範囲</th><th>備考</th><th style="text-align:center; width:48px;">✓</th></tr></thead>\n\
          <tbody id="scheduleBody"></tbody>\n\
        </table>\n\
      </div>\n\
      <div class="empty-state hidden" id="emptyState"><div class="empty-icon">📭</div><p>スケジュールデータがありません</p></div>\n\
    </div>\n\
  </main>\n\
  <div class="modal-overlay" id="courseModal">\n\
    <div class="modal-card">\n\
      <div class="modal-title">コースを選択してください</div>\n\
      <div class="modal-subtitle">テスト範囲表の表示内容が変わります</div>\n\
      <div class="course-grid" id="courseGrid">\n\
        <button class="course-btn" data-course="K/文系">K/文系 <span class="course-sub">基本教科 + 歴史</span></button>\n\
        <button class="course-btn" data-course="K/理系（物理）">K/理系（物理） <span class="course-sub">基本教科 + 地理 + 物理</span></button>\n\
        <button class="course-btn" data-course="K/理系（生物）">K/理系（生物） <span class="course-sub">基本教科 + 地理 + 生物</span></button>\n\
        <button class="course-btn" data-course="SS/理系（物理）">SS/理系（物理） <span class="course-sub">基本教科 + 地理 + 物理</span></button>\n\
        <button class="course-btn" data-course="SS/理系（生物）">SS/理系（生物） <span class="course-sub">基本教科 + 地理 + 生物</span></button>\n\
      </div>\n\
    </div>\n\
  </div>\n\
  <div class="modal-overlay hidden" id="timerModal">\n\
    <div class="modal-card timer-modal-card">\n\
      <div class="timer-modal-header">\n\
        <div class="timer-title">⏱ 勉強タイマー</div>\n\
        <div class="timer-modal-actions"><button class="menu-btn" id="timerFullscreenBtn" title="全画面">⛶</button><button class="menu-btn" id="timerCloseBtn">✕</button></div>\n\
      </div>\n\
      <div class="timer-controls">\n\
        <select class="form-select timer-subject-select" id="timerSubject" style="width:auto; min-width:140px;"><option value="">教科を選択</option></select>\n\
        <div class="timer-duration-controls">\n\
          <label class="duration-label">集中</label>\n\
          <input type="number" class="form-input duration-input" id="timerFocusMin" value="25" min="1" max="120">\n\
          <span class="duration-unit">分</span>\n\
          <label class="duration-label">休憩</label>\n\
          <input type="number" class="form-input duration-input" id="timerBreakMin" value="5" min="1" max="30">\n\
          <span class="duration-unit">分</span>\n\
        </div>\n\
      </div>\n\
      <div class="timer-display-area">\n\
        <div class="timer-progress-ring focus" id="timerRing">\n\
          <svg width="180" height="180" viewBox="0 0 180 180">\n\
            <circle class="bg-circle" cx="90" cy="90" r="78"/>\n\
            <circle class="fg-circle" cx="90" cy="90" r="78" stroke-dasharray="490.09" stroke-dashoffset="0" id="timerProgressCircle"/>\n\
          </svg>\n\
        </div>\n\
        <div class="timer-display" id="timerDisplay">25:00</div>\n\
        <div class="timer-mode-label" id="timerModeLabel">📚 集中</div>\n\
      </div>\n\
      <div class="timer-actions">\n\
        <button class="btn btn-success btn-sm" id="timerToggleBtn">▶ 開始</button>\n\
        <button class="btn btn-outline btn-sm" id="timerResetBtn">↺ リセット</button>\n\
      </div>\n\
      <div class="timer-stats" id="timerStats">\n\
        <div class="timer-stats-title">今日の勉強時間</div>\n\
        <div class="timer-empty">まだ記録がありません</div>\n\
      </div>\n\
    </div>\n\
  </div>';

const SUGGEST_BODY = '  <!-- Header -->\n\
  <header class="header">\n\
    <div class="header-inner">\n\
      <div class="header-title">\n\
        <span class="icon">💡</span>\n\
        変更点を提案\n\
      </div>\n\
      <div style="display:flex; align-items:center; gap:4px;">\n\
        <a class="menu-btn" href="?page=index" aria-label="トップに戻る" title="トップに戻る" style="text-decoration:none; font-size:0.85rem; color:var(--gray-500); padding:6px 10px;">📋 トップ</a>\n\
        <button class="menu-btn" id="backBtn" aria-label="戻る">\n\
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>\n\
        </button>\n\
      </div>\n\
    </div>\n\
  </header>\n\
  <main class="container">\n\
    <div class="suggest-card">\n\
      <h2>テスト範囲表の修正・追加を提案</h2>\n\
      <p class="desc">範囲表に誤りがあった場合や、追加したい情報がある場合はこちらから提案してください。管理者が確認後、反映されます。</p>\n\
      <div class="error-box hidden" id="errorBox"><span>⚠️</span><span id="errorMessage"></span></div>\n\
      <form id="suggestForm" novalidate>\n\
        <div class="form-group">\n\
          <label class="form-label">提案の種類 <span class="required">*</span></label>\n\
          <div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:4px;">\n\
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.9rem;">\n\
              <input type="radio" name="sugType" value="test_scope" checked> 📖 テスト範囲の変更\n\
            </label>\n\
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.9rem;">\n\
              <input type="radio" name="sugType" value="submission"> 📝 提出物の変更\n\
            </label>\n\
          </div>\n\
        </div>\n\
        <div class="form-group">\n\
          <label class="form-label" for="sugVersion">対象の定期テスト <span class="required">*</span></label>\n\
          <select class="form-select" id="sugVersion" required><option value="">読み込み中...</option></select>\n\
        </div>\n\
        <div class="form-group">\n\
          <label class="form-label" for="sugCourse">コース <span class="required">*</span></label>\n\
          <select class="form-select" id="sugCourse" required>\n\
            <option value="">選択してください</option>\n\
            <option value="K/文系">K/文系</option>\n\
            <option value="K/理系（物理）">K/理系（物理）</option>\n\
            <option value="K/理系（生物）">K/理系（生物）</option>\n\
            <option value="SS/理系（物理）">SS/理系（物理）</option>\n\
            <option value="SS/理系（生物）">SS/理系（生物）</option>\n\
          </select>\n\
        </div>\n\
        <div class="form-group">\n\
          <label class="form-label" for="sugSubject">教科 <span class="required">*</span></label>\n\
          <select class="form-select" id="sugSubject" required><option value="">先にコースを選択してください</option></select>\n\
        </div>\n\
        <div id="scopeFields">\n\
          <div class="form-group"><label class="form-label" for="sugDate">日程</label><input class="form-input" type="text" id="sugDate" placeholder="例: 6/15(月)"></div>\n\
          <div class="form-group"><label class="form-label" for="sugPeriod">時限</label><input class="form-input" type="text" id="sugPeriod" placeholder="例: 2時間目"></div>\n\
          <div class="form-group"><label class="form-label" for="sugScope">範囲</label><textarea class="form-textarea" id="sugScope" placeholder="例: 教科書 p.10~45&#10;ワーク p.2~20" rows="3"></textarea></div>\n\
          <div class="form-group"><label class="form-label" for="sugNotes">備考</label><textarea class="form-textarea" id="sugNotes" placeholder="テストの形式や注意事項など" rows="2"></textarea></div>\n\
        </div>\n\
        <div id="submissionFields" class="hidden">\n\
          <div class="form-group"><label class="form-label" for="sugSubNotes">提出物の詳細 <span class="required">*</span></label><textarea class="form-textarea" id="sugSubNotes" placeholder="提出物の内容、期限など" rows="3" required></textarea></div>\n\
        </div>\n\
        <button type="submit" class="btn btn-primary btn-full" id="submitBtn">提案を送信する</button>\n\
      </form>\n\
      <div class="loading hidden" id="loading" style="padding:20px 0;"><div class="spinner"></div><p>送信中...</p></div>\n\
      <div class="empty-state hidden" id="successState">\n\
        <div class="empty-icon">✅</div>\n\
        <p>提案を送信しました！</p>\n\
        <p style="font-size:0.85rem; color:var(--gray-400); margin-top:8px;">管理者が確認後、反映されます</p>\n\
        <button class="btn btn-outline" style="margin-top:16px;" onclick="location.href=\'?page=index\'">トップに戻る</button>\n\
      </div>\n\
    </div>\n\
  </main>';
