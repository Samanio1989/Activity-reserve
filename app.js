const API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
const ADMIN_USER = 'admin';
const ADMIN_PASS = '1900';
const REFRESH_MS = 10000;

let currentRole = null;
let currentStudent = null;
let currentUser = null;
let allEvents = [];
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
    if(currentRole==='admin' && visible('adminEventsPage')) await loadAdminEvents();
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

/* Admin Events */
async function saveEvent(){
  try{
    const data = {
      eventId:val('eventId'), title:val('title'), description:val('description'), eventDate:val('eventDate'),
      startTime:val('startTime'), endTime:val('endTime'), capacity:val('capacity'),
      checkinStart:val('checkinStart'), checkinEnd:val('checkinEnd'), checkoutStart:val('checkoutStart'), checkoutEnd:val('checkoutEnd'),
      activityType:val('activityType'), location:val('location'), checkinMapLink:val('checkinMapLink'), checkoutMapLink:val('checkoutMapLink'),
      publishDate:val('publishDate'), level:val('level'), allowedYears:selectedYears()||'ทุกชั้นปี'
    };
    const res=await api('saveEvent',{...adminPayload(), data});
    alert(res.message); clearEventForm(); loadAdminEvents();
  }catch(e){alert(e.message)}
}
async function loadAdminEvents(){
  const data=await api('getEvents'); allEvents=data.events;
  if(!allEvents.length){document.getElementById('adminEventList').innerHTML='<p class="small">ยังไม่มีกิจกรรม</p>';return}
  document.getElementById('adminEventList').innerHTML=`<div class="table-wrap"><table><thead><tr><th>กิจกรรม</th><th>วันที่</th><th>เวลา</th><th>จอง</th><th>IN/OUT</th><th>จัดการ</th></tr></thead><tbody>${allEvents.map(e=>`<tr><td><b>${e.title}</b><br><span class="badge">${e.level}</span> <span class="badge">${e.activityType}</span></td><td>${e.eventDate}</td><td>${e.startTime}-${e.endTime}</td><td>${e.booked}/${e.capacity}<br>IN ${e.checkedIn||0} / OUT ${e.completed||0}</td><td>${e.checkinLat||'-'}, ${e.checkinLng||'-'}<br>${e.checkoutLat||'-'}, ${e.checkoutLng||'-'}</td><td><button class="btn-light" onclick='editEvent(${JSON.stringify(e)})'>แก้ไข</button><button class="btn-light" onclick="copyEvent('${e.eventId}')">คัดลอก</button><button class="btn-red" onclick="deleteEvent('${e.eventId}')">ลบ</button></td></tr>`).join('')}</tbody></table></div>`;
}
function editEvent(e){
  Object.keys(e).forEach(k=>{const el=document.getElementById(k); if(el) el.value=e[k]||''});
  document.querySelectorAll('.year-btn').forEach(b=>b.classList.remove('active'));
  String(e.allowedYears||'ทุกชั้นปี').split(',').forEach(y=>{const b=document.querySelector(`.year-btn[data-year="${y}"]`); if(b)b.classList.add('active')});
  scrollTo({top:0,behavior:'smooth'});
}
async function copyEvent(id){try{const r=await api('copyEvent',{...adminPayload(),eventId:id});alert(r.message);loadAdminEvents()}catch(e){alert(e.message)}}
async function deleteEvent(id){if(!confirm('ยืนยันลบกิจกรรม?'))return;try{const r=await api('deleteEvent',{...adminPayload(),eventId:id});alert(r.message);loadAdminEvents()}catch(e){alert(e.message)}}
function clearEventForm(){document.querySelectorAll('#adminEventsPage input,#adminEventsPage textarea').forEach(el=>el.value='');document.querySelectorAll('.year-btn').forEach(b=>b.classList.remove('active'));document.querySelector('.year-btn[data-year="ทุกชั้นปี"]').classList.add('active')}

