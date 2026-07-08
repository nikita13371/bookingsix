// ── Tech Department Logic ──

const SUPABASE_URL = 'https://rlhrzhtrumxuenycurio.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsaHJ6aHRydW14dWVueWN1cmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0OTE3MTgsImV4cCI6MjA5OTA2NzcxOH0.do-PSyO3h1gAOpY0Wj-GYkja_OiuNwi77J3w0FwOTYk';

const TASK_WEIGHTS = { 'Реклама':1, 'Мультик':2, 'Мультик Lux':3, 'Фильм':4 };
const ACTIVE_STATUSES = ['В работе','Ждём бриф','Ждём оплату','Взять в работу'];

let members = JSON.parse(localStorage.getItem('sixg_members') || '[]');
let currentFilter = 'all';
let selectedTask = null;

function saveMembers() { localStorage.setItem('sixg_members', JSON.stringify(members)); }
function fmt2(n) { return Number(n||0).toLocaleString('ru-KZ'); }

// ── Priority by deadline ──
function getPriority(dateKey) {
  if (!dateKey) return 'normal';
  const [y,m,d] = dateKey.split('-').map(Number);
  const deadline = new Date(y, m-1, d);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.ceil((deadline - today) / (1000*60*60*24));
  if (diff <= 3) return 'urgent';
  if (diff <= 7) return 'medium';
  return 'normal';
}

function priorityLabel(p) {
  if (p==='urgent') return '🔴 Срочно';
  if (p==='medium') return '🟠 Средний';
  return '⚪ Обычный';
}

function daysLeft(dateKey) {
  if (!dateKey) return '—';
  const [y,m,d] = dateKey.split('-').map(Number);
  const deadline = new Date(y, m-1, d);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.ceil((deadline - today) / (1000*60*60*24));
  if (diff < 0) return 'Просрочено';
  if (diff === 0) return 'Сегодня';
  return `${diff} дн.`;
}

// ── Get all active tasks ──
function getAllTasks() {
  const all = [];
  Object.entries(bookings || {}).forEach(([key, list]) => {
    list.forEach(b => {
      if (!ACTIVE_STATUSES.includes(b.status) && b.status) return;
      all.push({ ...b, date_key: b.date_key || key });
    });
  });
  // Also get tasks from supabase that might not be in calendar bookings
  return all;
}

// ── Member load calculation ──
function getMemberLoad(memberName) {
  const tasks = getAllTasks().filter(t => t.tech_assigned === memberName);
  const weight = tasks.reduce((sum, t) => sum + (TASK_WEIGHTS[t.type] || 1), 0);
  return { count: tasks.length, weight };
}

// ── Auto-assign algorithm (Combo: load + complexity + deadline) ──
function autoAssign(task) {
  const onlineMembers = members.filter(m => m.online);
  if (!onlineMembers.length) return null;

  let bestMember = null;
  let bestScore = Infinity;

  onlineMembers.forEach(m => {
    const { weight } = getMemberLoad(m.name);
    const tasks = getAllTasks().filter(t => t.tech_assigned === m.name);

    // Deadline pressure coefficient
    let deadlineCoeff = 1;
    tasks.forEach(t => {
      const p = getPriority(t.date_key);
      if (p === 'urgent') deadlineCoeff = Math.max(deadlineCoeff, 2);
      else if (p === 'medium') deadlineCoeff = Math.max(deadlineCoeff, 1.5);
    });

    const score = weight * deadlineCoeff;
    if (score < bestScore) { bestScore = score; bestMember = m; }
  });

  return bestMember;
}

