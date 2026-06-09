/* ============================================================
   設定
   ============================================================ */
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycby-FF_3BI8QaXH0dhB90gVwy5H-slBySlel8R2QUe0nY6x37CYp5qhvIQi_I3c4FwUuKg/exec';

/* ============================================================
   State
   ============================================================ */
let state = {
  token: null,
  config: null,
  suggestions: [],
  versions: [],
  scheduleData: [],
  editVersion: '',
  editCourse: 'K/文系',
  filterType: 'all',
  useCourseSchedule: true
};

/* ============================================================
   Utility
   ============================================================ */
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function toast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function apiPost(data) {
  return fetch(API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json());
}

function apiFetch(action, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = API_BASE_URL + '?action=' + action + (qs ? '&' + qs : '');
  return fetch(url).then(r => r.json());
}

/* ============================================================
   Auth
   ============================================================ */
function getToken() {
  return sessionStorage.getItem('admin_token');
}

function setToken(token) {
  sessionStorage.setItem('admin_token', token);
}

async function checkAuth() {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await apiFetch('checkAuth', { token });
    return res.success && res.data.valid === true;
  } catch {
    return false;
  }
}

async function login(password) {
  const res = await apiPost({ action: 'verifyPassword', password });
  if (!res.success) throw new Error(res.error);
  setToken(res.data.token);
  state.token = res.data.token;
  return true;
}

function logout() {
  sessionStorage.removeItem('admin_token');
  state.token = null;
  showAuthGuard();
}

/* ============================================================
   UI - Auth Guard
   ============================================================ */
function showAdminContent() {
  hide($('#authGuard'));
  $('#adminContent').classList.add('active');
}

function showAuthGuard() {
  show($('#authGuard'));
  $('#adminContent').classList.remove('active');
}

/* ============================================================
   Version Management
   ============================================================ */
async function loadVersions() {
  try {
    const res = await apiFetch('getVersions');
    if (!res.success) throw new Error(res.error);
    state.versions = res.data || [];

    const sel = $('#versionSelect');
    const sel2 = $('#editVersionSelect');
    sel.innerHTML = '<option value="">バージョンを選択</option>';
    sel2.innerHTML = '<option value="">バージョンを選択</option>';

    state.versions.forEach(v => {
      sel.appendChild(new Option(v, v));
      sel2.appendChild(new Option(v, v));
    });

    if (state.config && state.config.version) {
      sel.value = state.config.version;
      sel2.value = state.config.version;
    }
    sel.disabled = false;
    $('#updateVersionBtn').disabled = false;
  } catch (err) {
    toast('バージョン一覧の取得に失敗');
  }
}

async function updateVersion() {
  const newVersion = $('#versionSelect').value;
  if (!newVersion) { toast('バージョンを選択してください'); return; }

  try {
    const res = await apiPost({
      action: 'updateVersion', version: newVersion, token: getToken()
    });
    if (!res.success) throw new Error(res.error);

    state.config.version = newVersion;
    $('#currentVersion').textContent = newVersion;
    $('#editVersionSelect').value = newVersion;
    toast('「' + newVersion + '」を反映しました');
  } catch (err) {
    handleAuthError(err);
  }
}

function addNewVersion() {
  const name = prompt('新しいバージョン名を入力（例: 2学期 期末テスト）:');
  if (!name || !name.trim()) return;

  apiPost({
    action: 'updateVersion', version: name.trim(), token: getToken()
  }).then(res => {
    if (!res.success) throw new Error(res.error);
    state.config.version = name.trim();
    $('#currentVersion').textContent = name.trim();
    loadVersions();
    toast('「' + name.trim() + '」を作成しました');
  }).catch(err => handleAuthError(err));
}

/* ============================================================
   Schedule Editor
   ============================================================ */
async function loadScheduleForEdit() {
  const version = $('#editVersionSelect').value;
  const course = $('#editCourseSelect').value;
  if (!version) { toast('バージョンを選択してください'); return; }

  state.editVersion = version;
  state.editCourse = course;

  try {
    const params = { version };
    if (state.useCourseSchedule) params.course = course;
    const res = await apiFetch('getSchedule', params);
    if (!res.success) throw new Error(res.error);
    state.scheduleData = (res.data || []).map((row, i) => ({ ...row, _editId: i }));
    renderScheduleEditor();
  } catch (err) {
    toast('読み込みに失敗: ' + err.message);
  }
}