/* Admin Students */
async function saveStudent(){try{const data={studentId:val('studentId'),fullName:val('fullName'),major:val('major'),faculty:val('faculty'),birthDate:val('birthDate'),phone:val('phone')};const r=await api('saveStudent',{...adminPayload(),data});alert(r.message);clearStudentForm();loadStudents()}catch(e){alert(e.message)}}
async function loadStudents(){try{const r=await api('searchStudents',{...adminPayload(),keyword:val('studentSearch')});const s=r.students;if(!s.length){document.getElementById('studentList').innerHTML='<p class="small">ไม่พบข้อมูล</p>';return}document.getElementById('studentList').innerHTML=`<div class="table-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>คณะ</th><th>สาขา</th><th>ชั้นปี</th><th>โทร</th><th>จัดการ</th></tr></thead><tbody>${s.map(x=>`<tr><td>${x.studentId}</td><td>${x.fullName}</td><td>${x.faculty}</td><td>${x.major}</td><td>${x.yearLevel}</td><td>${x.phone}</td><td><button class="btn-light" onclick='editStudent(${JSON.stringify(x)})'>แก้ไข</button><button class="btn-red" onclick="removeStudent('${x.studentId}')">ลบ</button></td></tr>`).join('')}</tbody></table></div>`}catch(e){alert(e.message)}}
function editStudent(s){['studentId','fullName','major','faculty','birthDate','phone'].forEach(id=>document.getElementById(id).value=s[id]||'')}
async function removeStudent(id){if(!confirm('ยืนยันลบนักศึกษา?'))return;try{const r=await api('deleteStudent',{...adminPayload(),studentId:id});alert(r.message);loadStudents()}catch(e){alert(e.message)}}
function clearStudentForm(){['studentId','fullName','major','faculty','birthDate','phone'].forEach(id=>document.getElementById(id).value='')}

/* Student */
async function loadStudentEvents(){const r=await api('getEvents');allEvents=r.events.filter(e=>e.visible);document.getElementById('eventCalendar').innerHTML=allEvents.length?allEvents.map(e=>`<div class="event"><h3>${e.title}</h3><div class="small">${e.eventDate} | ${e.startTime}-${e.endTime}</div><div class="small">${e.description||''}</div><div class="status"><span class="badge">${e.level}</span><span class="badge">${e.activityType}</span><span class="badge">จอง ${e.booked}/${e.capacity}</span><span class="badge">ชั้นปี: ${e.allowedYears}</span></div><button onclick="openBooking('${e.eventId}')">จองกิจกรรม</button></div>`).join(''):'<p class="small">ยังไม่มีกิจกรรม</p>'}
function openBooking(id){document.getElementById('bookingEventId').value=id;document.getElementById('bookingPhone').value=currentStudent.phone||'';document.getElementById('bookingBirthDate').value='';document.getElementById('bookingModal').classList.remove('hidden')}
function closeBookingModal(){document.getElementById('bookingModal').classList.add('hidden')}
async function confirmBooking(){try{const r=await api('bookEvent',{eventId:val('bookingEventId'),studentId:currentStudent.studentId,phone:val('bookingPhone'),birthDate:val('bookingBirthDate')});alert(r.message);closeBookingModal();refreshActive()}catch(e){alert(e.message)}}
async function loadMyBookings(){const r=await api('getMyBookings',{studentId:currentStudent.studentId});const b=r.bookings;document.getElementById('myBookings').innerHTML=b.length?b.map(x=>`<div class="event"><h3>${x.event.title}</h3><div class="small">${x.event.eventDate} | ${x.event.startTime}-${x.event.endTime}</div><div class="status">สถานะ: <b>${x.status}</b><br>Check-in: ${x.checkinAt||'-'}<br>Check-out: ${x.checkoutAt||'-'}</div><button onclick="doCheckIn('${x.eventId}')">Check-in</button><button class="btn-dark" onclick="doCheckOut('${x.eventId}')">Check-out</button></div>`).join(''):'<p class="small">ยังไม่มีกิจกรรมที่จอง</p>'}

