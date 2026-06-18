const API_URL = 'https://script.google.com/macros/s/AKfycbzxxlmZwF8avOJCBsa9I-7LQHZen8M-JYIaGrTTfr5gOJ3IiPeILwWZVvKfyu0mL-h_/exec';
const ADMIN_USER = 'admin';
const ADMIN_PASS = '1900';
const REFRESH_MS = 10000;

let currentRole = null;
let currentStudent = null;
let currentUser = null;
let allEvents = [];
let latestReportRows = [];
let selectedParticipantIds = [];
let timer = null;
let currentStream = null;
let capturedImage = null;
let photoResolver = null;

function val(id){const el=document.getElementById(id);return el?el.value.trim():''}

async function api(action, payload={}){
  const body = {action, ...payload};
  const res = await fetch(API_URL, {
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(body)
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.message || 'เกิดข้อผิดพลาด');
  return data;
}

function adminPayload(){return {adminUser:ADMIN_USER, adminPass:ADMIN_PASS}}

async function login(){
  try{
    const data = await api('login',{user:val('loginUser'), pass:val('loginPass')});
    currentRole=data.role; currentUser=data.user; currentStudent=data.student||null;
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('appSection').classList.remove('hidden');
    document.getElementById('welcomeText').innerText = currentRole==='admin' ? 'ผู้ดูแลระบบ' : `${currentStudent.fullName} (${currentStudent.studentId})`;
    buildMenu();
    startRealtime();
  }catch(e){alert(e.message)}
}

function logout(){localStorage.clear();location.reload()}

function buildMenu(){
  const menu=document.getElementById('menu');
  if(currentRole==='admin'){
    menu.innerHTML=`<button class="tab active" onclick="showPage('adminEventsPage')">จัดการกิจกรรม</button><button class="tab" onclick="showPage('adminStudentsPage')">รายชื่อนักศึกษา</button><button class="tab" onclick="showPage('adminReportPage')">รายงาน</button>`;
    showPage('adminEventsPage');
  }else{
    menu.innerHTML=`<button class="tab active" onclick="showPage('studentPage')">กิจกรรม / การจอง</button>`;
    showPage('studentPage');
  }
}

async function showPage(id){
  ['studentPage','adminEventsPage','adminStudentsPage','adminReportPage'].forEach(p=>document.getElementById(p).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  [...document.querySelectorAll('.tab')].forEach(b=>{if(b.getAttribute('onclick')?.includes(id)) b.classList.add('active')});
  await refreshActive();
}

function startRealtime(){
  if(timer) clearInterval(timer);
  timer = setInterval(refreshActive, REFRESH_MS);
}

async function refreshActive(){
  const visible = id => !document.getElementById(id).classList.contains('hidden');
  document.getElementById('liveStatus').innerText = '● กำลังอัปเดต';
  try{
    if(currentRole==='admin' && visible('adminEventsPage')) { await loadFilterOptions(); await loadAdminEvents(); }
    if(currentRole==='admin' && visible('adminStudentsPage')) await loadStudents();
    if(currentRole==='admin' && visible('adminReportPage')) { await loadReportEvents(false); await loadReport(); }
    if(currentRole==='student' && visible('studentPage')) { await loadStudentEvents(); await loadMyBookings(); }
    document.getElementById('liveStatus').innerText = '● Live';
  }catch(e){
    document.getElementById('liveStatus').innerText = '● Offline';
  }
}

/* years */
function selectedYears(){return [...document.querySelectorAll('.year-btn.active')].map(b=>b.dataset.year).join(',')}
function toggleYear(btn){
  if(btn.dataset.year==='ทุกชั้นปี'){document.querySelectorAll('.year-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');return}
  document.querySelector('.year-btn[data-year="ทุกชั้นปี"]').classList.remove('active');
  btn.classList.toggle('active');
  if(!document.querySelectorAll('.year-btn.active').length) document.querySelector('.year-btn[data-year="ทุกชั้นปี"]').classList.add('active');
}


async function loadFilterOptions(){
  if(currentRole !== 'admin') return;

  try{
    const r = await api('getFilterOptions', adminPayload());
    const box = document.getElementById('majorButtons');
    if(!box || box.dataset.loaded === '1') return;

    const majors = r.majors || [];
    box.innerHTML = `<button type="button" class="choice-btn active" data-value="ทั้งหมด" onclick="toggleChoice(this,'majorButtons')">ทั้งหมด</button>` +
      majors.map(m => `<button type="button" class="choice-btn" data-value="${m}" onclick="toggleChoice(this,'majorButtons')">${m}</button>`).join('');

    box.dataset.loaded = '1';
  }catch(e){
    console.warn(e.message);
  }
}

function toggleChoice(btn, groupId){
  const group = document.getElementById(groupId);
  const value = btn.dataset.value;

  if(value === 'ทั้งหมด'){
    group.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    return;
  }

  const allBtn = group.querySelector('.choice-btn[data-value="ทั้งหมด"]');
  if(allBtn) allBtn.classList.remove('active');

  btn.classList.toggle('active');

  if(!group.querySelectorAll('.choice-btn.active').length && allBtn){
    allBtn.classList.add('active');
  }
}

function selectedChoices(groupId){
  const values = [...document.querySelectorAll(`#${groupId} .choice-btn.active`)].map(b => b.dataset.value);
  return values.length ? values.join(',') : 'ทั้งหมด';
}

function setChoices(groupId, csv){
  const group = document.getElementById(groupId);
  if(!group) return;

  const values = String(csv || 'ทั้งหมด').split(',').map(x => x.trim()).filter(Boolean);

  group.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('active'));

  values.forEach(v => {
    const btn = [...group.querySelectorAll('.choice-btn')].find(b => b.dataset.value === v);
    if(btn) btn.classList.add('active');
  });

  if(!group.querySelectorAll('.choice-btn.active').length){
    const allBtn = group.querySelector('.choice-btn[data-value="ทั้งหมด"]');
    if(allBtn) allBtn.classList.add('active');
  }
}

function addParticipantStudentId(){
  const input = document.getElementById('participantStudentIdInput');
  const id = input.value.trim();

  if(!/^\d{8}$/.test(id)){
    alert('กรุณากรอกรหัสนักศึกษา 8 หลัก');
    return;
  }

  if(!selectedParticipantIds.includes(id)){
    selectedParticipantIds.push(id);
  }

  input.value = '';
  renderParticipantStudentIds();
}

function removeParticipantStudentId(id){
  selectedParticipantIds = selectedParticipantIds.filter(x => x !== id);
  renderParticipantStudentIds();
}

function renderParticipantStudentIds(){
  const box = document.getElementById('participantStudentIds');

  if(!selectedParticipantIds.length){
    box.innerHTML = '<span class="tag all-tag">ทั้งหมด</span>';
    return;
  }

  box.innerHTML = selectedParticipantIds.map(id => `
    <span class="tag">${id}<button type="button" onclick="removeParticipantStudentId('${id}')">×</button></span>
  `).join('');
}

function selectedParticipantStudentIds(){
  return selectedParticipantIds.length ? selectedParticipantIds.join(',') : 'ทั้งหมด';
}

function setParticipantStudentIds(csv){
  const value = String(csv || 'ทั้งหมด').trim();

  selectedParticipantIds = value === 'ทั้งหมด'
    ? []
    : value.split(',').map(x => x.trim()).filter(Boolean);

  renderParticipantStudentIds();
}

/* Admin Events */
async function saveEvent(){
  try{
    const data = {
      eventId:val('eventId'), title:val('title'), description:val('description'), eventDate:val('eventDate'),
      startTime:val('startTime'), endTime:val('endTime'), capacity:val('capacity'),
      checkinStart:val('checkinStart'), checkinEnd:val('checkinEnd'), checkoutStart:val('checkoutStart'), checkoutEnd:val('checkoutEnd'),
      activityType:val('activityType'), location:val('location'), checkinMapLink:val('checkinMapLink'), checkoutMapLink:val('checkoutMapLink'),
      publishDate:val('publishDate'), level:val('level'), allowedYears:selectedYears()||'ทุกชั้นปี', allowedFaculties:selectedChoices('facultyButtons'), allowedMajors:selectedChoices('majorButtons'), allowedStudentIds:selectedParticipantStudentIds()
    };
    const res=await api('saveEvent',{...adminPayload(), data});
    alert(res.message); clearEventForm(); loadAdminEvents();
  }catch(e){alert(e.message)}
}
async function loadAdminEvents(){
  const data=await api('getEvents'); allEvents=data.events;
  if(!allEvents.length){document.getElementById('adminEventList').innerHTML='<p class="small">ยังไม่มีกิจกรรม</p>';return}
  document.getElementById('adminEventList').innerHTML=`<div class="table-wrap"><table><thead><tr><th>กิจกรรม</th><th>วันที่</th><th>เวลา</th><th>จอง</th><th>IN/OUT</th><th>ผู้เข้าร่วม</th><th>จัดการ</th></tr></thead><tbody>${allEvents.map(e=>`<tr><td><b>${e.title}</b><br><span class="badge">${e.level}</span> <span class="badge">${e.activityType}</span></td><td>${e.eventDate}</td><td>${e.startTime}-${e.endTime}</td><td>${e.booked}/${e.capacity}<br>IN ${e.checkedIn||0} / OUT ${e.completed||0}</td><td>${e.checkinLat||'-'}, ${e.checkinLng||'-'}<br>${e.checkoutLat||'-'}, ${e.checkoutLng||'-'}</td><td>คณะ: ${e.allowedFaculties||'ทั้งหมด'}<br>สาขา: ${e.allowedMajors||'ทั้งหมด'}<br>รหัส: ${e.allowedStudentIds||'ทั้งหมด'}</td><td><button class="btn-light" onclick='editEvent(${JSON.stringify(e)})'>แก้ไข</button><button class="btn-light" onclick="copyEvent('${e.eventId}')">คัดลอก</button><button class="btn-red" onclick="deleteEvent('${e.eventId}')">ลบ</button></td></tr>`).join('')}</tbody></table></div>`;
}
function editEvent(e){
  Object.keys(e).forEach(k=>{const el=document.getElementById(k); if(el) el.value=e[k]||''});
  document.querySelectorAll('.year-btn').forEach(b=>b.classList.remove('active'));
  String(e.allowedYears||'ทุกชั้นปี').split(',').forEach(y=>{const b=document.querySelector(`.year-btn[data-year="${y}"]`); if(b)b.classList.add('active')});
  setChoices('facultyButtons', e.allowedFaculties || 'ทั้งหมด');
  setChoices('majorButtons', e.allowedMajors || 'ทั้งหมด');
  setParticipantStudentIds(e.allowedStudentIds || 'ทั้งหมด');
  scrollTo({top:0,behavior:'smooth'});
}
async function copyEvent(id){try{const r=await api('copyEvent',{...adminPayload(),eventId:id});alert(r.message);loadAdminEvents()}catch(e){alert(e.message)}}
async function deleteEvent(id){if(!confirm('ยืนยันลบกิจกรรม?'))return;try{const r=await api('deleteEvent',{...adminPayload(),eventId:id});alert(r.message);loadAdminEvents()}catch(e){alert(e.message)}}
function clearEventForm(){document.querySelectorAll('#adminEventsPage input,#adminEventsPage textarea').forEach(el=>el.value='');document.querySelectorAll('.year-btn').forEach(b=>b.classList.remove('active'));document.querySelector('.year-btn[data-year="ทุกชั้นปี"]').classList.add('active');
  setChoices('facultyButtons','ทั้งหมด');
  setChoices('majorButtons','ทั้งหมด');
  setParticipantStudentIds('ทั้งหมด');
}

/* Admin Students */
async function saveStudent(){try{const data={studentId:val('studentId'),fullName:val('fullName'),major:val('major'),faculty:val('faculty'),birthDate:val('birthDate'),phone:val('phone')};const r=await api('saveStudent',{...adminPayload(),data});alert(r.message);clearStudentForm();loadStudents()}catch(e){alert(e.message)}}
async function loadStudents(){try{const r=await api('searchStudents',{...adminPayload(),keyword:val('studentSearch')});const s=r.students;if(!s.length){document.getElementById('studentList').innerHTML='<p class="small">ไม่พบข้อมูล</p>';return}document.getElementById('studentList').innerHTML=`<div class="table-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>คณะ</th><th>สาขา</th><th>ชั้นปี</th><th>โทร</th><th>จัดการ</th></tr></thead><tbody>${s.map(x=>`<tr><td>${x.studentId}</td><td>${x.fullName}</td><td>${x.faculty}</td><td>${x.major}</td><td>${x.yearLevel}</td><td>${x.phone}</td><td><button class="btn-light" onclick='editStudent(${JSON.stringify(x)})'>แก้ไข</button><button class="btn-red" onclick="removeStudent('${x.studentId}')">ลบ</button></td></tr>`).join('')}</tbody></table></div>`}catch(e){alert(e.message)}}
function editStudent(s){['studentId','fullName','major','faculty','birthDate','phone'].forEach(id=>document.getElementById(id).value=s[id]||'')}
async function removeStudent(id){if(!confirm('ยืนยันลบนักศึกษา?'))return;try{const r=await api('deleteStudent',{...adminPayload(),studentId:id});alert(r.message);loadStudents()}catch(e){alert(e.message)}}
function clearStudentForm(){['studentId','fullName','major','faculty','birthDate','phone'].forEach(id=>document.getElementById(id).value='')}


function todayISO(){
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}

function eventDateTime(event, timeKey='endTime'){
  return new Date(`${event.eventDate}T${event[timeKey] || '23:59'}:00`);
}

function isPastEvent(event){
  return eventDateTime(event, 'endTime') < new Date();
}

function sortEventsAsc(a,b){
  return new Date(`${a.eventDate}T${a.startTime || '00:00'}:00`) - new Date(`${b.eventDate}T${b.startTime || '00:00'}:00`);
}

function eventCard(e, groupClass='upcoming'){
  return `
    <div class="event ${groupClass}">
      <h3>${e.title}</h3>
      <div class="small">${e.eventDate} | ${e.startTime} - ${e.endTime}</div>
      <div class="small">${e.description || ''}</div>

      <div class="status">
        <span class="badge">${e.level || '-'}</span>
        <span class="badge">${e.activityType || '-'}</span>
        <span class="badge">จอง ${e.booked || 0}/${e.capacity || 0}</span>
        <span class="badge">ชั้นปี: ${e.allowedYears || 'ทุกชั้นปี'}</span>
      </div>

      <div class="time-box">
        Check-in: ${e.checkinStart || '-'} - ${e.checkinEnd || '-'} น.<br>
        Check-out: ${e.checkoutStart || '-'} - ${e.checkoutEnd || '-'} น.
      </div>

      <div class="event-actions">
        <button onclick="openBooking('${e.eventId}')">จองกิจกรรม</button>
      </div>
    </div>
  `;
}

function bookingCard(b){
  const e = b.event || {};
  return `
    <div class="event">
      <h3>${e.title || '-'}</h3>
      <div class="small">${e.eventDate || '-'} | ${e.startTime || '-'} - ${e.endTime || '-'}</div>

      <div class="time-box">
        เวลาที่ต้อง Check-in: ${e.checkinStart || '-'} - ${e.checkinEnd || '-'} น.<br>
        เวลาที่ต้อง Check-out: ${e.checkoutStart || '-'} - ${e.checkoutEnd || '-'} น.
      </div>

      <div class="status">
        สถานะ: <b>${b.status || '-'}</b><br>
        Check-in: ${b.checkinAt || '-'} ${b.checkinDistance ? `(${b.checkinDistance} ม.)` : ''}<br>
        Check-out: ${b.checkoutAt || '-'} ${b.checkoutDistance ? `(${b.checkoutDistance} ม.)` : ''}
      </div>

      <div class="event-actions">
        <button onclick="doCheckIn('${b.eventId}')">Check-in</button>
        <button class="btn-dark" onclick="doCheckOut('${b.eventId}')">Check-out</button>
      </div>
    </div>
  `;
}

function completedCard(b){
  const e = b.event || {};
  return `
    <div class="event completed">
      <h3>${e.title || '-'}</h3>
      <div class="small">${e.eventDate || '-'} | ${e.startTime || '-'} - ${e.endTime || '-'}</div>

      <div class="status">
        เข้าร่วมแล้ว / Check-out สำเร็จ<br>
        Check-in: ${b.checkinAt || '-'} ${b.checkinDistance ? `(${b.checkinDistance} ม.)` : ''}<br>
        Check-out: ${b.checkoutAt || '-'} ${b.checkoutDistance ? `(${b.checkoutDistance} ม.)` : ''}
      </div>
    </div>
  `;
}

/* Student */
async function loadStudentEvents(){
  const r = await api('getEvents');
  const today = todayISO();

  const visibleFutureEvents = r.events
    .filter(e => e.visible)
    .filter(e => !isPastEvent(e))
    .sort(sortEventsAsc);

  const todayEvents = visibleFutureEvents.filter(e => e.eventDate === today);
  const upcomingEvents = visibleFutureEvents.filter(e => e.eventDate > today);

  document.getElementById('todayEvents').innerHTML = todayEvents.length
    ? todayEvents.map(e => eventCard(e, 'today')).join('')
    : '<div class="empty-state">วันนี้ยังไม่มีกิจกรรมที่เปิดให้จอง</div>';

  document.getElementById('upcomingEvents').innerHTML = upcomingEvents.length
    ? upcomingEvents.map(e => eventCard(e, 'upcoming')).join('')
    : '<div class="empty-state">ยังไม่มีกิจกรรมที่กำลังจะมาถึง</div>';
}

function photoHtml(url, title){
  if(!url) return '-';
  const img = drivePreviewUrl(url);
  return `
    <div class="photo-cell">
      <img class="report-photo" src="${img}" onclick="openPhotoModal('${img}', '${title}')" alt="${title}">
      <a class="photo-link" href="${url}" target="_blank">เปิดต้นฉบับ</a>
    </div>
  `;
}

function openPhotoModal(url, title){
  document.getElementById('photoModalTitle').innerText = title || 'ตรวจสอบรูปภาพ';
  document.getElementById('photoModalImg').src = url;
  document.getElementById('photoModal').classList.remove('hidden');
}

function closePhotoModal(){
  document.getElementById('photoModal').classList.add('hidden');
  document.getElementById('photoModalImg').src = '';
}

/* Report */
async function loadReportEvents(keep=true){const r=await api('getEvents');const old=val('reportEvent');document.getElementById('reportEvent').innerHTML=r.events.map(e=>`<option value="${e.eventId}">${e.title}</option>`).join('');if(keep&&old)document.getElementById('reportEvent').value=old}
async function loadReport(){const eventId=val('reportEvent');if(!eventId){document.getElementById('reportTable').innerHTML='<p class="small">ยังไม่มีกิจกรรม</p>';return}const r=await api('getEventReport',{...adminPayload(),eventId});const rows=r.rows;document.getElementById('reportTable').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>สถานะ</th><th>Check-in</th><th>รูป IN</th><th>Check-out</th><th>รูป OUT</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.studentId}</td><td>${x.fullName||''}</td><td>${x.status}</td><td>${x.checkinAt||'-'}<br>${x.checkinDistance?x.checkinDistance+' ม.':''}</td><td>${x.checkinPhotoUrl?`<a href="${x.checkinPhotoUrl}" target="_blank">ดูรูป</a>`:'-'}</td><td>${x.checkoutAt||'-'}<br>${x.checkoutDistance?x.checkoutDistance+' ม.':''}</td><td>${x.checkoutPhotoUrl?`<a href="${x.checkoutPhotoUrl}" target="_blank">ดูรูป</a>`:'-'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="small">ยังไม่มีผู้จอง</p>'}


function exportReportExcel(){
  if(!latestReportRows || !latestReportRows.length){
    alert('ยังไม่มีข้อมูลรายงานสำหรับส่งออก');
    return;
  }

  const select = document.getElementById('reportEvent');
  const eventTitle = select.options[select.selectedIndex]?.text || 'รายงานกิจกรรม';

  const rows = latestReportRows.map((x, i) => ({
    'ลำดับ': i + 1,
    'รหัสนักศึกษา': x.studentId || '',
    'ชื่อ-สกุล': x.fullName || '',
    'คณะ': x.faculty || '',
    'สาขาวิชา': x.major || '',
    'ชั้นปี': x.yearLevel || '',
    'เบอร์โทรศัพท์': x.phone || '',
    'สถานะ': x.status || '',
    'เวลา Check-in': x.checkinAt || '',
    'Latitude Check-in': x.checkinLat || '',
    'Longitude Check-in': x.checkinLng || '',
    'ระยะห่าง Check-in (เมตร)': x.checkinDistance || '',
    'รูป Check-in': x.checkinPhotoUrl || '',
    'เวลา Check-out': x.checkoutAt || '',
    'Latitude Check-out': x.checkoutLat || '',
    'Longitude Check-out': x.checkoutLng || '',
    'ระยะห่าง Check-out (เมตร)': x.checkoutDistance || '',
    'รูป Check-out': x.checkoutPhotoUrl || '',
    'วันเวลาที่จอง': x.createdAt || ''
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  ws['!cols'] = [
    {wch:8}, {wch:14}, {wch:28}, {wch:22}, {wch:26}, {wch:10},
    {wch:14}, {wch:14}, {wch:20}, {wch:16}, {wch:16}, {wch:18},
    {wch:45}, {wch:20}, {wch:16}, {wch:16}, {wch:18}, {wch:45}, {wch:20}
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'รายงาน');

  const safeTitle = eventTitle.replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
  const fileName = `รายงาน_${safeTitle}_${new Date().toISOString().slice(0,10)}.xlsx`;

  XLSX.writeFile(wb, fileName);
}
