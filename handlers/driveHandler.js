const { google } = require('googleapis');
const { Readable } = require('stream');

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
 credentials,
 scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

const THAI_MONTHS = [
 'มกราคม','กุมภาพันธ์','มนาคม','เมษายน','พฤษภาคม','มิถุนายน',
 'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];

async function findOrCreateFolder(name, parentId) {
 const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' `
         + `and '${parentId}' in parents and trashed=false`;

 const res = await drive.files.list({
   q,
   fields: 'files(id, name)',
   spaces: 'drive',
   supportsAllDrives: true,
   includeItemsFromAllDrives: true,
 });

 if (res.data.files.length > 0) return res.data.files[0].id;

 const folder = await drive.files.create({
   requestBody: {
     name,
     mimeType: 'application/vnd.google-apps.folder',
     parents: [parentId],
   },
   fields: 'id',
   supportsAllDrives: true,
 });
 return folder.data.id;
}

async function buildFolderPath(dateStr, payee, txnId) {
 const [day, month, year] = dateStr.split('/');
 const monthFolder = `${month.padStart(2,'0')}_${THAI_MONTHS[parseInt(month)-1]}`;
 const txnFolderName = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}_${payee}_${txnId}`;

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
   requestBody: { name: fileName, parents: [parentId] },
   media: { mimeType, body: Readable.from(buffer) },
   fields: 'id, webViewLink',
   supportsAllDrives: true,
 });
 await drive.permissions.create({
   fileId: res.data.id,
   requestBody: { role: 'reader', type: 'anyone' },
   supportsAllDrives: true,
 });
 return res.data.webViewLink;
}

module.exports = { buildFolderPath, uploadToDrive };