// ── Render members sidebar ──
function renderMembers() {
  const wrap = document.getElementById('techMembers');
  const sel = document.getElementById('memberFilter');

  if (!members.length) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--text3)">Нет специалистов. Добавь через +</p>';
    sel.innerHTML = '<option value="all">Все спецы</option>';
    return;
  }

  sel.innerHTML = '<option value="all">Все спецы</option>' +
    members.map(m => `<option value="${m.name}">${m.name}</option>`).join('');

  wrap.innerHTML = members.map((m, i) => {
    const { count, weight } = getMemberLoad(m.name);
    const maxWeight = 10;
    const pct = Math.min(100, (weight / maxWeight) * 100);
    const barCls = pct > 80 ? 'danger' : pct > 50 ? 'warn' : '';
    return `<div class="member-card" onclick="filterByMember('${m.name}')">
      <div class="member-top">
        <span class="member-name">${m.name}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="member-del" onclick="event.stopPropagation();toggleOnline(${i})">${m.online?'🟢':'⚫'}</button>
          <button class="member-del" onclick="event.stopPropagation();deleteMember(${i})">✕</button>
        </div>
      </div>
      <div class="member-load">${count} задач · вес ${weight}</div>
      <div class="member-bar"><div class="member-bar-fill ${barCls}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');

  // Update stats
  renderTechStats();
}

function filterByMember(name) {
  document.getElementById('memberFilter').value = name;
  renderTechBoard();
}

function toggleOnline(i) {
  members[i].online = !members[i].online;
  saveMembers();
  renderMembers();
}

function deleteMember(i) {
  if (!confirm(`Удалить ${members[i].name}?`)) return;
  members.splice(i, 1);
  saveMembers();
  renderMembers();
  renderTechBoard();
}

// ── Add member modal ──
function showAddMember() { document.getElementById('addMemberModal').style.display='flex'; }
function closeAddMember() { document.getElementById('addMemberModal').style.display='none'; }

function saveMember() {
  const name = document.getElementById('memberName').value.trim();
  if (!name) return;
  members.push({ name, spec: document.getElementById('memberSpec').value, online: true });
  saveMembers();
  document.getElementById('memberName').value = '';
  closeAddMember();
  renderMembers();
  renderTechBoard();
}

// ── Filter ──
function filterTech(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTechBoard();
}

// ── Render board ──
function renderTechBoard() {
  renderMembers();
  const board = document.getElementById('techBoard');
  let tasks = getAllTasks();
  const memberFilter = document.getElementById('memberFilter')?.value || 'all';

  if (memberFilter !== 'all') tasks = tasks.filter(t => t.tech_assigned === memberFilter);
  if (currentFilter !== 'all') tasks = tasks.filter(t => getPriority(t.date_key) === currentFilter);

  // Sort: urgent first
  tasks.sort((a,b) => {
    const order = {urgent:0,medium:1,normal:2};
    return (order[getPriority(a.date_key)]||2) - (order[getPriority(b.date_key)]||2);
  });

  // Update badge
  const badge = document.getElementById('techBadge');
  const urgentCount = getAllTasks().filter(t => getPriority(t.date_key)==='urgent').length;
  if (urgentCount > 0) { badge.style.display='inline'; badge.textContent=urgentCount; }
  else badge.style.display='none';

  if (!tasks.length) {
    board.innerHTML = `<div class="tech-empty">
      <div class="empty-icon">⚡</div>
      <p class="empty-title">Нет задач</p>
      <p class="empty-sub">Задачи появятся из Google Sheets автоматически</p>
    </div>`;
    return;
  }

  const statusColors = {
    'В работе':'rgba(34,197,94,0.12)',
    'Ждём бриф':'rgba(59,130,246,0.12)',
    'Ждём оплату':'rgba(245,158,11,0.12)',
    'Взять в работу':'rgba(255,255,255,0.05)',
  };
  const statusTextColors = {
    'В работе':'#22c55e',
    'Ждём бриф':'#60a5fa',
    'Ждём оплату':'#f59e0b',
    'Взять в работу':'#8a8a96',
  };

  board.innerHTML = tasks.map(t => {
    const p = getPriority(t.date_key);
    const rem = Math.max(0,(t.total||0)-(t.prepay||0));
    const dl = daysLeft(t.date_key);
    const statusBg = statusColors[t.status] || 'rgba(255,255,255,0.05)';
    const statusTxt = statusTextColors[t.status] || '#8a8a96';
    return `<div class="task-card ${p}" onclick="openTaskDetail('${t.id}')">
      <div class="task-header">
        <span class="task-priority ${p}">${priorityLabel(p)}</span>
        <span class="task-assignee">${t.tech_assigned || '—'}</span>
      </div>
      <div class="task-body">
        <div class="task-name">${t.first_name} ${t.last_name||''}</div>
        <div class="task-type">${t.type||'—'} ${t.duration?'· '+t.duration:''}</div>
        <div class="task-deadline ${p}">Сдача: ${dl}</div>
        ${t.status?`<span class="task-status-badge" style="background:${statusBg};color:${statusTxt}">${t.status}</span>`:''}
        <div class="task-finance">
          <div class="tf-item"><span class="tf-label">Сумма</span><span class="tf-val">${fmt2(t.total)} ₸</span></div>
          <div class="tf-item"><span class="tf-label">Предоплата</span><span class="tf-val green">${fmt2(t.prepay)} ₸</span></div>
          <div class="tf-item"><span class="tf-label">Остаток</span><span class="tf-val ${rem>0?'pink':''}">${fmt2(rem)} ₸</span></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Task detail ──
function openTaskDetail(id) {
  const all = getAllTasks();
  const t = all.find(x => x.id === id);
  if (!t) return;
  selectedTask = t;

  document.getElementById('taskDetail').style.display = 'block';
  const rem = Math.max(0,(t.total||0)-(t.prepay||0));
  const p = getPriority(t.date_key);

  document.getElementById('tdBody').innerHTML = `
    <div class="td-section">
      <div class="td-section-title">Клиент</div>
      <div class="td-row"><span class="td-label">Имя</span><span class="td-val">${t.first_name} ${t.last_name||''}</span></div>
      ${t.phone?`<div class="td-row"><span class="td-label">Телефон</span><span class="td-val">${t.phone}</span></div>`:''}
      ${t.instagram?`<div class="td-row"><span class="td-label">Instagram</span><span class="td-val">${t.instagram}</span></div>`:''}
    </div>
    <div class="td-section">
      <div class="td-section-title">Заказ</div>
      <div class="td-row"><span class="td-label">Тип</span><span class="td-val">${t.type||'—'}</span></div>
      <div class="td-row"><span class="td-label">Длительность</span><span class="td-val">${t.duration||'—'}</span></div>
      <div class="td-row"><span class="td-label">Дата сдачи</span><span class="td-val task-deadline ${p}">${daysLeft(t.date_key)}</span></div>
      <div class="td-row"><span class="td-label">Статус</span><span class="td-val">${t.status||'—'}</span></div>
      <div class="td-row"><span class="td-label">Менеджер</span><span class="td-val">${t.manager||'—'}</span></div>
    </div>
    <div class="td-section">
      <div class="td-section-title">Оплата</div>
      <div class="td-finance">
        <div class="td-fin-item"><span class="td-label">Сумма</span><span class="td-fin-val">${fmt2(t.total)} ₸</span></div>
        <div class="td-fin-item"><span class="td-label">Предоплата</span><span class="td-fin-val green">${fmt2(t.prepay)} ₸</span></div>
        <div class="td-fin-item"><span class="td-label">Остаток</span><span class="td-fin-val ${rem>0?'pink':''}">${fmt2(rem)} ₸</span></div>
        <div class="td-fin-item"><span class="td-label">Оплата</span><span class="td-fin-val">${t.pay_type||'—'}</span></div>
      </div>
    </div>
    <div class="td-section">
      <div class="td-section-title">Назначить</div>
      <select class="reassign-select" id="reassignSelect" onchange="reassignTask(this.value)">
        <option value="">Выбрать специалиста</option>
        ${members.map(m=>`<option value="${m.name}" ${t.tech_assigned===m.name?'selected':''}>${m.name} ${m.online?'🟢':'⚫'}</option>`).join('')}
      </select>
    </div>
    <div class="td-actions">
      <button class="td-action-btn" onclick="autoAssignTask()">⚡ Авто-назначение</button>
      <button class="td-action-btn danger" onclick="closeTaskDetail()">Закрыть</button>
    </div>`;
}

async function reassignTask(memberName) {
  if (!selectedTask || !memberName) return;
  try {
    await sbFetch(`bookings?id=eq.${selectedTask.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ tech_assigned: memberName })
    });
    selectedTask.tech_assigned = memberName;
    await loadAll();
    openTaskDetail(selectedTask.id);
  } catch(e) { console.error(e); }
}

function autoAssignTask() {
  if (!selectedTask) return;
  const member = autoAssign(selectedTask);
  if (!member) { alert('Нет онлайн специалистов!'); return; }
  document.getElementById('reassignSelect').value = member.name;
  reassignTask(member.name);
}

function closeTaskDetail() {
  document.getElementById('taskDetail').style.display = 'none';
  selectedTask = null;
}

// ── Stats ──
function renderTechStats() {
  const all = getAllTasks();
  const thisMonth = new Date().getMonth()+1;
  const thisYear = new Date().getFullYear();

  const active = all.filter(t => t.status !== 'Успешно завершено').length;
  const totalSum = all.reduce((s,t)=>s+(t.total||0),0);
  const totalRem = all.reduce((s,t)=>s+Math.max(0,(t.total||0)-(t.prepay||0)),0);

  document.getElementById('statActive').textContent = active;
  document.getElementById('statSum').textContent = fmt2(totalSum)+' ₸';
  document.getElementById('statRemainder').textContent = fmt2(totalRem)+' ₸';
}

// Init
renderMembers();
