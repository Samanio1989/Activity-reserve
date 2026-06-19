const API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';

const ADMIN_USER = 'admin';
const ADMIN_PASS = '1900';
const REFRESH_MS = 10000;

let currentRole = null;
let currentStudent = null;
let currentUser = null;
let allEvents = [];
let latestReportRows = [];
let selectedParticipantIds = [];
let majorOptionsCache = [];
let participantSearchTimer = null;
let timer = null;
let currentStream = null;
let capturedImage = null;
let photoResolver = null;

/* ---------- BASIC ---------- */

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function show(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hide(id) {
  document.getElementById(id).classList.add('hidden');
}

async function api(action, payload = {}) {
  const body = { action, ...payload };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!data.ok) {
    throw new Error(data.message || 'เกิดข้อผิดพลาด');
  }

  return data;
}

function adminPayload() {
  return {
    adminUser: ADMIN_USER,
    adminPass: ADMIN_PASS
  };
}

/* ---------- LOGIN ---------- */

async function login() {
  try {
    const data = await api('login', {
      user: val('loginUser'),
      pass: val('loginPass')
    });

    currentRole = data.role;
    currentUser = data.user;
    currentStudent = data.student || null;

    hide('loginSection');
    show('appSection');

    document.getElementById('welcomeText').innerText =
      currentRole === 'admin'
        ? 'ผู้ดูแลระบบ'
        : `${currentStudent.fullName} (${currentStudent.studentId})`;

    buildMenu();
    startRealtime();

  } catch (err) {
    alert(err.message);
  }
}

function logout() {
  currentRole = null;
  currentStudent = null;
  currentUser = null;

  if (timer) clearInterval(timer);

  location.reload();
}

function buildMenu() {
  const menu = document.getElementById('menu');

  if (currentRole === 'admin') {
    menu.innerHTML = `
      <button class="tab active" onclick="showPage('adminEventsPage')">จัดการกิจกรรม</button>
      <button class="tab" onclick="showPage('adminStudentsPage')">รายชื่อนักศึกษา</button>
      <button class="tab" onclick="showPage('adminReportPage')">รายงาน</button>
    `;

    showPage('adminEventsPage');

  } else {
    menu.innerHTML = `
      <button class="tab active" onclick="showPage('studentPage')">กิจกรรม / การจอง</button>
    `;

    showPage('studentPage');
  }
}

async function showPage(id) {
  ['studentPage', 'adminEventsPage', 'adminStudentsPage', 'adminReportPage']
    .forEach(page => hide(page));

  show(id);

  document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));

  [...document.querySelectorAll('.tab')].forEach(btn => {
    if (btn.getAttribute('onclick')?.includes(id)) {
      btn.classList.add('active');
    }
  });

  await refreshActive();
}

function startRealtime() {
  if (timer) clearInterval(timer);
  timer = setInterval(refreshActive, REFRESH_MS);
}

async function refreshActive() {
  if (!currentRole) return;

  const visible = id => !document.getElementById(id).classList.contains('hidden');

  const status = document.getElementById('liveStatus');
  if (status) status.innerText = '● กำลังอัปเดต';

  try {
    if (currentRole === 'admin' && visible('adminEventsPage')) {
      await loadFilterOptions();
      await loadAdminEvents();
      updatePermissionPreview();
    }

    if (currentRole === 'admin' && visible('adminStudentsPage')) {
      await loadStudents();
    }

    if (currentRole === 'admin' && visible('adminReportPage')) {
      await loadReportEvents(false);
      await loadReport();
    }

    if (currentRole === 'student' && visible('studentPage')) {
      await loadStudentEvents();
      await loadMyBookings();
    }

    if (status) status.innerText = '● Live';

  } catch (err) {
    console.warn(err.message);
    if (status) status.innerText = '● Offline';
  }
}

/* ---------- YEAR ---------- */

function selectedYears() {
  return [...document.querySelectorAll('.year-btn.active')]
    .map(btn => btn.dataset.year)
    .join(',');
}