function renderScheduleEditor() {
  const editor = $('#scheduleEditor');
  if (state.scheduleData.length === 0) {
    editor.innerHTML = '<div class="empty-state" style="padding:20px;"><p>データがありません。「+ 行を追加」で追加してください</p></div>';
    return;
  }

  const data = state.scheduleData;
  let html = `<table>
    <thead><tr>
      <th>教科</th><th>日程</th><th>時限</th><th>範囲</th><th>備考</th><th>操作</th>
    </tr></thead><tbody>`;

  data.forEach((row, i) => {
    html += `<tr data-index="${i}">
      <td><input class="edit-input" type="text" value="${escAttr(row.subject || '')}" data-field="subject"></td>
      <td><input class="edit-input" type="text" value="${escAttr(row.date || '')}" data-field="date" placeholder="6/15(月)"></td>
      <td><input class="edit-input" type="text" value="${escAttr(row.period || '')}" data-field="period" placeholder="1時間目"></td>
      <td><input class="edit-input" type="text" value="${escAttr(row.scope || '')}" data-field="scope" placeholder="p.10~45"></td>
      <td><input class="edit-input" type="text" value="${escAttr(row.notes || '')}" data-field="notes"></td>
      <td class="row-actions">
        <button class="btn btn-danger btn-sm" data-action="delete" data-index="${i}">削除</button>
      </td>
    </tr>`;
  });

  html += '</tbody></table>';
  editor.innerHTML = html;

  editor.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      state.scheduleData.splice(idx, 1);
      renderScheduleEditor();
    });
  });
}

function addEmptyRow() {
  state.scheduleData.push({
    _editId: Date.now(),
    version: state.editVersion,
    course: state.editCourse,
    subject: '',
    date: '',
    period: '',
    scope: '',
    notes: '',
    color: '#3B82F6'
  });
  renderScheduleEditor();
}

async function saveSchedule() {
  const token = getToken();
  const version = state.editVersion;
  const course = state.editCourse;
  if (!version) { toast('バージョンを選択してください'); return; }

  const editor = $('#scheduleEditor');
  const rows = [];
  editor.querySelectorAll('tr[data-index]').forEach(tr => {
    const inputs = tr.querySelectorAll('.edit-input');
    const row = {};
    inputs.forEach(inp => { row[inp.dataset.field] = inp.value; });
    if (row.subject && row.subject.trim()) {
      rows.push({
        subject: row.subject,
        date: row.date || '',
        period: row.period || '',
        scope: row.scope || '',
        notes: row.notes || '',
        color: getSubjectColor(row.subject)
      });
    }
  });

  try {
    const payload = {
      action: 'replaceSchedule',
      version, rows, token
    };
    if (state.useCourseSchedule) payload.course = course;
    else payload.course = '共通';
    const res = await apiPost(payload);
    if (!res.success) throw new Error(res.error);
    toast('保存しました (' + (res.data ? res.data.inserted : rows.length) + '件)');
    loadScheduleForEdit();
  } catch (err) {
    handleAuthError(err);
  }
}

function getSubjectColor(subject) {
  const colors = {
    '論理国語': '#EF4444', '古典国語': '#DC2626',
    '数学①': '#3B82F6', '数学②': '#2563EB',
    '英C': '#10B981', '論表': '#F97316',
    '化学': '#14B8A6', '公共': '#6B7280',
    '情報': '#6366F1', '保健': '#EC4899',
    '歴史': '#F59E0B', '地理': '#8B5CF6',
    '物理': '#06B6D4', '生物': '#EC4899'
  };
  return colors[subject] || '#6B7280';
}

/* ============================================================
   Suggestions
   ============================================================ */
async function loadSuggestions() {
  const list = $('#suggestionList');
  const loading = $('#sugLoading');
  show(loading);

  try {
    const res = await apiFetch('getSuggestions', { token: getToken() });
    if (!res.success) throw new Error(res.error);

    state.suggestions = res.data || [];
    renderSuggestions();

  } catch (err) {
    if (err.message.includes('認証')) { logout(); toast('認証が切れました'); }
    else { list.innerHTML = '<div class="empty-state"><p>読み込みに失敗しました</p></div>'; }
  } finally {
    hide(loading);
  }
}

function renderSuggestions() {
  const list = $('#suggestionList');
  list.innerHTML = '';

  const filtered = state.filterType === 'all'
    ? state.suggestions
    : state.suggestions.filter(s => s.type === state.filterType);

  const pending = filtered.filter(s => s.status === '承認待ち');
  const processed = filtered.filter(s => s.status !== '承認待ち');

  if (pending.length === 0 && processed.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>提案はありません</p></div>';
    return;
  }

  if (pending.length > 0) {
    const section = document.createElement('div');
    section.innerHTML = '<div style="font-size:0.85rem; font-weight:600; color:var(--gray-500); margin:8px 0 12px;">承認待ち (' + pending.length + ')</div>';
    pending.forEach(s => section.appendChild(createSuggestionItem(s)));
    list.appendChild(section);
  }

  if (processed.length > 0) {
    const section = document.createElement('div');
    section.innerHTML = '<div style="font-size:0.85rem; font-weight:600; color:var(--gray-500); margin:16px 0 12px;">処理済み (' + processed.length + ')</div>';
    processed.forEach(s => section.appendChild(createSuggestionItem(s)));
    list.appendChild(section);
  }
}

