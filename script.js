/* ============================================================
   設定
   ============================================================ */
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbwWNG4xKO6yGTWTz2Z9oxdOOkGfHsfia7ItUdvAXPSqwe_tlbrhVTgPgXA_64bmFfG1FA/exec';

const STORAGE_KEYS = {
  course: 'exam_course_selected',
  progress: 'exam_progress_'
};

/* ============================================================
   Account
   ============================================================ */
const ACCOUNT_KEYS = {
  token: 'exam_account_token',
  email: 'exam_account_email',
  displayName: 'exam_account_displayName',
  autoLogin: 'exam_account_autoLogin'
};

let account = {
  loggedIn: false,
  token: null,
  email: null,
  displayName: null,
  autoLogin: false,
  resetToken: null
};

function initAccount() {
  const autoLogin = localStorage.getItem(ACCOUNT_KEYS.autoLogin) === 'true';
  account.autoLogin = autoLogin;
  if (autoLogin) {
    var token = localStorage.getItem(ACCOUNT_KEYS.token);
    var email = localStorage.getItem(ACCOUNT_KEYS.email);
    if (token && email) {
      account.token = token;
      account.email = email;
      autoLoginAccount();
    }
  }
  var urlParams = new URLSearchParams(window.location.search);
  var resetToken = urlParams.get('resetToken');
  if (resetToken) {
    account.resetToken = resetToken;
    openResetPasswordModal();
  }
  updateAccountUI();
}

async function autoLoginAccount() {
  try {
    var res = await apiPost({ action: 'autoLogin', token: account.token });
    if (res.success) {
      account.loggedIn = true;
      account.displayName = res.data.displayName;
      localStorage.setItem(ACCOUNT_KEYS.displayName, res.data.displayName);
      updateAccountUI();
      if (res.data.savedData) restoreSavedData(res.data.savedData);
    } else {
      clearAccount();
    }
  } catch (err) {
    account.displayName = localStorage.getItem(ACCOUNT_KEYS.displayName);
    account.loggedIn = true;
    updateAccountUI();
  }
}

function openLoginModal() {
  hide($('#registerModal'));
  show($('#loginModal'));
}

function openRegisterModal() {
  hide($('#loginModal'));
  show($('#registerModal'));
}

function closeLoginModal() { hide($('#loginModal')); }
function closeRegisterModal() { hide($('#registerModal')); }

async function handleLogin() {
  var email = $('#loginEmail').value.trim();
  var password = $('#loginPassword').value;
  var autoLoginChecked = $('#loginAuto').checked;
  if (!email || !password) { showAccountError('loginError', 'メールアドレスとパスワードを入力してください'); return; }
  hideAccountError('loginError');
  try {
    var res = await apiPost({ action: 'login', email: email, password: password });
    if (res.success) {
      account.loggedIn = true;
      account.token = res.data.token;
      account.email = email;
      account.displayName = res.data.displayName;
      account.autoLogin = autoLoginChecked;
      localStorage.setItem(ACCOUNT_KEYS.token, res.data.token);
      localStorage.setItem(ACCOUNT_KEYS.email, email);
      localStorage.setItem(ACCOUNT_KEYS.displayName, res.data.displayName);
      localStorage.setItem(ACCOUNT_KEYS.autoLogin, autoLoginChecked ? 'true' : 'false');
      closeLoginModal();
      updateAccountUI();
      if (res.data.savedData) restoreSavedData(res.data.savedData);
      toast('ログインしました');
    } else {
      showAccountError('loginError', res.error || 'メールアドレスまたはパスワードが正しくありません');
    }
  } catch (err) {
    showAccountError('loginError', 'サーバーエラーが発生しました');
  }
}

