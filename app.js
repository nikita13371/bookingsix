// ── Supabase ──
const SUPABASE_URL = 'https://gmsvzrhhgtaowhzopilj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdtc3Z6cmhoZ3Rhb3doem9waWxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MzQxODcsImV4cCI6MjA5NDUxMDE4N30.5p3Owu_sEsCOtLUsmwIyLbeVRXSvu2vB27aqXdBNGWM';

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || '',
      ...options.headers
    }
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── State ──
const MAX_SLOTS = 5;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_SHORT = ['ЯНВ','ФЕВ','МАР','АПР','МАЙ','ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК'];
const HIDDEN_STATUSES = ['Успешно завершено','Отказ'];

let bookings = {};
let selectedDate = null;
let curYear, curMonth;
const now = new Date();
curYear = now.getFullYear();
curMonth = now.getMonth();

// ── Tab switching ──
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + tab).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'tech') renderTechBoard();
}

async function loadAll() {
  try {
    const data = await sbFetch('bookings?select=*&order=time.asc');
    bookings = {};
    (data || []).forEach(b => {
      if (HIDDEN_STATUSES.includes(b.status)) return;
      if (!bookings[b.date_key]) bookings[b.date_key] = [];
      bookings[b.date_key].push(b);
    });
    // Count completed this month for counter
    const allData = data || [];
    const thisMonth = now.getMonth() + 1;
    const thisYear = now.getFullYear();
    const done = allData.filter(b => {
      if (b.status !== 'Успешно завершено') return false;
      const [y,m] = (b.date_key || '').split('-');
      return parseInt(y) === thisYear && parseInt(m) === thisMonth;
    });
    document.getElementById('counterVal').textContent = done.length;
  } catch(e) { console.error(e); }
  renderCal();
  renderUpcoming();
  if (selectedDate) { updateSlotSummary(); renderDayBookings(); }
  if (document.getElementById('page-tech').classList.contains('active')) renderTechBoard();
}

function fmt(n) { return Number(n||0).toLocaleString('ru-KZ'); }
function calcRemainder() {
  const t = parseFloat(document.getElementById('fTotal').value)||0;
  const p = parseFloat(document.getElementById('fPrepay').value)||0;
  document.getElementById('fRemainder').value = Math.max(0,t-p);
}

// ── Calendar ──
function renderCal() {
  document.getElementById('calMonth').textContent = MONTHS_RU[curMonth];
  document.getElementById('calYear').textContent = curYear;
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  const first = new Date(curYear, curMonth, 1);
  let startDow = first.getDay(); startDow = startDow===0?6:startDow-1;
  const days = new Date(curYear, curMonth+1, 0).getDate();
  const todayKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
  for(let i=0;i<startDow;i++){const e=document.createElement('div');e.className='cal-cell empty';grid.appendChild(e);}
  for(let d=1;d<=days;d++){
    const key=`${curYear}-${curMonth+1}-${d}`;
    const count=(bookings[key]||[]).length;
    const cell=document.createElement('div');
    let cls='cal-cell';
    if(key===todayKey)cls+=' today';
    if(key===selectedDate)cls+=' selected';
    cell.className=cls;
    let dot='';
    if(count>0&&count<MAX_SLOTS)dot='<div class="cell-dots"><div class="cell-dot p"></div></div>';
    else if(count>=MAX_SLOTS)dot='<div class="cell-dots"><div class="cell-dot r"></div></div>';
    cell.innerHTML=`<span class="cell-num">${d}</span>${dot}`;
    cell.onclick=()=>openDay(key,d);
    grid.appendChild(cell);
  }
}

function openDay(key,d) {
  selectedDate=key; renderCal();
  document.getElementById('dayEmpty').style.display='none';
  document.getElementById('dayContent').style.display='block';
  const dow=new Date(curYear,curMonth,d).toLocaleDateString('ru-RU',{weekday:'long'});
  document.getElementById('dayLabel').textContent=`${dow.charAt(0).toUpperCase()+dow.slice(1)}, ${d} ${MONTHS[curMonth]}`;
  document.getElementById('formWrap').style.display='none';
  updateSlotSummary(); renderDayBookings();
}

function closeDay() {
  selectedDate=null; renderCal();
  document.getElementById('dayEmpty').style.display='flex';
  document.getElementById('dayContent').style.display='none';
  document.getElementById('formWrap').style.display='none';
}

function updateSlotSummary() {
  if(!selectedDate)return;
  const count=(bookings[selectedDate]||[]).length;
  document.getElementById('daySlotsSummary').textContent=`${count} из ${MAX_SLOTS} мест занято`;
  document.getElementById('addBtn').disabled=count>=MAX_SLOTS;
}

