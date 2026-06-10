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
  suggestions: 'suggestions'
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
        case 'getVersions':
          result = getVersions();
          break;
        default:
          throw new Error('Unknown action: ' + action);
      }
      return outputJson({ success: true, data: result });
    }
    const page = e.parameter.page || 'index';
    return servePage(page);
  } catch (err) {
    return outputJson({ success: false, error: err.toString() });
  }
}

// ---- HTML serving ----
function servePage(page) {
  const name = page === 'suggest' ? 'Page_Suggest' : page === 'admin' ? 'Page_Admin' : 'Page_Index';
  return HtmlService.createTemplateFromFile(name)
    .evaluate()
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
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    let result;
    switch (action) {
      case 'addSuggestion':
        result = addSuggestion(params.data);
        break;
      case 'approveSuggestion':
        result = approveSuggestion(params.id);
        break;
      case 'rejectSuggestion':
        result = rejectSuggestion(params.id);
        break;
      case 'updateVersion':
        result = updateVersion(params.version);
        break;
      case 'updateSubjects':
        result = updateSubjects(params.course, params.subjects);
        break;
      case 'addScheduleEntry':
        result = addScheduleEntry(params.data);
        break;
      case 'updateScheduleEntry':
        result = updateScheduleEntry(params.rowIndex);
        break;
      case 'deleteScheduleEntry':
        result = deleteScheduleEntry(params.rowIndex);
        break;
      case 'replaceSchedule':
        result = replaceSchedule(params.version, params.course, params.rows);
        break;
      case 'updateConfig':
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

function updateSubjects(course, subjects) {
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
  const statusCol = 11;
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

// ---- Schedule CRUD (Admin) ----
function replaceSchedule(version, course, rows) {
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

  return '初期データを作成しました';
}