async function handleRegister() {
  var email = $('#regEmail').value.trim();
  var password = $('#regPassword').value;
  var displayName = $('#regDisplayName').value.trim();
  if (!email || !password || !displayName) { showAccountError('regError', '全ての項目を入力してください'); return; }
  if (password.length < 8) { showAccountError('regError', 'パスワードは8文字以上必要です'); return; }
  hideAccountError('regError');
  var savedData = {};
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && !k.startsWith('exam_account_')) savedData[k] = localStorage.getItem(k);
  }
  try {
    var res = await apiPost({ action: 'register', email: email, password: password, displayName: displayName, savedData: savedData });
    if (res.success) {
      account.loggedIn = true;
      account.token = res.data.token;
      account.email = email;
      account.displayName = displayName;
      account.autoLogin = true;
      localStorage.setItem(ACCOUNT_KEYS.token, res.data.token);
      localStorage.setItem(ACCOUNT_KEYS.email, email);
      localStorage.setItem(ACCOUNT_KEYS.displayName, displayName);
      localStorage.setItem(ACCOUNT_KEYS.autoLogin, 'true');
      closeRegisterModal();
      updateAccountUI();
      toast('登録しました');
    } else {
      showAccountError('regError', res.error || '登録に失敗しました');
    }
  } catch (err) {
    showAccountError('regError', 'サーバーエラーが発生しました');
  }
}

function handleLogout() {
  if (!confirm('ログアウトしますか？')) return;
  clearAccount();
  updateAccountUI();
  toast('ログアウトしました');
}

function clearAccount() {
  account.loggedIn = false;
  account.token = null;
  account.email = null;
  account.displayName = null;
  account.autoLogin = false;
  localStorage.removeItem(ACCOUNT_KEYS.token);
  localStorage.removeItem(ACCOUNT_KEYS.email);
  localStorage.removeItem(ACCOUNT_KEYS.displayName);
  localStorage.setItem(ACCOUNT_KEYS.autoLogin, 'false');
}

function restoreSavedData(savedData) {
  if (!savedData) return;
  Object.keys(savedData).forEach(function(key) {
    if (!key.startsWith('exam_account_')) localStorage.setItem(key, savedData[key]);
  });
  if (typeof loadData === 'function') loadData();
}

async function autoSave() {
  if (!account.loggedIn || !account.token) return;
  var savedData = {};
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && !k.startsWith('exam_account_')) savedData[k] = localStorage.getItem(k);
  }
  try {
    await apiPost({ action: 'save', token: account.token, savedData: savedData });
  } catch (err) {}
}

function showAccountError(id, msg) {
  var el = $(id);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}
function hideAccountError(id) {
  var el = $(id);
  if (el) el.classList.add('hidden');
}
function showAccountSuccess(id, msg) {
  var el = $(id);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}
function hideAccountSuccess(id) {
  var el = $(id);
  if (el) el.classList.add('hidden');
}

/* ---- Password Reset ---- */
function openForgotPasswordModal() {
  hide($('#loginModal'));
  hide($('#registerModal'));
  hideAccountError('forgotError');
  hideAccountSuccess('forgotSuccess');
  show($('#forgotPasswordModal'));
}

function closeForgotPasswordModal() { hide($('#forgotPasswordModal')); }

function openResetPasswordModal() {
  hide($('#loginModal'));
  hide($('#registerModal'));
  hideAccountError('resetError');
  hideAccountSuccess('resetSuccess');
  show($('#resetPasswordModal'));
}

function closeResetPasswordModal() { hide($('#resetPasswordModal')); }

async function handleForgotPassword() {
  var email = $('#forgotEmail').value.trim();
  if (!email) { showAccountError('forgotError', 'メールアドレスを入力してください'); return; }
  hideAccountError('forgotError');
  hideAccountSuccess('forgotSuccess');
  try {
    var res = await apiPost({ action: 'requestPasswordReset', email: email });
    if (res.success) {
      hideAccountError('forgotError');
      showAccountSuccess('forgotSuccess', 'リセットメールを送信しました。メールをご確認ください。');
      setTimeout(closeForgotPasswordModal, 4000);
    } else {
      showAccountError('forgotError', res.error || '送信に失敗しました');
    }
  } catch (err) {
    showAccountError('forgotError', 'サーバーエラーが発生しました');
  }
}

