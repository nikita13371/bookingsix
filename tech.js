// ── Tech Department ──

const TASK_WEIGHTS = { 'Реклама':1, 'Мультик':2, 'Мультик Lux':3, 'Фильм':4 };
const ACTIVE_STATUSES = ['В работе','Ждём бриф','Ждём оплату','Взять в работу',''];

let members = JSON.parse(localStorage.getItem('sixg_members') || '[]');
let currentFilter = 'all';
let selectedTask = null;
let allTasksRaw = [];

function saveMembers() { localStorage.setItem('sixg_members', JSON.stringify(members)); }
function fmt2(n) { return Number(n||0).toLocaleString('ru-KZ'); }

// ── Fetch all tasks directly from Supabase ──
async function fetchAllTasksRaw() {
  try {
    const data = await sbFetch('bookings?select=*&order=date_key.asc');
    allTasksRaw = (data || []).filter(b => {
      const s = (b.status || '').trim();
      return s !== 'Успешно завершено' && s !== 'Отказ';
    });
  } catch(e) { console.error('fetchAllTasksRaw error:', e); }
}

function getAllTasks() { return allTasksRaw; }

// ── Priority ──
function getPriority(dateKey) {
  if (!dateKey) return 'normal';
  const parts = dateKey.split('-');
  if (parts.length < 3) return 'normal';
  const [y,m,d] = parts.map(Number);
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
  const parts = dateKey.split('-');
  if (parts.length < 3) return '—';
  const [y,m,d] = parts.map(Number);
  const deadline = new Date(y, m-1, d);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.ceil((deadline - today) / (1000*60*60*24));
  if (diff < 0) return 'Просрочено';
  if (diff === 0) return 'Сегодня';
  return `${diff} дн.`;
}

// ── Member load ──
function getMemberLoad(memberName) {
  const tasks = getAllTasks().filter(t => t.tech_assigned === memberName);
  const weight = tasks.reduce((s,t)=>s+(TASK_WEIGHTS[t.type]||1),0);
  return { count: tasks.length, weight };
}

// ── Auto-assign ──
function autoAssign(task) {
  const online = members.filter(m => m.online);
  if (!online.length) return null;
  let best = null, bestScore = Infinity;
  online.forEach(m => {
    const { weight } = getMemberLoad(m.name);
    const tasks = getAllTasks().filter(t => t.tech_assigned === m.name);
    let dc = 1;
    tasks.forEach(t => {
      const p = getPriority(t.date_key);
      if (p==='urgent') dc = Math.max(dc, 2);
      else if (p==='medium') dc = Math.max(dc, 1.5);
    });
    const score = weight * dc;
    if (score < bestScore) { bestScore = score; best = m; }
  });
  return best;
}