/* Camera Location */
function getLocation(){return new Promise((resolve,reject)=>{if(!navigator.geolocation){reject(new Error('อุปกรณ์นี้ไม่รองรับ Location'));return}navigator.geolocation.getCurrentPosition(pos=>resolve({lat:pos.coords.latitude,lng:pos.coords.longitude}),()=>reject(new Error('กรุณาอนุญาต Location')), {enableHighAccuracy:true,timeout:15000,maximumAge:0})})}
async function openCameraForPhoto(title){capturedImage=null;document.getElementById('cameraTitle').innerText=title;document.getElementById('photoPreview').classList.add('hidden');document.getElementById('usePhotoBtn').classList.add('hidden');document.getElementById('video').classList.remove('hidden');currentStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});document.getElementById('video').srcObject=currentStream;document.getElementById('cameraModal').classList.remove('hidden');return new Promise((resolve,reject)=>{photoResolver={resolve,reject}})}
function closeCameraModal(){document.getElementById('cameraModal').classList.add('hidden');if(currentStream){currentStream.getTracks().forEach(t=>t.stop());currentStream=null}if(photoResolver){photoResolver.reject(new Error('ยกเลิกการถ่ายภาพ'));photoResolver=null}}
function capturePhoto(){const v=document.getElementById('video'),c=document.getElementById('canvas');if(!v.videoWidth){alert('กล้องยังไม่พร้อม');return}c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0,c.width,c.height);capturedImage=c.toDataURL('image/jpeg',0.75);document.getElementById('photoPreview').src=capturedImage;document.getElementById('photoPreview').classList.remove('hidden');document.getElementById('usePhotoBtn').classList.remove('hidden');document.getElementById('video').classList.add('hidden')}
function useCapturedPhoto(){if(currentStream){currentStream.getTracks().forEach(t=>t.stop());currentStream=null}document.getElementById('cameraModal').classList.add('hidden');photoResolver.resolve(capturedImage);photoResolver=null}
async function doCheckIn(id){try{const loc=await getLocation();const photo=await openCameraForPhoto('ถ่ายภาพยืนยัน Check-in');const r=await api('checkIn',{eventId:id,studentId:currentStudent.studentId,lat:loc.lat,lng:loc.lng,photoBase64:photo});alert(r.message);refreshActive()}catch(e){alert(e.message)}}
async function doCheckOut(id){try{const loc=await getLocation();const photo=await openCameraForPhoto('ถ่ายภาพยืนยัน Check-out');const r=await api('checkOut',{eventId:id,studentId:currentStudent.studentId,lat:loc.lat,lng:loc.lng,photoBase64:photo});alert(r.message);refreshActive()}catch(e){alert(e.message)}}

/* Report */
async function loadReportEvents(keep=true){const r=await api('getEvents');const old=val('reportEvent');document.getElementById('reportEvent').innerHTML=r.events.map(e=>`<option value="${e.eventId}">${e.title}</option>`).join('');if(keep&&old)document.getElementById('reportEvent').value=old}
async function loadReport(){const eventId=val('reportEvent');if(!eventId){document.getElementById('reportTable').innerHTML='<p class="small">ยังไม่มีกิจกรรม</p>';return}const r=await api('getEventReport',{...adminPayload(),eventId});const rows=r.rows;document.getElementById('reportTable').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>สถานะ</th><th>Check-in</th><th>รูป IN</th><th>Check-out</th><th>รูป OUT</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.studentId}</td><td>${x.fullName||''}</td><td>${x.status}</td><td>${x.checkinAt||'-'}<br>${x.checkinDistance?x.checkinDistance+' ม.':''}</td><td>${x.checkinPhotoUrl?`<a href="${x.checkinPhotoUrl}" target="_blank">ดูรูป</a>`:'-'}</td><td>${x.checkoutAt||'-'}<br>${x.checkoutDistance?x.checkoutDistance+' ม.':''}</td><td>${x.checkoutPhotoUrl?`<a href="${x.checkoutPhotoUrl}" target="_blank">ดูรูป</a>`:'-'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="small">ยังไม่มีผู้จอง</p>'}