async function handleResetPassword() {
  var password = $('#resetPassword').value;
  var confirm = $('#resetPasswordConfirm').value;
  if (!password || !confirm) { showAccountError('resetError', '新しいパスワードを入力してください'); return; }
  if (password.length < 8) { showAccountError('resetError', 'パスワードは8文字以上必要です'); return; }
  if (password !== confirm) { showAccountError('resetError', 'パスワードが一致しません'); return; }
  hideAccountError('resetError');
  try {
    var res = await apiPost({ action: 'resetPassword', token: account.resetToken, newPassword: password });
    if (res.success) {
      showAccountSuccess('resetSuccess', 'パスワードを変更しました。新しいパスワードでログインしてください。');
      account.resetToken = null;
      setTimeout(function() { closeResetPasswordModal(); openLoginModal(); }, 3000);
    } else {
      showAccountError('resetError', res.error || 'パスワードの変更に失敗しました');
    }
  } catch (err) {
    showAccountError('resetError', 'サーバーエラーが発生しました');
  }
}

function getInitial(name) {
  return name ? name.charAt(0) : '?';
}

function updateAccountUI() {
  var container = $('#accountContainer');
  if (!container) return;
  if (account.loggedIn) {
    container.innerHTML =
      '<div class="account-dropdown">' +
        '<button class="account-btn" id="accountBtn">' +
          '<span class="account-avatar">' + escHtml(getInitial(account.displayName)) + '</span>' +
          '<span class="account-name">' + escHtml(account.displayName) + '</span>' +
          '<svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>' +
        '</button>' +
        '<div class="account-menu hidden" id="accountDropdown">' +
          '<div class="account-menu-header">' +
            '<div class="account-menu-name">' + escHtml(account.displayName) + '</div>' +
            '<div class="account-menu-email">' + escHtml(account.email) + '</div>' +
          '</div>' +
          '<div class="account-menu-divider"></div>' +
          '<button class="account-menu-item" id="logoutBtn">ログアウト</button>' +
        '</div>' +
      '</div>';
    $('#accountBtn').addEventListener('click', function(e) {
      e.stopPropagation();
      var dd = $('#accountDropdown');
      if (dd) dd.classList.toggle('hidden');
    });
    document.addEventListener('click', function() {
      var dd = $('#accountDropdown');
      if (dd) dd.classList.add('hidden');
    });
    $('#logoutBtn').addEventListener('click', handleLogout);
  } else {
    container.innerHTML =
      '<button class="account-btn" id="loginBtn">ログイン</button>' +
      '<button class="account-btn account-btn-register" id="registerBtn">新規登録</button>';
    $('#loginBtn').addEventListener('click', openLoginModal);
    $('#registerBtn').addEventListener('click', openRegisterModal);
  }
}

function initAccountUI() {
  $('#loginSubmitBtn').addEventListener('click', handleLogin);
  $('#regSubmitBtn').addEventListener('click', handleRegister);
  $('#loginToRegister').addEventListener('click', openRegisterModal);
  $('#registerToLogin').addEventListener('click', openLoginModal);
  $('#forgotPasswordLink').addEventListener('click', openForgotPasswordModal);
  $('#forgotSubmitBtn').addEventListener('click', handleForgotPassword);
  $('#forgotToLogin').addEventListener('click', function() { closeForgotPasswordModal(); openLoginModal(); });
  $('#resetSubmitBtn').addEventListener('click', handleResetPassword);
  $('#resetToLogin').addEventListener('click', function() { closeResetPasswordModal(); openLoginModal(); });
  var closeLogin = function(e) { if (e.target === $('#loginModal')) closeLoginModal(); };
  var closeReg = function(e) { if (e.target === $('#registerModal')) closeRegisterModal(); };
  var closeForgot = function(e) { if (e.target === $('#forgotPasswordModal')) closeForgotPasswordModal(); };
  var closeReset = function(e) { if (e.target === $('#resetPasswordModal')) closeResetPasswordModal(); };
  $('#loginModal').addEventListener('click', closeLogin);
  $('#registerModal').addEventListener('click', closeReg);
  $('#forgotPasswordModal').addEventListener('click', closeForgot);
  $('#resetPasswordModal').addEventListener('click', closeReset);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeLoginModal(); closeRegisterModal(); closeForgotPasswordModal(); closeResetPasswordModal(); }
  });
}