function createSuggestionItem(s) {
  const div = document.createElement('div');
  div.className = 'suggestion-item';

  const statusClass = s.status === '承認待ち' ? 'status-pending'
    : s.status === '承認済み' ? 'status-approved' : 'status-rejected';

  const statusLabel = s.status === '承認待ち' ? '⚠ 承認待ち'
    : s.status === '承認済み' ? '✓ 承認済み' : '✗ 却下';

  const isScope = s.type === 'test_scope' || !s.type;
  const typeLabel = isScope ? '📖 範囲変更' : '📝 提出物';
  const typeClass = isScope ? 'sug-type-scope' : 'sug-type-submission';

  div.innerHTML = `
    <div class="sug-header">
      <div>
        <span class="sug-subject">${escHtml(s.subject)}</span>
        <span class="sug-type-badge ${typeClass}">${typeLabel}</span>
        <span style="font-size:0.8rem; color:var(--gray-400); margin-left:6px;">${escHtml(s.course)}</span>
      </div>
      <span class="sug-status ${statusClass}">${statusLabel}</span>
    </div>
    <div class="sug-body">
      <strong>バージョン:</strong> ${escHtml(s.version || '')}<br>
      ${isScope ? `<strong>日程:</strong> ${escHtml(s.date || '未設定')} ${s.period ? escHtml('/ ' + s.period) : ''}<br>
      <strong>範囲:</strong> ${escHtml(s.scope || '未設定')}<br>` : ''}
      <strong>${isScope ? '備考' : '提出物詳細'}:</strong> ${escHtml(s.notes || '未設定')}
    </div>
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
      <span class="sug-created">${s.createdAt ? new Date(s.createdAt).toLocaleString('ja-JP') : ''}</span>
      ${s.status === '承認待ち' ? `
        <div class="sug-actions">
          <button class="btn btn-success btn-sm" data-action="approve" data-id="${s.id}">承認</button>
          <button class="btn btn-danger btn-sm" data-action="reject" data-id="${s.id}">却下</button>
        </div>
      ` : ''}
    </div>
  `;

  div.querySelectorAll('[data-action="approve"]').forEach(btn => {
    btn.addEventListener('click', () => handleSuggestion(btn.dataset.id, 'approve'));
  });
  div.querySelectorAll('[data-action="reject"]').forEach(btn => {
    btn.addEventListener('click', () => handleSuggestion(btn.dataset.id, 'reject'));
  });

  return div;
}

async function handleSuggestion(id, action) {
  try {
    const res = await apiPost({
      action: action === 'approve' ? 'approveSuggestion' : 'rejectSuggestion',
      id: parseInt(id), token: getToken()
    });
    if (!res.success) throw new Error(res.error);
    toast(action === 'approve' ? '提案を承認しました' : '提案を却下しました');
    loadSuggestions();
  } catch (err) {
    handleAuthError(err);
  }
}

/* ============================================================
   Error handling
   ============================================================ */
function handleAuthError(err) {
  if (err.message && err.message.includes('認証')) {
    logout();
    toast('認証が切れました。再ログインしてください');
  } else {
    toast('処理に失敗: ' + (err.message || ''));
  }
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============================================================
   Init
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {

  $('#backBtn').addEventListener('click', () => history.back());

  // Password form
  $('#passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = $('#passwordInput').value;
    hide($('#authError'));
    try {
      await login(password);
      showAdminContent();
      initializeAdmin();
    } catch (err) {
      show($('#authError'));
      $('#authErrorMessage').textContent = err.message || 'パスワードが違います';
    }
  });

  // Version controls
  $('#updateVersionBtn').addEventListener('click', updateVersion);
  $('#addVersionBtn').addEventListener('click', addNewVersion);

  // Schedule editor
  $('#loadScheduleBtn').addEventListener('click', loadScheduleForEdit);
  $('#addEntryBtn').addEventListener('click', addEmptyRow);
  $('#saveScheduleBtn').addEventListener('click', saveSchedule);

  // Suggestion tab filters
  $('#sugTabBar').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filterType = btn.dataset.filter;
    renderSuggestions();
  });

  // Check existing auth
  const valid = await checkAuth();
  if (valid) {
    state.token = getToken();
    showAdminContent();
    initializeAdmin();
  } else {
    showAuthGuard();
  }
});

function updateCourseScheduleUI() {
  const useCourse = state.useCourseSchedule;
  $('#useCourseScheduleToggle').checked = useCourse;
  $('#editCourseSelect').disabled = !useCourse;
  if (!useCourse) {
    $('#editCourseSelect').value = 'K/文系';
  }
}

async function initializeAdmin() {
  try {
    const res = await apiFetch('getConfig');
    if (res.success) {
      state.config = res.data;
      $('#currentVersion').textContent = res.data.version || '--';
      if (res.data.useCourseSchedule !== undefined) {
        state.useCourseSchedule = res.data.useCourseSchedule === 'true';
      }
      updateCourseScheduleUI();
    }
  } catch (err) {}

  // Toggle course schedule
  $('#useCourseScheduleToggle').addEventListener('change', async (e) => {
    state.useCourseSchedule = e.target.checked;
    updateCourseScheduleUI();
    try {
      await apiPost({
        action: 'updateConfig',
        key: 'useCourseSchedule',
        value: String(state.useCourseSchedule),
        token: getToken()
      });
    } catch (err) {}
  });

  await Promise.all([
    loadVersions(),
    loadSuggestions()
  ]);

  if (state.config && state.config.version) {
    state.editVersion = state.config.version;
  }
}