// ── Render members ──
function renderMembers() {
  const wrap = document.getElementById('techMembers');
  const sel = document.getElementById('memberFilter');
  if (!wrap || !sel) return;

  sel.innerHTML = '<option value="all">Все спецы</option>' +
    members.map(m=>`<option value="${m.name}">${m.name}</option>`).join('');

  if (!members.length) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:8px 0">Нажми + чтобы добавить специалиста</p>';
    renderTechStats();
    return;
  }

  wrap.innerHTML = members.map((m,i) => {
    const { count, weight } = getMemberLoad(m.name);
    const maxW = 10;
    const pct = Math.min(100, (weight/maxW)*100);
    const barCls = pct>80?'danger':pct>50?'warn':'';
    return `<div class="member-card">
      <div class="member-top">
        <span class="member-name">${m.name}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="member-del" onclick="toggleOnline(${i})" title="${m.online?'Онлайн':'Оффлайн'}">${m.online?'🟢':'⚫'}</button>
          <button class="member-del" onclick="deleteMember(${i})">✕</button>
        </div>
      </div>
      <div class="member-load">${count} задач · вес ${weight}</div>
      <div class="member-bar"><div class="member-bar-fill ${barCls}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');

  renderTechStats();
}

function toggleOnline(i) {
  members[i].online = !members[i].online;
  saveMembers(); renderMembers();
}

function deleteMember(i) {
  if (!confirm(`Удалить ${members[i].name}?`)) return;
  members.splice(i,1); saveMembers(); renderMembers(); renderTechBoard();
}

// ── Add member modal ──
function showAddMember() {
  document.getElementById('addMemberModal').style.display = 'flex';
  setTimeout(() => document.getElementById('memberName').focus(), 100);
}
function closeAddMember() {
  document.getElementById('addMemberModal').style.display = 'none';
}
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
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderTechBoard();
}

// ── Render board ──
async function renderTechBoard() {
  await fetchAllTasksRaw();
  renderMembers();

  const board = document.getElementById('techBoard');
  if (!board) return;

  let tasks = getAllTasks();
  const memberFilter = document.getElementById('memberFilter')?.value || 'all';
  if (memberFilter !== 'all') tasks = tasks.filter(t=>t.tech_assigned===memberFilter);
  if (currentFilter !== 'all') tasks = tasks.filter(t=>getPriority(t.date_key)===currentFilter);

  tasks.sort((a,b)=>{
    const order={urgent:0,medium:1,normal:2};
    return (order[getPriority(a.date_key)]||2)-(order[getPriority(b.date_key)]||2);
  });

  // Badge
  const badge = document.getElementById('techBadge');
  const urgentCount = getAllTasks().filter(t=>getPriority(t.date_key)==='urgent').length;
  if (badge) {
    if (urgentCount>0){badge.style.display='inline';badge.textContent=urgentCount;}
    else badge.style.display='none';
  }

  if (!tasks.length) {
    board.innerHTML=`<div class="tech-empty">
      <div class="empty-icon">⚡</div>
      <p class="empty-title">Нет задач</p>
      <p class="empty-sub">Задачи появятся из Google Sheets автоматически</p>
    </div>`;
    return;
  }

  const statusColors = {
    'В работе':'rgba(34,197,94,0.12)','Ждём бриф':'rgba(59,130,246,0.12)',
    'Ждём оплату':'rgba(245,158,11,0.12)','Взять в работу':'rgba(255,255,255,0.05)'
  };
  const statusTxtColors = {
    'В работе':'#22c55e','Ждём бриф':'#60a5fa',
    'Ждём оплату':'#f59e0b','Взять в работу':'#8a8a96'
  };

  board.innerHTML = tasks.map(t => {
    const p = getPriority(t.date_key);
    const rem = Math.max(0,(t.total||0)-(t.prepay||0));
    const dl = daysLeft(t.date_key);
    const sBg = statusColors[t.status]||'rgba(255,255,255,0.05)';
    const sTxt = statusTxtColors[t.status]||'#8a8a96';
    return `<div class="task-card ${p}" onclick="openTaskDetail('${t.id}')">
      <div class="task-header">
        <span class="task-priority ${p}">${priorityLabel(p)}</span>
        <span class="task-assignee">${t.tech_assigned||'Не назначен'}</span>
      </div>
      <div class="task-body">
        <div class="task-name">${t.first_name} ${t.last_name||''}</div>
        <div class="task-type">${t.type||'—'} ${t.duration?'· '+t.duration:''}</div>
        <div class="task-deadline ${p}">Сдача: ${dl}</div>
        ${t.status?`<span class="task-status-badge" style="background:${sBg};color:${sTxt};margin-top:6px;display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-family:'Syne',sans-serif;font-weight:600">${t.status}</span>`:''}
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
  const t = getAllTasks().find(x=>x.id===id);
  if (!t) return;
  selectedTask = t;
  const detail = document.getElementById('taskDetail');
  detail.style.display = 'block';
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
  if (!selectedTask||!memberName) return;
  try {
    await sbFetch(`bookings?id=eq.${selectedTask.id}`,{
      method:'PATCH', prefer:'return=minimal',
      body:JSON.stringify({tech_assigned:memberName})
    });
    selectedTask.tech_assigned = memberName;
    await renderTechBoard();
    openTaskDetail(selectedTask.id);
  } catch(e){console.error(e);}
}

function autoAssignTask() {
  if (!selectedTask) return;
  const member = autoAssign(selectedTask);
  if (!member){alert('Нет онлайн специалистов!');return;}
  document.getElementById('reassignSelect').value = member.name;
  reassignTask(member.name);
}

function closeTaskDetail() {
  document.getElementById('taskDetail').style.display='none';
  selectedTask=null;
}

// ── Stats ──
function renderTechStats() {
  const tasks = getAllTasks();
  const active = tasks.length;
  const totalSum = tasks.reduce((s,t)=>s+(t.total||0),0);
  const totalRem = tasks.reduce((s,t)=>s+Math.max(0,(t.total||0)-(t.prepay||0)),0);
  const doneEl = document.getElementById('statDone');
  const activeEl = document.getElementById('statActive');
  const sumEl = document.getElementById('statSum');
  const remEl = document.getElementById('statRemainder');
  if(doneEl) doneEl.textContent = document.getElementById('counterVal')?.textContent||'0';
  if(activeEl) activeEl.textContent = active;
  if(sumEl) sumEl.textContent = fmt2(totalSum)+' ₸';
  if(remEl) remEl.textContent = fmt2(totalRem)+' ₸';
}

// ── Init ──
renderMembers();