/* ============================================================
   State
   ============================================================ */
let state = {
  course: null,
  config: null,
  schedule: [],
  subjects: [],
  submissions: []
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

/* ============================================================
   Course Management
   ============================================================ */
function getSavedCourse() {
  return localStorage.getItem(STORAGE_KEYS.course);
}

function saveCourse(course) {
  localStorage.setItem(STORAGE_KEYS.course, course);
  state.course = course;
}

function showCourseModal() {
  const modal = $('#courseModal');
  modal.classList.remove('hidden');
  $$('.course-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.course === state.course);
  });
}

function hideCourseModal() {
  $('#courseModal').classList.add('hidden');
}

function initCourseSelection() {
  const saved = getSavedCourse();
  if (saved) {
    state.course = saved;
    hideCourseModal();
    loadData();
  } else {
    showCourseModal();
  }

  $$('.course-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const course = btn.dataset.course;
      saveCourse(course);
      hideCourseModal();
      loadData();
      updateMenuCourseLabel();
    });
  });
}

function updateMenuCourseLabel() {
  const label = $('#menuCourseLabel');
  if (state.course) {
    label.textContent = '現在: ' + state.course;
  }
}

/* ============================================================
   Data Loading
   ============================================================ */
async function loadData() {
  const loading = $('#loading');
  const errorBox = $('#errorBox');
  const scheduleCard = $('#scheduleCard');
  const emptyState = $('#emptyState');

  show(loading);
  hide(errorBox);
  hide(emptyState);

  try {
    const configRes = await apiFetch('getConfig');
    if (!configRes.success) throw new Error(configRes.error);
    state.config = configRes.data;

    const [subjectsRes, scheduleRes, submissionsRes] = await Promise.all([
      apiFetch('getSubjects', { course: state.course, version: configRes.data.version }),
      apiFetch('getSchedule', { version: configRes.data.version, course: state.course }),
      apiFetch('getSubmissions', { version: configRes.data.version, course: state.course })
    ]);
    if (!subjectsRes.success) throw new Error(subjectsRes.error);
    if (!scheduleRes.success) throw new Error(scheduleRes.error);

    state.schedule = scheduleRes.data || [];
    state.subjects = subjectsRes.data;
    state.submissions = submissionsRes.success ? (submissionsRes.data || []) : [];

    // Sort by date then period
    state.schedule.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA < dateB) return -1;
      if (dateA > dateB) return 1;
      const pA = parseInt(a.period) || 0;
      const pB = parseInt(b.period) || 0;
      return pA - pB;
    });

    renderInfo();
    renderSchedule();
    renderSubmissions();
    renderCountdown();
    updateProgressUI();
    updateLastUpdated();

  } catch (err) {
    show(errorBox);
    $('#errorMessage').textContent = 'データの読み込みに失敗しました: ' + err.message;
    hide(scheduleCard);
  } finally {
    hide(loading);
  }
}

/* ============================================================
   Render
   ============================================================ */
function renderInfo() {
  if (state.config) {
    $('#versionBadge').textContent = state.config.version || '--';
    $('#versionLabel').textContent = state.config.versionLabel || '';
  }
  if (state.course) {
    $('#courseBadge').textContent = state.course;
  }
}