function toggleYear(btn) {
  const year = btn.dataset.year;

  if (year === 'ทุกชั้นปี') {
    document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updatePermissionPreview();
    return;
  }

  document.querySelector('.year-btn[data-year="ทุกชั้นปี"]').classList.remove('active');
  btn.classList.toggle('active');

  if (!document.querySelectorAll('.year-btn.active').length) {
    document.querySelector('.year-btn[data-year="ทุกชั้นปี"]').classList.add('active');
  }

  updatePermissionPreview();
}

/* ---------- PARTICIPANT FILTER ---------- */

async function loadFilterOptions() {
  if (currentRole !== 'admin') return;

  try {
    const r = await api('getFilterOptions', adminPayload());
    majorOptionsCache = r.majors || [];

    renderMajorOptions(majorOptionsCache, true);

  } catch (err) {
    console.warn(err.message);
  }
}

function renderMajorOptions(majors, selectAllWhenEmpty = false) {
  const select = document.getElementById('allowedMajors');
  if (!select) return;

  const currentSelected = selectedMultiValues('allowedMajors');

  select.innerHTML = majors
    .map(m => `<option value="${m}">${m}</option>`)
    .join('');

  const shouldSelectAll = selectAllWhenEmpty && currentSelected.length === 0;

  [...select.options].forEach(opt => {
    opt.selected = shouldSelectAll || currentSelected.includes(opt.value);
  });

  updatePermissionPreview();
}

function filterMajorOptions(keyword) {
  const q = String(keyword || '').toLowerCase().trim();
  const select = document.getElementById('allowedMajors');

  if (!select) return;

  [...select.options].forEach(opt => {
    opt.hidden = q && !String(opt.value).toLowerCase().includes(q);
  });
}

function selectedMultiValues(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return [];

  return [...select.selectedOptions].map(opt => opt.value);
}

function requiredMultiSelect(selectId, label) {
  const values = selectedMultiValues(selectId);

  if (!values.length) {
    throw new Error(`กรุณาเลือก${label}อย่างน้อย 1 รายการ`);
  }

  return values.join(',');
}

function setSelectValues(selectId, csv, selectAllIfAll = true) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const value = String(csv || '').trim();

  [...select.options].forEach(opt => opt.selected = false);

  if (!value || value === 'ทั้งหมด') {
    if (selectAllIfAll) {
      [...select.options].forEach(opt => opt.selected = true);
    }

    updatePermissionPreview();
    return;
  }

  const values = value.split(',').map(x => x.trim()).filter(Boolean);

  [...select.options].forEach(opt => {
    opt.selected = values.includes(opt.value);
  });

  updatePermissionPreview();
}

async function searchParticipantStudents(force = false) {
  clearTimeout(participantSearchTimer);

  participantSearchTimer = setTimeout(async () => {
    const keyword = val('participantStudentSearch');
    const box = document.getElementById('participantSearchResults');

    if (!force && (!keyword || keyword.length < 2)) {
      box.innerHTML = '<p class="small">พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา</p>';
      return;
    }

    if (force && !keyword) {
      box.innerHTML = '<p class="small">กรุณาพิมพ์คำค้นหา</p>';
      return;
    }

    try {
      const r = await api('searchStudents', {
        ...adminPayload(),
        keyword
      });

      const students = r.students || [];

      if (!students.length) {
        box.innerHTML = '<p class="small">ไม่พบรายชื่อนักศึกษา</p>';
        return;
      }

      box.innerHTML = students.map(s => `
        <div class="search-result-item">
          <div>
            <b>${s.studentId}</b> ${s.fullName || ''}<br>
            <span class="small">${s.faculty || ''} / ${s.major || ''}</span>
          </div>
          <button type="button" onclick="addParticipantStudentId('${s.studentId}', '${String(s.fullName || '').replace(/'/g, '')}')">เพิ่ม</button>
        </div>
      `).join('');

    } catch (err) {
      box.innerHTML = `<p class="small">${err.message}</p>`;
    }

  }, force ? 0 : 350);
}

function addParticipantStudentId(id, name = '') {
  if (!/^\d{8}$/.test(String(id))) {
    alert('รหัสนักศึกษาต้องเป็นตัวเลข 8 หลัก');
    return;
  }

  if (!selectedParticipantIds.some(x => x.id === id)) {
    selectedParticipantIds.push({ id, name });
  }

  renderParticipantStudentIds();
  updatePermissionPreview();
}

