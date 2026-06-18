# ระบบจองกิจกรรมและ Check-in / Check-out

ระบบ Web Application สำหรับจองเข้าร่วมกิจกรรม และบันทึก Check-in / Check-out ผ่าน Google Apps Script และ Google Sheet

## ความสามารถหลัก

- Admin สร้าง แก้ไข ลบ และคัดลอกกิจกรรม
- กำหนดจำนวนผู้เข้าร่วมกิจกรรม
- กำหนดเวลา Check-in / Check-out
- กำหนดประเภทกิจกรรม online / on-site
- กรอก Google Map Link แยกจุด Check-in และ Check-out
- ระบบดึง Latitude / Longitude จาก Google Map อัตโนมัติ
- กำหนดชั้นปีที่เข้าร่วมได้แบบเลือกได้หลายชั้นปี
- นักศึกษาจองกิจกรรมได้ 1 ครั้งต่อกิจกรรม
- นักศึกษา Check-in / Check-out ได้เฉพาะกิจกรรมที่จองไว้
- ใช้กล้องและ Location ก่อน Check-in / Check-out
- รายงานสถานะการจอง Check-in และ Check-out
- Export ข้อมูลเป็น Excel / PDF

## การติดตั้ง

1. สร้าง Google Sheet
2. คัดลอก Spreadsheet ID ไปใส่ในตัวแปร `SS_ID`
3. เปิด Google Apps Script
4. เพิ่มไฟล์
   - `Code.gs`
   - `Index.html`
   - `appsscript.json`
5. Run ฟังก์ชัน `setupSheets()` 1 ครั้ง
6. Deploy เป็น Web App

## การ Deploy

เลือก

- Execute as: Me
- Who has access: Anyone

จากนั้นกด Deploy

## การใช้งาน

นักศึกษาเข้าสู่ระบบด้วย

- Username: รหัสนักศึกษา 8 หลัก
- Password: วันเดือนปีเกิด 8 หลัก

## หมายเหตุสำหรับ GitHub

GitHub ใช้สำหรับเก็บ Source Code เท่านั้น  
ระบบจริงต้อง Deploy ผ่าน Google Apps Script เพราะมีการใช้ `google.script.run`