function renderSchedule() {
  const tbody = $('#scheduleBody');
  const emptyState = $('#emptyState');
  tbody.innerHTML = '';

  if (!state.schedule || state.schedule.length === 0) {
    show(emptyState);
    return;
  }
  hide(emptyState);

  let lastDate = '';
  state.schedule.forEach(row => {
    const color = row.color || '#3B82F6';
    const date = row.date || '';

    if (date && date !== lastDate) {
      lastDate = date;
      const hdr = document.createElement('tr');
      hdr.innerHTML = `<td class="date-group-header" colspan="5">📅 ${escHtml(date)}</td>`;
      tbody.appendChild(hdr);
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="subject-cell">
          <span class="subject-dot" style="background:${color}"></span>
          <span class="subject-name">${escHtml(row.subject)}</span>
        </div>
      </td>
      <td class="date-cell">${escHtml(date)}</td>
      <td class="period-cell">${escHtml(row.period || '')}</td>
      <td class="scope-cell">${escHtml(row.scope || '').replace(/\n/g, '<br>')}</td>
      <td class="notes-cell">${escHtml(row.notes || '').replace(/\n/g, '<br>')}</td>
    `;

    tbody.appendChild(tr);
  });
}

function renderSubmissions() {
  const tbody = $('#submissionBody');
  const emptyState = $('#subEmptyState');
  tbody.innerHTML = '';

  if (!state.submissions || state.submissions.length === 0) {
    show(emptyState);
    return;
  }
  hide(emptyState);

  state.submissions.forEach((row, i) => {
    const progressKey = getSubProgressKey(row, i);
    const checked = localStorage.getItem(progressKey) === 'true';

    const tr = document.createElement('tr');
    if (checked) tr.classList.add('row-completed');

    const color = row.color || '#3B82F6';

    tr.innerHTML = `
      <td>
        <div class="subject-cell">
          <span class="subject-dot" style="background:${color}"></span>
          <span class="subject-name">${escHtml(row.subject)}</span>
        </div>
      </td>
      <td class="scope-cell">${escHtml(row.notes || '').replace(/\n/g, '<br>')}</td>
      <td class="progress-cell">
        <input type="checkbox" ${checked ? 'checked' : ''} data-key="${progressKey}">
      </td>
    `;

    const checkbox = tr.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      localStorage.setItem(progressKey, checkbox.checked);
      tr.classList.toggle('row-completed', checkbox.checked);
      updateProgressUI();
    });

    tbody.appendChild(tr);
  });
  updateSubProgressMini();
}

function getSubProgressKey(row, index) {
  const ver = state.config ? state.config.version : 'unknown';
  const notePart = (row.notes || '').replace(/[^a-zA-Z0-9\u3000-\u9FFF]/g, '').slice(0, 20);
  return ['exam_sub_progress', ver, state.course, row.subject, notePart || index].filter(Boolean).join('_');
}

function updateSubProgressMini() {
  const checkboxes = $$('#submissionBody input[type="checkbox"]');
  const total = checkboxes.length;
  const done = [...checkboxes].filter(cb => cb.checked).length;
  $('#subProgressMini').textContent = done + ' / ' + total;
}

function updateProgressUI() {
  const subBoxes = $$('#submissionBody input[type="checkbox"]');
  const total = subBoxes.length;
  const done = [...subBoxes].filter(cb => cb.checked).length;

  const text = `${done} / ${total}`;
  $('#topProgressText').textContent = text;
  const pct = total > 0 ? (done / total) * 100 : 0;
  $('#topProgressBar').style.width = pct + '%';
  updateSubProgressMini();
  autoSave();
}

function updateLastUpdated() {
  const now = new Date();
  const str = now.toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
  $('#lastUpdated').textContent = '最終更新: ' + str;
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
   Progress Reset
   ============================================================ */
function resetProgress() {
  if (!confirm('全てのチェックボックスをリセットしますか？')) return;
  const allBoxes = $$('#submissionBody input[type="checkbox"]');
  allBoxes.forEach(cb => {
    cb.checked = false;
    localStorage.setItem(cb.dataset.key, 'false');
    cb.closest('tr').classList.remove('row-completed');
  });
  updateProgressUI();
  toast('進捗をリセットしました');
}

/* ============================================================
   Hamburger Menu
   ============================================================ */
function initMenu() {
  const btn = $('#menuBtn');
  const overlay = $('#menuOverlay');
  const dropdown = $('#menuDropdown');

  function toggleMenu(e) {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle('open');
    overlay.classList.toggle('open', isOpen);
    btn.classList.toggle('open', isOpen);
  }

  function closeMenu() {
    dropdown.classList.remove('open');
    overlay.classList.remove('open');
    btn.classList.remove('open');
  }

  btn.addEventListener('click', toggleMenu);
  overlay.addEventListener('click', closeMenu);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    if (item.dataset.action === 'changeCourse') {
      closeMenu();
      showCourseModal();
    } else if (item.dataset.action === 'exportCalendar') {
      closeMenu();
      exportCalendar();
    } else if (item.dataset.action === 'toggleDarkMode') {
      closeMenu();
      toggleDarkMode();
    } else if (item.dataset.action === 'openTimer') {
      closeMenu();
      openTimerModal();
    } else if (item.dataset.action === 'scrollTo') {
      closeMenu();
      const target = document.getElementById(item.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

/* ============================================================
   Dark Mode
   ============================================================ */
const DARK_MODE_KEY = 'exam_dark_mode';

function initDarkMode() {
  if (localStorage.getItem(DARK_MODE_KEY) === 'true') {
    document.body.classList.add('dark');
    updateDarkModeUI(true);
  }

  $('#darkModeBtn').addEventListener('click', toggleDarkMode);
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem(DARK_MODE_KEY, isDark);
  updateDarkModeUI(isDark);
}

function updateDarkModeUI(isDark) {
  const icon = isDark ? '☀️' : '🌙';
  $('#darkModeBtn').textContent = icon;
  const menuItem = document.querySelector('.menu-item[data-action="toggleDarkMode"] .menu-icon');
  if (menuItem) menuItem.textContent = icon;
}

/* ============================================================
   Test Countdown
   ============================================================ */
function renderCountdown() {
  const card = $('#countdownCard');
  if (!state.schedule || state.schedule.length === 0) {
    card.classList.add('hidden');
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let earliestDate = null;
  let earliestRow = null;
  for (const row of state.schedule) {
    if (!row.date) continue;
    const parsed = parseScheduleDate(row.date);
    if (!parsed) continue;
    if (parsed >= today) {
      if (!earliestDate || parsed < earliestDate) {
        earliestDate = parsed;
        earliestRow = row;
      }
    }
  }

  if (!earliestDate) {
    card.classList.add('hidden');
    return;
  }

  const diff = Math.ceil((earliestDate - today) / (1000 * 60 * 60 * 24));
  $('#countdownNumber').textContent = diff;
  const sub = earliestRow ? escHtml(earliestRow.subject) + ' (' + escHtml(earliestRow.date) + ')' : '';
  $('#countdownSub').textContent = sub ? '最初のテスト: ' + sub : '';
  card.classList.remove('hidden');
}

function parseScheduleDate(str) {
  const m = str.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const d = new Date();
  d.setMonth(parseInt(m[1]) - 1, parseInt(m[2]));
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d < today) d.setFullYear(d.getFullYear() + 1);
  return d;
}

/* ============================================================
   Study Timer (Pomodoro) - Modal Popup
   ============================================================ */
const TIMER_PREFIX = 'exam_timer_';
let FOCUS_SEC = 25 * 60;
let BREAK_SEC = 5 * 60;

const timer = {
  mode: 'focus',
  left: FOCUS_SEC,
  running: false,
  subject: '',
  interval: null,
  startAt: 0
};

const CIRCUMFERENCE = 490.09;

function openTimerModal() {
  const modal = $('#timerModal');
  modal.classList.remove('hidden');
  updateTimerSubjects();
  updateTimerStats();
  resetTimer();
  applyTimerDuration();
}

function closeTimerModal() {
  pauseTimer();
  $('#timerModal').classList.add('hidden');
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
}

function applyTimerDuration() {
  const focusMin = parseInt($('#timerFocusMin').value) || 25;
  const breakMin = parseInt($('#timerBreakMin').value) || 5;
  FOCUS_SEC = Math.max(1, Math.min(120, focusMin)) * 60;
  BREAK_SEC = Math.max(1, Math.min(30, breakMin)) * 60;
  if (!timer.running) resetTimer();
}

function initTimer() {
  $('#timerToggleBtn').addEventListener('click', toggleTimer);
  $('#timerResetBtn').addEventListener('click', resetTimer);
  $('#timerCloseBtn').addEventListener('click', closeTimerModal);
  $('#timerFullscreenBtn').addEventListener('click', toggleTimerFullscreen);
  $('#timerSubject').addEventListener('change', e => {
    timer.subject = e.target.value;
    if (!timer.running) resetTimer();
  });
  $('#timerFocusMin').addEventListener('change', applyTimerDuration);
  $('#timerBreakMin').addEventListener('change', applyTimerDuration);
  $('#timerModal').addEventListener('click', e => {
    if (e.target === $('#timerModal')) closeTimerModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#timerModal').classList.contains('hidden')) {
      closeTimerModal();
    }
  });
}

function toggleTimerFullscreen() {
  const modal = $('#timerModal');
  if (!document.fullscreenElement) {
    modal.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

function updateTimerSubjects() {
  const sel = $('#timerSubject');
  if (!state.subjects || state.subjects.length === 0) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">教科を選択</option>';
  state.subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.subject;
    opt.textContent = s.subject;
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

function toggleTimer() {
  timer.running ? pauseTimer() : startTimer();
}

function startTimer() {
  if (timer.mode === 'focus' && !timer.subject) {
    toast('教科を選択してください');
    return;
  }
  timer.running = true;
  timer.startAt = Date.now();
  timer.interval = setInterval(tick, 1000);
  $('#timerToggleBtn').textContent = '⏸ 一時停止';
  $('#timerToggleBtn').className = 'btn btn-warning btn-sm';
}

function pauseTimer() {
  timer.running = false;
  if (timer.interval) { clearInterval(timer.interval); timer.interval = null; }
  $('#timerToggleBtn').textContent = '▶ 開始';
  $('#timerToggleBtn').className = 'btn btn-success btn-sm';
}

function resetTimer() {
  pauseTimer();
  timer.mode = 'focus';
  timer.left = FOCUS_SEC;
  updateTimerDisplay();
  updateTimerRing();
  $('#timerModeLabel').textContent = '📚 集中';
  $('#timerRing').className = 'timer-progress-ring focus';
  $('#timerToggleBtn').textContent = '▶ 開始';
  $('#timerToggleBtn').className = 'btn btn-success btn-sm';
}

function tick() {
  timer.left--;
  updateTimerDisplay();
  updateTimerRing();

  if (timer.left <= 0) {
    if (timer.mode === 'focus') {
      saveStudyTime(timer.subject, FOCUS_SEC);
      updateTimerStats();
      timer.mode = 'break';
      timer.left = BREAK_SEC;
      $('#timerRing').className = 'timer-progress-ring break';
      $('#timerModeLabel').textContent = '☕ 休憩';
      toast('お疲れ様です！' + Math.round(BREAK_SEC / 60) + '分間の休憩です');
    } else {
      timer.mode = 'focus';
      timer.left = FOCUS_SEC;
      $('#timerRing').className = 'timer-progress-ring focus';
      $('#timerModeLabel').textContent = '📚 集中';
      toast('休憩終了！集中しましょう');
    }
    updateTimerDisplay();
    updateTimerRing();
    pauseTimer();
  }
}

function updateTimerDisplay() {
  const m = String(Math.floor(timer.left / 60)).padStart(2, '0');
  const s = String(timer.left % 60).padStart(2, '0');
  $('#timerDisplay').textContent = m + ':' + s;
}

function updateTimerRing() {
  const total = timer.mode === 'focus' ? FOCUS_SEC : BREAK_SEC;
  const offset = CIRCUMFERENCE * (1 - timer.left / total);
  $('#timerProgressCircle').setAttribute('stroke-dashoffset', offset);
}

function saveStudyTime(subject, sec) {
  if (!subject) return;
  const today = new Date().toISOString().slice(0, 10);
  const key = TIMER_PREFIX + today + '_' + subject;
  localStorage.setItem(key, (parseInt(localStorage.getItem(key)) || 0) + sec);
}

function updateTimerStats() {
  const container = $('#timerStats');
  const today = new Date().toISOString().slice(0, 10);

  let html = '<div class="timer-stats-title">今日の勉強時間</div>';
  let has = false;

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(TIMER_PREFIX + today)) {
      const subj = k.replace(TIMER_PREFIX + today + '_', '');
      const sec = parseInt(localStorage.getItem(k)) || 0;
      const min = Math.round(sec / 60);
      if (min > 0) {
        has = true;
        html += '<div class="timer-stat-row"><span>' + escHtml(subj) + '</span><span class="timer-stat-value">' + min + '分</span></div>';
      }
    }
  }

  if (!has) html += '<div class="timer-empty">まだ記録がありません</div>';
  container.innerHTML = html;
}

/* ============================================================
   Calendar Export (.ics)
   ============================================================ */
function exportCalendar() {
  if (!state.schedule || state.schedule.length === 0) {
    toast('エクスポートするデータがありません');
    return;
  }

  const now = new Date();
  const ds = formatICSDate(now);

  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ExamSchedule//JP\r\n';

  state.schedule.forEach((row, i) => {
    if (!row.date || !row.subject) return;
    const d = parseICSDate(row.date);
    if (!d) return;

    const period = row.period || '';
    const summary = escapeICS(row.subject) + (period ? ' (' + escapeICS(period) + ')' : '');

    let desc = '';
    if (row.scope) desc += '範囲: ' + escapeICS(row.scope.replace(/\n+$/, ''));
    if (row.notes) desc += (desc ? '\\n' : '') + '備考: ' + escapeICS(row.notes);
    if (state.course) desc += (desc ? '\\n' : '') + 'コース: ' + escapeICS(state.course);

    const uid = d + '-' + row.subject.replace(/[^a-zA-Z0-9]/g, '') + '-' + i + '@exam';

    ics += 'BEGIN:VEVENT\r\n';
    ics += 'UID:' + uid + '\r\n';
    ics += 'DTSTAMP:' + ds + 'T000000Z\r\n';
    ics += 'SUMMARY:' + summary + '\r\n';
    ics += 'DTSTART;VALUE=DATE:' + d + '\r\n';
    ics += 'DTEND;VALUE=DATE:' + addDays(d, 1) + '\r\n';
    if (desc) ics += 'DESCRIPTION:' + desc + '\r\n';
    ics += 'END:VEVENT\r\n';
  });

  ics += 'END:VCALENDAR';

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'test_schedule.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('📅 カレンダーファイルをダウンロードしました');
}

function parseICSDate(str) {
  const m = str.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const today = new Date();
  const month = parseInt(m[1]) - 1;
  const day = parseInt(m[2]);
  let year = today.getFullYear();
  let d = new Date(year, month, day);
  d.setHours(0, 0, 0, 0);
  if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    d = new Date(year + 1, month, day);
  }
  return formatICSDate(d);
}

function escapeICS(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function formatICSDate(date) {
  return date.getFullYear()
    + String(date.getMonth() + 1).padStart(2, '0')
    + String(date.getDate()).padStart(2, '0');
}

function addDays(dateStr, n) {
  const y = parseInt(dateStr.slice(0, 4));
  const m = parseInt(dateStr.slice(4, 6)) - 1;
  const d = parseInt(dateStr.slice(6, 8));
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() + n);
  return formatICSDate(dt);
}

/* ============================================================
   Init
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  updateMenuCourseLabel();
  initMenu();

  // Print button
  $('#printBtn').addEventListener('click', () => window.print());

  // Calendar export
  $('#calendarExportBtn').addEventListener('click', exportCalendar);

  // Reset progress
  $('#resetProgressBtn').addEventListener('click', resetProgress);

  initTimer();
  initCourseSelection();
  initAccount();
  initAccountUI();

  // Auto-show login modal if not logged in
  const hadSavedToken = localStorage.getItem(ACCOUNT_KEYS.token) &&
    localStorage.getItem(ACCOUNT_KEYS.autoLogin) === 'true';

  if (hadSavedToken) {
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      if (account.loggedIn || attempts >= 60) {
        clearInterval(checkInterval);
        if (!account.loggedIn) openLoginModal();
      }
    }, 100);
  } else {
    if (!account.loggedIn) openLoginModal();
  }

  window.addEventListener('beforeunload', function() {
    if (account.loggedIn && account.token) {
      var savedData = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && !k.startsWith('exam_account_')) savedData[k] = localStorage.getItem(k);
      }
      var payload = JSON.stringify({ action: 'save', token: account.token, savedData: savedData });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_BASE_URL, payload);
      }
    }
  });

});