function removeParticipantStudentId(id) {
  selectedParticipantIds = selectedParticipantIds.filter(x => x.id !== id);

  renderParticipantStudentIds();
  updatePermissionPreview();
}

function renderParticipantStudentIds() {
  const box = document.getElementById('participantStudentIds');
  if (!box) return;

  if (!selectedParticipantIds.length) {
    box.innerHTML = '<span class="tag all-tag">ยังไม่ได้ระบุรายบุคคล</span>';
    return;
  }

  box.innerHTML = selectedParticipantIds.map(s => `
    <span class="tag">
      ${s.id}${s.name ? ' ' + s.name : ''}
      <button type="button" onclick="removeParticipantStudentId('${s.id}')">×</button>
    </span>
  `).join('');
}

function selectedParticipantStudentIds() {
  return selectedParticipantIds.length
    ? selectedParticipantIds.map(s => s.id).join(',')
    : 'ทั้งหมด';
}

function setParticipantStudentIds(csv) {
  const value = String(csv || 'ทั้งหมด').trim();

  selectedParticipantIds = value === 'ทั้งหมด'
    ? []
    : value.split(',').map(id => ({ id: id.trim(), name: '' })).filter(x => x.id);

  renderParticipantStudentIds();
  updatePermissionPreview();
}

/* ---------- PERMISSION PREVIEW ---------- */

function requiredMultiSelectDisplay(selectId) {
  const select = document.getElementById(selectId);

  if (!select) return '-';

  const values = [...select.selectedOptions].map(o => o.text);

  return values.length ? values.join(', ') : 'ยังไม่ได้เลือก';
}

function participantStudentDisplay() {
  if (!selectedParticipantIds.length) {
    return 'ทุกคนที่ผ่านเงื่อนไขชั้นปี / คณะ / สาขา';
  }

  return selectedParticipantIds
    .map(x => `${x.id} ${x.name || ''}`)
    .join('<br>');
}

function updatePermissionPreview() {
  const previewYears = document.getElementById('previewYears');
  const previewFaculties = document.getElementById('previewFaculties');
  const previewMajors = document.getElementById('previewMajors');
  const previewStudents = document.getElementById('previewStudents');

  if (!previewYears || !previewFaculties || !previewMajors || !previewStudents) return;

  previewYears.innerHTML = `
    <div class="preview-item">
      <b>ชั้นปี :</b> ${selectedYears() || 'ทุกชั้นปี'}
    </div>
  `;

  previewFaculties.innerHTML = `
    <div class="preview-item">
      <b>คณะ :</b> ${requiredMultiSelectDisplay('allowedFaculties')}
    </div>
  `;

  previewMajors.innerHTML = `
    <div class="preview-item">
      <b>สาขา :</b> ${requiredMultiSelectDisplay('allowedMajors')}
    </div>
  `;

  previewStudents.innerHTML = `
    <div class="preview-item">
      <b>นักศึกษาเฉพาะราย :</b><br>
      ${participantStudentDisplay()}
    </div>
  `;
}

/* ---------- ADMIN EVENTS ---------- */

async function saveEvent() {
  try {
    const data = {
      eventId: val('eventId'),
      title: val('title'),
      description: val('description'),
      eventDate: val('eventDate'),
      startTime: val('startTime'),
      endTime: val('endTime'),
      capacity: val('capacity'),
      checkinStart: val('checkinStart'),
      checkinEnd: val('checkinEnd'),
      checkoutStart: val('checkoutStart'),
      checkoutEnd: val('checkoutEnd'),
      activityType: val('activityType'),
      location: val('location'),
      checkinMapLink: val('checkinMapLink'),
      checkoutMapLink: val('checkoutMapLink'),
      publishDate: val('publishDate'),
      level: val('level'),
      allowedYears: selectedYears() || 'ทุกชั้นปี',
      allowedFaculties: requiredMultiSelect('allowedFaculties', 'คณะ'),
      allowedMajors: requiredMultiSelect('allowedMajors', 'สาขา'),
      allowedStudentIds: selectedParticipantStudentIds()
    };

    const r = await api('saveEvent', {
      ...adminPayload(),
      data
    });

    alert(r.message);

    clearEventForm();
    loadAdminEvents();

  } catch (err) {
    alert(err.message);
  }
}

