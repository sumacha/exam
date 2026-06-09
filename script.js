/* ============================================================
   設定
   ============================================================ */
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbwIbsoEIAt4K0gHyqLPEEgpWQ71srLvYla5cVYW_N6uDl02y2umFRt2UyGKdE3VJFuR/exec';

const STORAGE_KEYS = {
  course: 'exam_course_selected',
  progress: 'exam_progress_'
};

/* ============================================================
   State
   ============================================================ */
let state = {
  course: null,
  config: null,
  schedule: [],
  subjects: []
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

function apiFetch(action, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = API_BASE_URL + '?action=' + action + (qs ? '&' + qs : '');
  return fetch(url, { method: 'GET' }).then(r => r.json());
}

function apiPost(data) {
  return fetch(API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json());
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

    const [subjectsRes, scheduleRes] = await Promise.all([
      apiFetch('getSubjects', { course: state.course, version: configRes.data.version }),
      apiFetch('getSchedule', { version: configRes.data.version, course: state.course })
    ]);
    if (!subjectsRes.success) throw new Error(subjectsRes.error);
    if (!scheduleRes.success) throw new Error(scheduleRes.error);

    state.schedule = scheduleRes.data || [];
    state.subjects = subjectsRes.data;

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
    renderSubjectProgress();
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
    const progressKey = getProgressKey(row);
    const checked = localStorage.getItem(progressKey) === 'true';

    const tr = document.createElement('tr');
    if (checked) tr.classList.add('row-completed');

    const color = row.color || '#3B82F6';
    const date = row.date || '';

    // Date group header
    if (date && date !== lastDate) {
      lastDate = date;
      const hdr = document.createElement('tr');
      hdr.innerHTML = `<td class="date-group-header" colspan="6">📅 ${escHtml(date)}</td>`;
      tbody.appendChild(hdr);
    }

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
      <td class="progress-cell">
        <input type="checkbox" ${checked ? 'checked' : ''} data-key="${progressKey}">
      </td>
    `;

    const checkbox = tr.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      localStorage.setItem(progressKey, checkbox.checked);
      tr.classList.toggle('row-completed', checkbox.checked);
      updateProgressUI();
      renderSubjectProgress();
    });

    tbody.appendChild(tr);
  });
}

function updateProgressUI() {
  const checkboxes = $$('#scheduleBody input[type="checkbox"]');
  const total = checkboxes.length;
  const done = [...checkboxes].filter(cb => cb.checked).length;

  const text = `${done} / ${total}`;
  $('#topProgressText').textContent = text;
  const pct = total > 0 ? (done / total) * 100 : 0;
  $('#topProgressBar').style.width = pct + '%';
}

function updateLastUpdated() {
  const now = new Date();
  const str = now.toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
  $('#lastUpdated').textContent = '最終更新: ' + str;
}

function getProgressKey(row) {
  const ver = state.config ? state.config.version : 'unknown';
  return STORAGE_KEYS.progress + ver + '_' + state.course + '_' + row.subject;
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
  const checkboxes = $$('#scheduleBody input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = false;
    localStorage.setItem(cb.dataset.key, 'false');
    cb.closest('tr').classList.remove('row-completed');
  });
  updateProgressUI();
  renderSubjectProgress();
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
   Per-Subject Progress
   ============================================================ */
function renderSubjectProgress() {
  const container = $('#subjectProgressContainer');
  if (!state.schedule || state.schedule.length === 0) {
    container.innerHTML = '';
    return;
  }

  const map = {};
  state.schedule.forEach(row => {
    const key = row.subject;
    if (!key) return;
    if (!map[key]) {
      map[key] = { subject: key, total: 0, done: 0, color: row.color || '#3B82F6' };
    }
    map[key].total++;
    if (localStorage.getItem(getProgressKey(row)) === 'true') {
      map[key].done++;
    }
  });

  let html = '';
  Object.values(map).forEach(s => {
    const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
    html += '<div class="subj-progress-item">'
      + '<div class="subj-progress-header">'
      + '<span class="subj-progress-name">'
      + '<span class="subject-dot" style="background:' + s.color + '"></span>'
      + escHtml(s.subject)
      + '</span>'
      + '<span class="subj-progress-stat">' + s.done + '/' + s.total + ' (' + pct + '%)</span>'
      + '</div>'
      + '<div class="progress-bar-wrap">'
      + '<div class="progress-bar-fill" style="width:' + pct + '%;background:' + s.color + '"></div>'
      + '</div>'
      + '</div>';
  });

  container.innerHTML = html;
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

  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ExamSchedule//JP\r\n';

  state.schedule.forEach(row => {
    if (!row.date || !row.subject) return;
    const d = parseICSDate(row.date);
    if (!d) return;

    const period = row.period ? ' ' + row.period : '';
    let desc = '';
    if (row.scope) desc += '範囲: ' + row.scope.replace(/\n/g, '\\n');
    if (row.notes) desc += (desc ? '\\n' : '') + '備考: ' + row.notes.replace(/\n/g, '\\n');

    ics += 'BEGIN:VEVENT\r\n';
    ics += 'SUMMARY:' + row.subject + ' テスト' + period + '\r\n';
    ics += 'DTSTART;VALUE=DATE:' + d + '\r\n';
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
  const d = new Date();
  d.setMonth(parseInt(m[1]) - 1, parseInt(m[2]));
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d < today) d.setFullYear(d.getFullYear() + 1);
  return d.getFullYear()
    + String(d.getMonth() + 1).padStart(2, '0')
    + String(d.getDate()).padStart(2, '0');
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
});
