/* ============================================================
   設定
   ============================================================ */
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbwWNG4xKO6yGTWTz2Z9oxdOOkGfHsfia7ItUdvAXPSqwe_tlbrhVTgPgXA_64bmFfG1FA/exec';

/* ============================================================
   Utility
   ============================================================ */
function $(sel) { return document.querySelector(sel); }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function escHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function toast(msg) {
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();
  var t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.remove(); }, 2500);
}

async function apiPost(data) {
  const res = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(data)
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('サーバーエラー: HTMLが返されました');
  }
}

async function apiFetch(action, params = {}) {
  const res = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, ...params })
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('サーバーエラー: HTMLが返されました');
  }
}

/* ============================================================
   Init
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

  $('#backBtn').addEventListener('click', () => { window.location.href = 'https://script.google.com/macros/s/AKfycbwWNG4xKO6yGTWTz2Z9oxdOOkGfHsfia7ItUdvAXPSqwe_tlbrhVTgPgXA_64bmFfG1FA/exec?page=index'; });

  // Load versions
  loadVersions();

  // Load saved course
  const savedCourse = localStorage.getItem('exam_course_selected');
  if (savedCourse) {
    $('#sugCourse').value = savedCourse;
    // Load subjects after versions are loaded
  }

  // Course change → load subjects
  $('#sugCourse').addEventListener('change', (e) => {
    const course = e.target.value;
    if (course) {
      loadSubjects(course, $('#sugVersion').value);
    } else {
      const sel = $('#sugSubject');
      sel.innerHTML = '<option value="">先にコースを選択してください</option>';
    }
  });

  // Version change → reload subjects if course is selected
  $('#sugVersion').addEventListener('change', (e) => {
    const course = $('#sugCourse').value;
    if (course) {
      loadSubjects(course, e.target.value);
    }
  });

  // Type toggle → show/hide fields
  document.querySelectorAll('input[name="sugType"]').forEach(radio => {
    radio.addEventListener('change', toggleTypeFields);
  });

  // Form submit
  $('#suggestForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const type = document.querySelector('input[name="sugType"]:checked').value;
    const version = $('#sugVersion').value;
    const course = $('#sugCourse').value;
    const subject = $('#sugSubject').value;
    const date = $('#sugDate').value.trim();
    const period = $('#sugPeriod').value.trim();
    const scope = $('#sugScope').value.trim();
    const notes = type === 'submission' ? $('#sugSubNotes').value.trim() : $('#sugNotes').value.trim();

    if (!version || !course || !subject) {
      show($('#errorBox'));
      $('#errorMessage').textContent = '定期テスト、コース、教科は必須です';
      return;
    }
    if (type === 'submission' && !notes) {
      show($('#errorBox'));
      $('#errorMessage').textContent = '提出物の詳細を入力してください';
      return;
    }

    hide($('#errorBox'));
    show($('#loading'));
    hide($('#suggestForm'));

    try {
      const res = await apiPost({
        action: 'addSuggestion',
        data: { type, version, course, subject, date, period, scope, notes }
      });

      if (!res.success) throw new Error(res.error);

      show($('#successState'));

    } catch (err) {
      hide($('#loading'));
      show($('#suggestForm'));
      show($('#errorBox'));
      $('#errorMessage').textContent = '送信に失敗しました: ' + err.message;
    }
  });
});

/* ============================================================
   Toggle fields based on suggestion type
   ============================================================ */
function toggleTypeFields() {
  const type = document.querySelector('input[name="sugType"]:checked').value;
  if (type === 'submission') {
    hide($('#scopeFields'));
    show($('#submissionFields'));
  } else {
    show($('#scopeFields'));
    hide($('#submissionFields'));
  }
}

/* ============================================================
   Load Versions
   ============================================================ */
async function loadVersions() {
  const sel = $('#sugVersion');
  try {
    const [configRes, versionsRes] = await Promise.all([
      apiFetch('getConfig'),
      apiFetch('getVersions')
    ]);

    const currentVersion = configRes.success ? configRes.data.version : '';
    const versions = versionsRes.success ? versionsRes.data : [];

    sel.innerHTML = '<option value="">選択してください</option>';
    versions.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === currentVersion) opt.selected = true;
      sel.appendChild(opt);
    });

    if (versions.length === 0) {
      sel.innerHTML = '<option value="">利用可能なバージョンがありません</option>';
    }

    // Load subjects if a saved course exists
    const savedCourse = localStorage.getItem('exam_course_selected');
    if (savedCourse && $('#sugCourse').value === savedCourse) {
      loadSubjects(savedCourse, sel.value);
    }
  } catch (err) {
    sel.innerHTML = '<option value="">読み込みに失敗しました</option>';
  }
}

/* ============================================================
   Load Subjects
   ============================================================ */
async function loadSubjects(course, version) {
  const sel = $('#sugSubject');
  sel.innerHTML = '<option value="">読み込み中...</option>';
  sel.disabled = true;

  try {
    const res = await apiFetch('getSubjects', { course, version: version || '' });
    if (!res.success) throw new Error(res.error);

    sel.innerHTML = '<option value="">選択してください</option>';
    (res.data || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.subject;
      opt.textContent = s.subject;
      sel.appendChild(opt);
    });
  } catch (err) {
    sel.innerHTML = '<option value="">読み込みに失敗しました</option>';
  } finally {
    sel.disabled = false;
  }
}

function resetSuggestionForm() {
  document.getElementById('suggestForm').reset();
  document.getElementById('successState').classList.add('hidden');
  document.getElementById('suggestForm').classList.remove('hidden');
  document.getElementById('errorBox').classList.add('hidden');
}
