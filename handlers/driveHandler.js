const { google } = require('googleapis');
const { Readable } = require('stream');

// ยึดการใช้สิทธิ์ผ่าน GOOGLE_CREDENTIALS (Service Account) ตัวเดียวกับ Sheets
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
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  
  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
    // 🌟 ใส่ตรงนี้เพื่อบังคับให้ค้นหาในแชร์ไดรฟ์/โฟลเดอร์ที่แชร์มาได้ทั้งหมด
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
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
    fields: 'id',
    // 🌟 ใส่เพื่อให้ Service Account มีสิทธิ์สร้างกิ่งก้านโฟลเดอร์ลงไปได้
    supportsAllDrives: true
  });

  return folder.data.id;
}

async function buildFolderPath(dateStr, payee, txnId) {
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
    fields: 'id, webViewLink',
    // 🌟 จุดสำคัญที่สุด: ใส่เพื่อให้มันไปกินพื้นที่โควตา (Storage) ของโฟลเดอร์ปลายทางที่เป็นของคุณ แทนการกินพื้นที่ของตัวเอง
    supportsAllDrives: true
  });

  // ปรับสิทธิ์ให้เปิดดูไฟล์ได้ผ่านลิงก์
  await drive.permissions.create({
    fileId: res.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    },
    supportsAllDrives: true
  });

  return res.data.webViewLink;
}

module.exports = { buildFolderPath, uploadToDrive };
