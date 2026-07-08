// ── Tech Department ──

const TASK_WEIGHTS = { 'Реклама':1, 'Мультик':2, 'Мультик Lux':3, 'Фильм':4 };

let members = [];
let currentFilter = 'all';
let selectedTask = null;
let allTasksRaw = [];
let currentMemberView = null;

function fmt2(n) { return Number(n||0).toLocaleString('ru-KZ'); }

// ── Members from Supabase ──
async function loadMembers() {
  try {
    const data = await sbFetch('members?select=*&order=created_at.asc');
    members = data || [];
  } catch(e) { console.error('loadMembers error:', e); }
}

async function saveMemberToDb(name, spec) {
  try {
    await sbFetch('members', {
      method: 'POST', prefer: 'return=minimal',
      body: JSON.stringify({ name, spec, online: true })
    });
  } catch(e) { console.error(e); }
}

async function deleteMemberFromDb(id) {
  try {
    await sbFetch(`members?id=eq.${id}`, { method: 'DELETE' });
  } catch(e) { console.error(e); }
}

async function toggleOnlineDb(id, online) {
  try {
    await sbFetch(`members?id=eq.${id}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ online: !online })
    });
  } catch(e) { console.error(e); }
}

// ── Fetch tasks ──
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

// ── Member screen ──
function selectMember(name) {
  currentMemberView = name;
  closeTaskDetail();
  renderTechBoard();
}

function backToAll() {
  currentMemberView = null;
  closeTaskDetail();
  renderTechBoard();
}

// ── Render members sidebar ──
function renderMembers() {
  const wrap = document.getElementById('techMembers');
  const sel = document.getElementById('memberFilter');
  if (!wrap) return;

  if (sel) {
    sel.innerHTML = '<option value="all">Все спецы</option>' +
      members.map(m=>`<option value="${m.name}">${m.name}</option>`).join('');
    if (currentMemberView) sel.value = currentMemberView;
  }

  if (!members.length) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:8px 0">Нажми + чтобы добавить специалиста</p>';
    renderTechStats();
    return;
  }

  wrap.innerHTML = members.map((m) => {
    const { count, weight } = getMemberLoad(m.name);
    const maxW = 10;
    const pct = Math.min(100, (weight/maxW)*100);
    const barCls = pct>80?'danger':pct>50?'warn':'';
    const isSelected = currentMemberView === m.name;
    return `<div class="member-card ${isSelected?'selected':''}" onclick="selectMember('${m.name}')">
      <div class="member-top">
        <span class="member-name">${m.name}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="member-del" onclick="event.stopPropagation();toggleOnline('${m.id}',${m.online})" title="${m.online?'Онлайн':'Оффлайн'}">${m.online?'🟢':'⚫'}</button>
          <button class="member-del" onclick="event.stopPropagation();deleteMember('${m.id}','${m.name}')">✕</button>
        </div>
      </div>
      <div class="member-load">${count} задач · вес ${weight}</div>
      <div class="member-bar"><div class="member-bar-fill ${barCls}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');

  renderTechStats();
}

async function toggleOnline(id, currentOnline) {
  await toggleOnlineDb(id, currentOnline);
  await loadMembers();
  renderMembers();
}

async function deleteMember(id, name) {
  if (!confirm(`Удалить ${name}?`)) return;
  await deleteMemberFromDb(id);
  if (currentMemberView === name) currentMemberView = null;
  await loadMembers();
  renderMembers();
  renderTechBoard();
}

// ── Add member modal ──
function showAddMember() {
  document.getElementById('addMemberModal').style.display = 'flex';
  setTimeout(() => document.getElementById('memberName').focus(), 100);
}
function closeAddMember() {
  document.getElementById('addMemberModal').style.display = 'none';
}
async function saveMember() {
  const name = document.getElementById('memberName').value.trim();
  if (!name) return;
  const spec = document.getElementById('memberSpec').value;
  await saveMemberToDb(name, spec);
  document.getElementById('memberName').value = '';
  closeAddMember();
  await loadMembers();
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
  await Promise.all([fetchAllTasksRaw(), loadMembers()]);
  renderMembers();

  const board = document.getElementById('techBoard');
  if (!board) return;

  let tasks = getAllTasks();

  if (currentMemberView) {
    renderMemberScreen(currentMemberView, tasks, board);
    return;
  }

  if (currentFilter !== 'all') tasks = tasks.filter(t=>getPriority(t.date_key)===currentFilter);
  tasks.sort((a,b)=>{
    const order={urgent:0,medium:1,normal:2};
    return (order[getPriority(a.date_key)]||2)-(order[getPriority(b.date_key)]||2);
  });

  const badge = document.getElementById('techBadge');
  const urgentCount = getAllTasks().filter(t=>getPriority(t.date_key)==='urgent').length;
  if (badge) {
    if (urgentCount>0){badge.style.display='inline';badge.textContent=urgentCount;}
    else badge.style.display='none';
  }

  const header = document.getElementById('techBoardHeader');
  if (header) header.style.display = 'flex';

  if (!tasks.length) {
    board.innerHTML=`<div class="tech-empty"><div class="empty-icon">⚡</div>
      <p class="empty-title">Нет задач</p>
      <p class="empty-sub">Задачи появятся из Google Sheets автоматически</p></div>`;
    return;
  }

  board.innerHTML = tasks.map(t => renderTaskCard(t)).join('');
}

// ── Member screen ──
function renderMemberScreen(memberName, allTasks, board) {
  const member = members.find(m => m.name === memberName);
  const tasks = allTasks.filter(t => t.tech_assigned === memberName);
  const totalSum = tasks.reduce((s,t)=>s+(t.total||0),0);
  const totalRem = tasks.reduce((s,t)=>s+Math.max(0,(t.total||0)-(t.prepay||0)),0);

  const header = document.getElementById('techBoardHeader');
  if (header) header.style.display = 'none';

  board.innerHTML = `
    <div style="grid-column:1/-1;margin-bottom:1rem">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1rem">
        <button onclick="backToAll()" style="background:none;border:1px solid var(--border);border-radius:8px;padding:6px 14px;color:var(--text2);font-size:13px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:600" onmouseover="this.style.borderColor='var(--green)';this.style.color='var(--green)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text2)'">← Назад</button>
        <div>
          <span style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--text)">${memberName}</span>
          <span style="margin-left:8px;font-size:12px;color:var(--text3)">${member?.online?'🟢 Онлайн':'⚫ Оффлайн'}</span>
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:1.5rem">
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 16px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text3);font-family:'Syne',sans-serif">Задач</div>
          <div style="font-size:20px;font-weight:700;font-family:'Syne',sans-serif;color:var(--text)">${tasks.length}</div>
        </div>
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 16px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text3);font-family:'Syne',sans-serif">Сумма</div>
          <div style="font-size:20px;font-weight:700;font-family:'Syne',sans-serif;color:var(--green)">${fmt2(totalSum)} ₸</div>
        </div>
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 16px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text3);font-family:'Syne',sans-serif">Остаток</div>
          <div style="font-size:20px;font-weight:700;font-family:'Syne',sans-serif;color:var(--pink)">${fmt2(totalRem)} ₸</div>
        </div>
      </div>
    </div>
    ${tasks.length === 0
      ? `<div class="tech-empty" style="grid-column:1/-1"><div class="empty-icon">📋</div><p class="empty-title">Нет задач</p><p class="empty-sub">У ${memberName} пока нет назначенных заказов</p></div>`
      : tasks.sort((a,b)=>{
          const order={urgent:0,medium:1,normal:2};
          return (order[getPriority(a.date_key)]||2)-(order[getPriority(b.date_key)]||2);
        }).map(t => renderTaskCard(t)).join('')
    }`;
}

// ── Task card ──
function renderTaskCard(t) {
  const p = getPriority(t.date_key);
  const rem = Math.max(0,(t.total||0)-(t.prepay||0));
  const dl = daysLeft(t.date_key);
  const statusColors = {
    'В работе':'rgba(34,197,94,0.12)','Ждём бриф':'rgba(59,130,246,0.12)',
    'Ждём оплату':'rgba(245,158,11,0.12)','Взять в работу':'rgba(255,255,255,0.05)'
  };
  const statusTxtColors = {
    'В работе':'#22c55e','Ждём бриф':'#60a5fa',
    'Ждём оплату':'#f59e0b','Взять в работу':'#8a8a96'
  };
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
      ${t.status?`<span style="background:${sBg};color:${sTxt};margin-top:6px;display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;font-family:'Syne',sans-serif;font-weight:600">${t.status}</span>`:''}
      <div class="task-finance">
        <div class="tf-item"><span class="tf-label">Сумма</span><span class="tf-val">${fmt2(t.total)} ₸</span></div>
        <div class="tf-item"><span class="tf-label">Предоплата</span><span class="tf-val green">${fmt2(t.prepay)} ₸</span></div>
        <div class="tf-item"><span class="tf-label">Остаток</span><span class="tf-val ${rem>0?'pink':''}">${fmt2(rem)} ₸</span></div>
      </div>
    </div>
  </div>`;
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
      ${t.tech_assigned?`<button class="td-action-btn danger" onclick="unassignTask()" style="width:100%;margin-bottom:8px;text-align:center">✕ Снять (${t.tech_assigned})</button>`:''}
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

async function unassignTask() {
  if (!selectedTask) return;
  try {
    await sbFetch(`bookings?id=eq.${selectedTask.id}`,{
      method:'PATCH', prefer:'return=minimal',
      body:JSON.stringify({tech_assigned:null})
    });
    const id = selectedTask.id;
    await renderTechBoard();
    openTaskDetail(id);
  } catch(e){console.error(e);}
}

async function reassignTask(memberName) {
  if (!selectedTask||!memberName) return;
  try {
    await sbFetch(`bookings?id=eq.${selectedTask.id}`,{
      method:'PATCH', prefer:'return=minimal',
      body:JSON.stringify({tech_assigned:memberName})
    });
    const id = selectedTask.id;
    await renderTechBoard();
    openTaskDetail(id);
  } catch(e){console.error(e);}
}

function autoAssignTask() {
  if (!selectedTask) return;
  const member = autoAssign(selectedTask);
  if (!member){alert('Нет онлайн специалистов!');return;}
  reassignTask(member.name);
}

function closeTaskDetail() {
  document.getElementById('taskDetail').style.display='none';
  selectedTask=null;
}

// ── Stats ──
function renderTechStats() {
  const tasks = getAllTasks();
  const totalSum = tasks.reduce((s,t)=>s+(t.total||0),0);
  const totalRem = tasks.reduce((s,t)=>s+Math.max(0,(t.total||0)-(t.prepay||0)),0);
  const doneEl = document.getElementById('statDone');
  const activeEl = document.getElementById('statActive');
  const sumEl = document.getElementById('statSum');
  const remEl = document.getElementById('statRemainder');
  if(doneEl) doneEl.textContent = document.getElementById('counterVal')?.textContent||'0';
  if(activeEl) activeEl.textContent = tasks.length;
  if(sumEl) sumEl.textContent = fmt2(totalSum)+' ₸';
  if(remEl) remEl.textContent = fmt2(totalRem)+' ₸';
}

// ── Init ──
loadMembers().then(() => renderMembers());
