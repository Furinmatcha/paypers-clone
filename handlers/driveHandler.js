const { google } = require('googleapis');
const stream = require('stream');

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth });

/**
 * Helper ค้นหาโฟลเดอร์ ถ้าไม่มีให้สร้างทีละชั้น
 */
async function getOrCreateFolder(folderName, parentId = null) {
  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const res = await drive.files.list({ q: query, fields: 'files(id, name)' });
  
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) {
    fileMetadata.parents = [parentId];
  }

  const folder = await drive.files.create({
    resource: fileMetadata,
    fields: 'id'
  });
  return folder.data.id;
}

/**
 * ฟังก์ชันสร้าง Path โฟลเดอร์แยกชั้น: Root -> ปี -> เดือนภาษาไทย -> [รวมหลักฐาน / สำหรับสำนักงานบัญชี]
 */
async function builderFolderPath(dateStr, payeeName, txnId) {
  const rootId = process.env.DRIVE_ROOT_FOLDER_ID;

  // แยกวันที่จากรูปแบบ DD/MM/YYYY
  const parts = dateStr.split('/'); 
  const yearFolder = parts[2]; // "2026"
  const monthIndex = parseInt(parts[1]) - 1; // แปลงลำดับเดือน (0-11)
  
  // 🌟 อาร์เรย์ชื่อเดือนภาษาไทยแบบที่คุณต้องการ เพื่อใช้แยกโฟลเดอร์รายเดือน
  const months = [
    '01_มกราคม', '02_กุมภาพันธ์', '03_มีนาคม', '04_เมษายน', 
    '05_พฤษภาคม', '06_มิถุนายน', '07_กรกฎาคม', '08_สิงหาคม', 
    '09_กันยายน', '10_ตุลาคม', '11_พฤศจิกายน', '12_ธันวาคม'
  ];
  const monthFolder = months[monthIndex]; // ดึงค่าออกมาเป็นเช่น "06_มิถุนายน"

  // 1. ตรวจสอบ/สร้าง โฟลเดอร์ "ปี" (เช่น 2026) ภายใต้ Root
  const yearId = await getOrCreateFolder(yearFolder, rootId);
  
  // 2. ตรวจสอบ/สร้าง โฟลเดอร์ "เดือนภาษาไทย" (เช่น 06_มิถุนายน) ภายใต้โฟลเดอร์ปี
  const monthId = await getOrCreateFolder(monthFolder, yearId);

  // 3. สร้างโฟลเดอร์หลัก 2 ฝั่งแยกจากกัน ภายใต้โฟลเดอร์เดือนนั้นๆ
  const evidenceId = await getOrCreateFolder('รวมหลักฐาน', monthId);
  const accountingId = await getOrCreateFolder('สำหรับสำนักงานบัญชี', monthId);

  // 4. สร้างโฟลเดอร์เฉพาะของรายการนั้นๆ ข้างใน "รวมหลักฐาน"
  const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`; 
  const itemFolderName = `${formattedDate}_${payeeName.replace(/\s+/g, '_')}_${txnId}`;
  const itemFolderId = await getOrCreateFolder(itemFolderName, evidenceId);

  // ส่งคืน ID เพื่อนำไปใช้อัปโหลดไฟล์ลงล็อคใน lineHandler
  return { itemFolderId, accountingId, itemFolderName };
}

/**
 * ฟังก์ชันอัปโหลดไฟล์ (Buffer) ขึ้น Drive
 */
async function uploadToDrive(buffer, filename, mimeType, parentId) {
  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const fileMetadata = { 
    name: filename, 
    parents: [parentId] 
  };
  
  const media = { 
    mimeType: mimeType, 
    body: bufferStream 
  };

  const file = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, webViewLink'
  });
  
  return file.data;
}

module.exports = { builderFolderPath, uploadToDrive };
