const { google } = require('googleapis');
const { Readable } = require('stream');

// 🌟 เปลี่ยนมาใช้สิทธิ์ผ่าน GOOGLE_CREDENTIALS (Service Account) ให้เหมือนกับ Sheets เคลียร์ปัญหา Default Credentials
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

async function findOrCreateFolder(name, parentId) {
  // สร้าง Query ค้นหาโฟลเดอร์ที่ไม่ถูกลบลงถังขยะ
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  
  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id'
  });

  return folder.data.id;
}

async function buildFolderPath(dateStr, payee, txnId) {
  // รองรับรูปแบบวันที่ทั้งแบบ DD/MM/YYYY และ YYYY-MM-DD ให้ยืดหยุ่นปลอดภัย
  let day, month, year;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    day = parts[0];
    month = parts[1];
    year = parts[2];
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    day = parts[2];
    month = parts[1];
    year = parts[0];
  } else {
    // กรณีฉุกเฉินดึงวันที่ปัจจุบันมาทำงานแทนไม่ให้โค้ดพัง
    const now = new Date();
    day = String(now.getDate()).padStart(2, '0');
    month = String(now.getMonth() + 1).padStart(2, '0');
    year = String(now.getFullYear());
  }

  const monthFolder = `${month}. ${THAI_MONTHS[parseInt(month) - 1]}`;
  const txnFolderName = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}_${payee}_${txnId}`;

  const ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID;
  
  const yearId = await findOrCreateFolder(year, ROOT);
  const monthId = await findOrCreateFolder(monthFolder, yearId);
  const evidenceRoot = await findOrCreateFolder('รวมหลักฐาน', monthId);
  const accountingRoot = await findOrCreateFolder('สำหรับสำนักงานบัญชี', monthId);
  const txnFolderId = await findOrCreateFolder(txnFolderName, evidenceRoot);

  return { txnFolderId, accountingRoot };
}

async function uploadToDrive(buffer, fileName, parentId, mimeType = 'image/jpeg') {
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentId]
    },
    media: {
      mimeType: mimeType,
      body: Readable.from(buffer)
    },
    fields: 'id, webViewLink'
  });

  // ปรับสิทธิ์การเข้าถึงไฟล์ให้ทุกคนที่มีลิงก์สามารถดูได้อัตโนมัติ
  await drive.permissions.create({
    fileId: res.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    }
  });

  return res.data.webViewLink;
}

module.exports = { buildFolderPath, uploadToDrive };