function renderDayBookings() {
  if(!selectedDate)return;
  const list=bookings[selectedDate]||[];
  const wrap=document.getElementById('bookingsWrap');
  if(!list.length){wrap.innerHTML='<p class="no-bookings">Нет записей на этот день</p>';return;}
  wrap.innerHTML=list.map((b,i)=>{
    const rem=Math.max(0,(b.total||0)-(b.prepay||0));
    return `<div class="booking-card">
      <div class="bc-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="b-time">${b.time||'—'}</span>
          <div><div class="b-name">${b.first_name} ${b.last_name||''}</div>${b.instagram?`<div class="b-ig">${b.instagram}</div>`:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${b.type?`<span class="b-type-badge">${b.type}</span>`:''}
          <button class="b-del" onclick="deleteBooking('${b.id}')">✕</button>
        </div>
      </div>
      <div class="bc-body">
        <div class="bc-row">
          ${b.phone?`<div class="bc-field"><span class="bc-label">Телефон</span><span class="bc-val">${b.phone}</span></div>`:''}
          ${b.duration?`<div class="bc-field"><span class="bc-label">Длительность</span><span class="bc-val">${b.duration}</span></div>`:''}
          ${b.manager?`<div class="bc-field"><span class="bc-label">Ответственный</span><span class="bc-val">${b.manager}</span></div>`:''}
          ${b.status?`<div class="bc-field"><span class="bc-label">Статус</span><span class="bc-val">${b.status}</span></div>`:''}
        </div>
        <div class="bc-finance">
          <div class="bc-fin-item"><span class="bc-label">Сумма</span><span class="bc-fin-val">${fmt(b.total)} ₸</span></div>
          <div class="bc-fin-item"><span class="bc-label">Предоплата</span><span class="bc-fin-val green">${fmt(b.prepay)} ₸</span></div>
          <div class="bc-fin-item"><span class="bc-label">Остаток</span><span class="bc-fin-val ${rem>0?'pink':''}">${fmt(rem)} ₸</span></div>
          ${b.pay_type?`<div class="bc-fin-item"><span class="bc-label">Оплата</span><span class="bc-fin-val">${b.pay_type}</span></div>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function showForm() {
  if(!selectedDate||(bookings[selectedDate]||[]).length>=MAX_SLOTS)return;
  document.getElementById('formWrap').style.display='block';
  ['fFirstName','fLastName','fInstagram','fPhone','fDuration','fManager'].forEach(id=>document.getElementById(id).value='');
  ['fTotal','fPrepay','fRemainder'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('fType').value='';
  document.getElementById('fPayType').value='';
  document.getElementById('fTime').value='10:00';
  document.getElementById('formWrap').scrollIntoView({behavior:'smooth',block:'nearest'});
}

async function saveBooking() {
  const firstName=document.getElementById('fFirstName').value.trim();
  if(!firstName){document.getElementById('fFirstName').focus();return;}
  const btn=document.getElementById('saveBtn');
  btn.disabled=true; btn.textContent='Сохранение...';
  try {
    await sbFetch('bookings',{method:'POST',prefer:'return=minimal',body:JSON.stringify({
      date_key:selectedDate, time:document.getElementById('fTime').value,
      first_name:firstName, last_name:document.getElementById('fLastName').value.trim(),
      instagram:document.getElementById('fInstagram').value.trim(),
      phone:document.getElementById('fPhone').value.trim(),
      type:document.getElementById('fType').value,
      duration:document.getElementById('fDuration').value.trim(),
      total:parseFloat(document.getElementById('fTotal').value)||0,
      prepay:parseFloat(document.getElementById('fPrepay').value)||0,
      pay_type:document.getElementById('fPayType').value,
      manager:document.getElementById('fManager').value.trim()
    })});
    document.getElementById('formWrap').style.display='none';
    await loadAll();
  } catch(e){ console.error(e); }
  btn.disabled=false; btn.textContent='Сохранить';
}

async function deleteBooking(id) {
  if(!confirm('Удалить?'))return;
  await sbFetch(`bookings?id=eq.${id}`,{method:'DELETE'});
  await loadAll();
}

function renderUpcoming() {
  const all=[];
  const today=new Date(); today.setHours(0,0,0,0);
  Object.entries(bookings).forEach(([key,list])=>{
    const [y,m,d]=key.split('-').map(Number);
    const date=new Date(y,m-1,d);
    if(date>=today)list.forEach(b=>all.push({key,date,d,m:m-1,y,...b}));
  });
  all.sort((a,b)=>a.date-b.date||(a.time||'').localeCompare(b.time||''));
  document.getElementById('upcomingCount').textContent=all.length;
  const ul=document.getElementById('upcomingList');
  if(!all.length){ul.innerHTML='<p class="no-upcoming">Нет записей</p>';return;}
  ul.innerHTML=all.slice(0,30).map(b=>`
    <div class="up-card" onclick="jumpToDate('${b.key}',${b.d},${b.m},${b.y})">
      <div class="up-date">${MONTHS_SHORT[b.m]} ${b.d}</div>
      <div class="up-name">${b.first_name} ${b.last_name||''}</div>
      ${b.type?`<div class="up-type">${b.type}</div>`:''}
      <div class="up-slot">${b.time||'—'}</div>
    </div>`).join('');
}

function jumpToDate(key,d,m,y){curMonth=m;curYear=y;renderCal();openDay(key,d);}

// ── Event listeners ──
document.getElementById('prevBtn').onclick=()=>{curMonth--;if(curMonth<0){curMonth=11;curYear--;}selectedDate=null;closeDay();renderCal()};
document.getElementById('nextBtn').onclick=()=>{curMonth++;if(curMonth>11){curMonth=0;curYear++;}selectedDate=null;closeDay();renderCal()};
document.getElementById('closeBtn').onclick=closeDay;
document.getElementById('addBtn').onclick=showForm;
document.getElementById('cancelBtn').onclick=()=>{document.getElementById('formWrap').style.display='none'};
document.getElementById('saveBtn').onclick=saveBooking;
document.getElementById('fTotal').addEventListener('input',calcRemainder);
document.getElementById('fPrepay').addEventListener('input',calcRemainder);

setInterval(loadAll,15000);
loadAll();
