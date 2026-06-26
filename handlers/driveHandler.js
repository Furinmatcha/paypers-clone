const { google } = require('googleapis');
const { Readable } = require('stream');

// ใช้สิทธิ์ผ่าน GOOGLE_CREDENTIALS (Service Account) ตัวเดียวกับ Sheets
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

// ฟังก์ชันภายในสำหรับค้นหาหรือสร้างโฟลเดอร์
async function findOrCreateFolder(name, parentId) {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  
  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
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
    supportsAllDrives: true
  });

  return folder.data.id;
}

// 🛠️ ฟังก์ชันสร้างโครงสร้างโฟลเดอร์ตาม วันที่ / ร้านค้า / เลขแทร็กกิ้ง
async function buildFolderPath(dateStr, payee, txnId) {
  let day, month, year;
  
  if (dateStr && dateStr.includes('/')) {
    const parts = dateStr.split('/');
    day = parts[0];
    month = parts[1];
    year = parts[2];
  } else if (dateStr && dateStr.includes('-')) {
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

  // ปรับเลขเดือนให้อยู่ในรูปแบบ "06. มิถุนายน"
  const monthFolder = `${String(month).padStart(2, '0')}. ${THAI_MONTHS[parseInt(month) - 1]}`;
  const txnFolderName = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}_${payee}_${txnId}`;

  const ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID;
  
  const yearId = await findOrCreateFolder(year, ROOT);
  const monthId = await findOrCreateFolder(monthFolder, yearId);
  const evidenceRoot = await findOrCreateFolder('รวมหลักฐาน', monthId);
  const accountingRoot = await findOrCreateFolder('สำหรับสำนักงานบัญชี', monthId);
  const txnFolderId = await findOrCreateFolder(txnFolderName, evidenceRoot);

  return { txnFolderId, accountingRoot };
}

// 🛠️ ฟังก์ชันอัปโหลดไฟล์ และตั้งสิทธิ์ให้อ่านได้ผ่านลิงก์
// 🛠️ ฟังก์ชันอัปโหลดไฟล์
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
    supportsAllDrives: true
  });

  return res.data.webViewLink;
}

// Export ออกไปให้ไฟล์อื่นเรียกใช้ได้ตรง ๆ
module.exports = { buildFolderPath, uploadToDrive };


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

// Export ออกไปให้ไฟล์อื่นเรียกใช้ได้ตรง ๆ
module.exports = { buildFolderPath, uploadToDrive };
