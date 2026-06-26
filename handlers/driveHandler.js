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
 * 🌟 เปลี่ยนชื่อให้ตรงกับที่คุณทัก: จาก builderFolderPath เป็น createFolder
 * ทำหน้าที่สร้างโครงสร้างโฟลเดอร์แบบ Tree แยกรายเดือนภาษาไทยตามเป้าหมาย
 */
async function createFolder(dateStr, payeeName, txnId) {
  const rootId = process.env.DRIVE_ROOT_FOLDER_ID;

  const parts = dateStr.split('/'); 
  const yearFolder = parts[2]; // "2026"
  const monthIndex = parseInt(parts[1]) - 1; 
  
  const months = [
    '01_มกราคม', '02_กุมภาพันธ์', '03_มีนาคม', '04_เมษายน', 
    '05_พฤษภาคม', '06_มิถุนายน', '07_กรกฎาคม', '08_สิงหาคม', 
    '09_กันยายน', '10_ตุลาคม', '11_พฤศจิกายน', '12_ธันวาคม'
  ];
  const monthFolder = months[monthIndex]; // "06_มิถุนายน"

  // เจาะชั้นโฟลเดอร์ Year -> Month
  const yearId = await getOrCreateFolder(yearFolder, rootId);
  const monthId = await getOrCreateFolder(monthFolder, yearId);

  // สร้างโฟลเดอร์หลัก 2 ฝั่งแยกจากกัน
  const evidenceId = await getOrCreateFolder('รวมหลักฐาน', monthId);
  const accountingId = await getOrCreateFolder('สำหรับสำนักงานบัญชี', monthId);

  // สร้างโฟลเดอร์รายการย่อย
  const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`; 
  const itemFolderName = `${formattedDate}_${payeeName.replace(/\s+/g, '_')}_${txnId}`;
  const itemFolderId = await getOrCreateFolder(itemFolderName, evidenceId);

  return { itemFolderId, accountingId, itemFolderName };
}

/**
 * 🌟 เปลี่ยนชื่อให้ตรงกับที่คุณทัก: จาก uploadToDrive เป็น uploadFile
 * ยึดโครงสร้างสตรีมเดิม
 */
async function uploadFile(buffer, filename, mimeType, parentId) {
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

// คืนค่าชื่อฟังก์ชันส่งออก (Exports) ให้ตรงเป๊ะกับแบบเดิมที่คุณใช้ครับ!
module.exports = { createFolder, uploadFile };