async function loadAdminEvents() {
  const data = await api('getEvents');
  allEvents = data.events || [];

  if (!allEvents.length) {
    document.getElementById('adminEventList').innerHTML = '<p class="small">ยังไม่มีกิจกรรม</p>';
    return;
  }

  document.getElementById('adminEventList').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>กิจกรรม</th>
            <th>วันที่</th>
            <th>เวลา</th>
            <th>จอง</th>
            <th>พิกัด</th>
            <th>ผู้มีสิทธิ์เข้าร่วม</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${allEvents.map(e => `
            <tr>
              <td>
                <b>${e.title}</b><br>
                <span class="badge">${e.level || '-'}</span>
                <span class="badge">${e.activityType || '-'}</span>
              </td>
              <td>${e.eventDate || '-'}</td>
              <td>${e.startTime || '-'} - ${e.endTime || '-'}</td>
              <td>
                จอง ${e.booked || 0}/${e.capacity || 0}<br>
                IN ${e.checkedIn || 0} / OUT ${e.completed || 0}
              </td>
              <td>
                IN: ${e.checkinLat || '-'}, ${e.checkinLng || '-'}<br>
                OUT: ${e.checkoutLat || '-'}, ${e.checkoutLng || '-'}
              </td>
              <td>
                ชั้นปี: ${e.allowedYears || 'ทุกชั้นปี'}<br>
                คณะ: ${e.allowedFaculties || 'ทั้งหมด'}<br>
                สาขา: ${e.allowedMajors || 'ทั้งหมด'}<br>
                รหัสเฉพาะ: ${e.allowedStudentIds && e.allowedStudentIds !== 'ทั้งหมด'
                  ? e.allowedStudentIds.split(',').length + ' คน'
                  : 'ไม่ระบุ'}
              </td>
              <td>
                <button class="btn-light" onclick='editEvent(${JSON.stringify(e)})'>แก้ไข</button>
                <button class="btn-light" onclick="copyEvent('${e.eventId}')">คัดลอก</button>
                <button class="btn-red" onclick="deleteEvent('${e.eventId}')">ลบ</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function editEvent(e) {
  Object.keys(e).forEach(k => {
    const el = document.getElementById(k);
    if (el) el.value = e[k] || '';
  });

  document.querySelectorAll('.year-btn').forEach(btn => btn.classList.remove('active'));

  String(e.allowedYears || 'ทุกชั้นปี').split(',').forEach(y => {
    const btn = document.querySelector(`.year-btn[data-year="${y}"]`);
    if (btn) btn.classList.add('active');
  });

  if (!document.querySelectorAll('.year-btn.active').length) {
    document.querySelector('.year-btn[data-year="ทุกชั้นปี"]').classList.add('active');
  }

  setSelectValues('allowedFaculties', e.allowedFaculties || 'ทั้งหมด');
  setSelectValues('allowedMajors', e.allowedMajors || 'ทั้งหมด');
  setParticipantStudentIds(e.allowedStudentIds || 'ทั้งหมด');

  updatePermissionPreview();

  window.scrollTo({
    top: document.getElementById('adminEventsPage').offsetTop,
    behavior: 'smooth'
  });
}

async function copyEvent(eventId) {
  try {
    const r = await api('copyEvent', {
      ...adminPayload(),
      eventId
    });

    alert(r.message);
    loadAdminEvents();

  } catch (err) {
    alert(err.message);
  }
}

async function deleteEvent(eventId) {
  if (!confirm('ยืนยันการลบกิจกรรมนี้?')) return;

  try {
    const r = await api('deleteEvent', {
      ...adminPayload(),
      eventId
    });

    alert(r.message);
    loadAdminEvents();

  } catch (err) {
    alert(err.message);
  }
}

function clearEventForm() {
  document.querySelectorAll('#adminEventsPage input, #adminEventsPage textarea')
    .forEach(el => el.value = '');

  document.getElementById('activityType').value = 'online';
  document.getElementById('level').value = 'มหาวิทยาลัย';

  document.querySelectorAll('.year-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector('.year-btn[data-year="ทุกชั้นปี"]').classList.add('active');

  setSelectValues('allowedFaculties', 'ทั้งหมด');
  setSelectValues('allowedMajors', 'ทั้งหมด');
  setParticipantStudentIds('ทั้งหมด');

  updatePermissionPreview();
}

/* ---------- ADMIN STUDENTS ---------- */

async function saveStudent() {
  try {
    const data = {
      studentId: val('studentId'),
      fullName: val('fullName'),
      major: val('major'),
      faculty: val('faculty'),
      birthDate: val('birthDate'),
      phone: val('phone')
    };

    const r = await api('saveStudent', {
      ...adminPayload(),
      data
    });

    alert(r.message);

    clearStudentForm();
    loadStudents();
    loadFilterOptions();

  } catch (err) {
    alert(err.message);
  }
}

async function loadStudents() {
  try {
    const r = await api('searchStudents', {
      ...adminPayload(),
      keyword: val('studentSearch')
    });

    const students = r.students || [];

    if (!students.length) {
      document.getElementById('studentList').innerHTML = '<p class="small">ไม่พบข้อมูล</p>';
      return;
    }

    document.getElementById('studentList').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ชื่อ-สกุล</th>
              <th>คณะ</th>
              <th>สาขา</th>
              <th>ชั้นปี</th>
              <th>เบอร์โทร</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${students.map(s => `
              <tr>
                <td>${s.studentId || ''}</td>
                <td>${s.fullName || ''}</td>
                <td>${s.faculty || ''}</td>
                <td>${s.major || ''}</td>
                <td>${s.yearLevel || ''}</td>
                <td>${s.phone || ''}</td>
                <td>
                  <button class="btn-light" onclick='editStudent(${JSON.stringify(s)})'>แก้ไข</button>
                  <button class="btn-red" onclick="removeStudent('${s.studentId}')">ลบ</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

  } catch (err) {
    alert(err.message);
  }
}

function editStudent(s) {
  document.getElementById('studentId').value = s.studentId || '';
  document.getElementById('fullName').value = s.fullName || '';
  document.getElementById('major').value = s.major || '';
  document.getElementById('faculty').value = s.faculty || '';
  document.getElementById('birthDate').value = s.birthDate || '';
  document.getElementById('phone').value = s.phone || '';
}

async function removeStudent(studentId) {
  if (!confirm('ยืนยันการลบนักศึกษารหัส ' + studentId + ' ?')) return;

  try {
    const r = await api('deleteStudent', {
      ...adminPayload(),
      studentId
    });

    alert(r.message);
    loadStudents();

  } catch (err) {
    alert(err.message);
  }
}

function clearStudentForm() {
  ['studentId', 'fullName', 'major', 'faculty', 'birthDate', 'phone']
    .forEach(id => document.getElementById(id).value = '');
}

/* ---------- STUDENT EVENTS ---------- */

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function eventDateTime(event, timeKey = 'endTime') {
  return new Date(`${event.eventDate}T${event[timeKey] || '23:59'}:00`);
}

function isPastEvent(event) {
  return eventDateTime(event, 'endTime') < new Date();
}

function sortEventsAsc(a, b) {
  return new Date(`${a.eventDate}T${a.startTime || '00:00'}:00`) -
    new Date(`${b.eventDate}T${b.startTime || '00:00'}:00`);
}

async function loadStudentEvents() {
  const r = await api('getEvents', {
    studentId: currentStudent.studentId
  });

  const today = todayISO();

  const visibleEvents = (r.events || [])
    .filter(e => e.visible)
    .filter(e => !isPastEvent(e))
    .sort(sortEventsAsc);

  const todayEvents = visibleEvents.filter(e => e.eventDate === today);
  const upcomingEvents = visibleEvents.filter(e => e.eventDate > today);

  document.getElementById('todayEvents').innerHTML = todayEvents.length
    ? todayEvents.map(e => eventCard(e, 'today')).join('')
    : '<div class="empty-state">วันนี้ยังไม่มีกิจกรรมที่เปิดให้จอง</div>';

  document.getElementById('upcomingEvents').innerHTML = upcomingEvents.length
    ? upcomingEvents.map(e => eventCard(e, 'upcoming')).join('')
    : '<div class="empty-state">ยังไม่มีกิจกรรมที่กำลังจะมาถึง</div>';
}

function eventCard(e, groupClass = 'upcoming') {
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

/* ---------- BOOKING ---------- */

function openBooking(eventId) {
  document.getElementById('bookingEventId').value = eventId;
  document.getElementById('bookingPhone').value = currentStudent.phone || '';
  document.getElementById('bookingBirthDate').value = '';
  show('bookingModal');
}

function closeBookingModal() {
  hide('bookingModal');
}

async function confirmBooking() {
  try {
    const r = await api('bookEvent', {
      eventId: val('bookingEventId'),
      studentId: currentStudent.studentId,
      phone: val('bookingPhone'),
      birthDate: val('bookingBirthDate')
    });

    alert(r.message);

    closeBookingModal();
    refreshActive();

  } catch (err) {
    alert(err.message);
  }
}

async function loadMyBookings() {
  const r = await api('getMyBookings', {
    studentId: currentStudent.studentId
  });

  const bookings = r.bookings || [];

  const activeBookings = bookings
    .filter(b => b.status !== 'completed' && !b.checkoutAt)
    .sort((a, b) => sortEventsAsc(a.event || {}, b.event || {}));

  const completedBookings = bookings
    .filter(b => b.status === 'completed' || b.checkoutAt)
    .sort((a, b) => sortEventsAsc(b.event || {}, a.event || {}));

  document.getElementById('myBookings').innerHTML = activeBookings.length
    ? activeBookings.map(bookingCard).join('')
    : '<div class="empty-state">ยังไม่มีกิจกรรมที่จอง หรือกิจกรรมที่จองทั้งหมดเข้าร่วมครบแล้ว</div>';

  document.getElementById('completedActivities').innerHTML = completedBookings.length
    ? completedBookings.map(completedCard).join('')
    : '<div class="empty-state">ยังไม่มีกิจกรรมที่เข้าร่วมแล้ว</div>';
}

function bookingCard(b) {
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

function completedCard(b) {
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

/* ---------- CAMERA / LOCATION ---------- */

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('อุปกรณ์นี้ไม่รองรับ Location'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      }),
      () => reject(new Error('กรุณาอนุญาต Location')),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

async function openCameraForPhoto(title) {
  capturedImage = null;

  document.getElementById('cameraTitle').innerText = title;
  document.getElementById('photoPreview').classList.add('hidden');
  document.getElementById('usePhotoBtn').classList.add('hidden');
  document.getElementById('video').classList.remove('hidden');

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    document.getElementById('video').srcObject = currentStream;
    show('cameraModal');

    return new Promise((resolve, reject) => {
      photoResolver = { resolve, reject };
    });

  } catch (err) {
    throw new Error('กรุณาอนุญาตให้ใช้กล้องก่อน Check-in / Check-out');
  }
}

function closeCameraModal() {
  hide('cameraModal');

  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  if (photoResolver) {
    photoResolver.reject(new Error('ยกเลิกการถ่ายภาพ'));
    photoResolver = null;
  }
}

function capturePhoto() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');

  if (!video.videoWidth) {
    alert('กล้องยังไม่พร้อม กรุณารอสักครู่');
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  capturedImage = canvas.toDataURL('image/jpeg', 0.75);

  document.getElementById('photoPreview').src = capturedImage;
  document.getElementById('photoPreview').classList.remove('hidden');
  document.getElementById('usePhotoBtn').classList.remove('hidden');
  document.getElementById('video').classList.add('hidden');
}

function useCapturedPhoto() {
  if (!capturedImage) {
    alert('กรุณาถ่ายภาพก่อน');
    return;
  }

  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  hide('cameraModal');

  if (photoResolver) {
    photoResolver.resolve(capturedImage);
    photoResolver = null;
  }
}

async function doCheckIn(eventId) {
  try {
    const loc = await getLocation();
    const photo = await openCameraForPhoto('ถ่ายภาพยืนยัน Check-in');

    const r = await api('checkIn', {
      eventId,
      studentId: currentStudent.studentId,
      lat: loc.lat,
      lng: loc.lng,
      photoBase64: photo
    });

    alert(r.message);
    refreshActive();

  } catch (err) {
    alert(err.message);
  }
}

async function doCheckOut(eventId) {
  try {
    const loc = await getLocation();
    const photo = await openCameraForPhoto('ถ่ายภาพยืนยัน Check-out');

    const r = await api('checkOut', {
      eventId,
      studentId: currentStudent.studentId,
      lat: loc.lat,
      lng: loc.lng,
      photoBase64: photo
    });

    alert(r.message);
    refreshActive();

  } catch (err) {
    alert(err.message);
  }
}

/* ---------- REPORT ---------- */

async function loadReportEvents(keep = true) {
  const old = val('reportEvent');

  const r = await api('getEvents');
  const events = r.events || [];

  document.getElementById('reportEvent').innerHTML =
    events.map(e => `<option value="${e.eventId}">${e.title}</option>`).join('');

  if (keep && old) {
    document.getElementById('reportEvent').value = old;
  }
}

async function loadReport() {
  const eventId = val('reportEvent');

  if (!eventId) {
    document.getElementById('reportTable').innerHTML = '<p class="small">ยังไม่มีกิจกรรม</p>';
    latestReportRows = [];
    return;
  }

  const r = await api('getEventReport', {
    ...adminPayload(),
    eventId
  });

  const rows = r.rows || [];
  latestReportRows = rows;

  document.getElementById('reportTable').innerHTML = rows.length
    ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ชื่อ</th>
              <th>สถานะ</th>
              <th>Check-in</th>
              <th>รูป Check-in</th>
              <th>Check-out</th>
              <th>รูป Check-out</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(x => `
              <tr>
                <td>${x.studentId || ''}</td>
                <td>${x.fullName || ''}</td>
                <td>${x.status || '-'}</td>
                <td>
                  ${x.checkinAt || '-'}<br>
                  ${x.checkinDistance ? x.checkinDistance + ' ม.' : ''}
                </td>
                <td>${photoHtml(x.checkinPhotoUrl, 'รูป Check-in : ' + (x.fullName || x.studentId))}</td>
                <td>
                  ${x.checkoutAt || '-'}<br>
                  ${x.checkoutDistance ? x.checkoutDistance + ' ม.' : ''}
                </td>
                <td>${photoHtml(x.checkoutPhotoUrl, 'รูป Check-out : ' + (x.fullName || x.studentId))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : '<p class="small">ยังไม่มีผู้จอง</p>';
}

function drivePreviewUrl(url) {
  if (!url) return '';

  const m = String(url).match(/\/d\/([^/]+)/) || String(url).match(/[?&]id=([^&]+)/);

  if (m && m[1]) {
    return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  }

  return url;
}

function photoHtml(url, title) {
  if (!url) return '-';

  const img = drivePreviewUrl(url);

  return `
    <div class="photo-cell">
      <img class="report-photo" src="${img}" onclick="openPhotoModal('${img}', '${title}')" alt="${title}">
      <a class="photo-link" href="${url}" target="_blank">เปิดต้นฉบับ</a>
    </div>
  `;
}

function openPhotoModal(url, title) {
  document.getElementById('photoModalTitle').innerText = title || 'ตรวจสอบรูปภาพ';
  document.getElementById('photoModalImg').src = url;
  show('photoModal');
}

function closePhotoModal() {
  hide('photoModal');
  document.getElementById('photoModalImg').src = '';
}

function exportReportExcel() {
  if (!latestReportRows.length) {
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
    { wch: 8 }, { wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 26 },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 16 },
    { wch: 16 }, { wch: 18 }, { wch: 45 }, { wch: 20 }, { wch: 16 },
    { wch: 16 }, { wch: 18 }, { wch: 45 }, { wch: 20 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'รายงาน');

  const safeTitle = eventTitle.replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
  const fileName = `รายงาน_${safeTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  XLSX.writeFile(wb, fileName);
}
