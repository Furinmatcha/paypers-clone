const { google } = require('googleapis');

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

const HEADERS = [
  'วันที่', 'Transaction ID', 'ประเภทเอกสาร', 'สถานะการจ่ายเงิน',
  'รายละเอียด', 'จำนวน', 'ราคาต่อหน่วย', 'ยอดรวมก่อนภาษี',
  'ส่วนลด', 'ภาษีหัก ณ ที่จ่าย', 'ยอดสุทธิ', 'ประเภทค่าใช้จ่าย',
  'หมวดหมู่', 'หมวดหมู่ย่อย', 'ผู้ขาย/ผู้ให้บริการ', 'เลขผู้เสียภาษี',
  'สาขา', 'ลิงก์หลักฐาน', 'หมายเหตุ'
];

const THAI_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];

function getThaiMonth(dateStr) {
  try {
    const month = parseInt(dateStr.split('/')[1], 10);
    return THAI_MONTHS[month - 1] || 'อื่นๆ';
  } catch {
    return 'อื่นๆ';
  }
}

async function ensureMonthSheet(monthName) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets.some(s => s.properties.title === monthName);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: monthName } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${monthName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS] },
    });
  }
}

async function appendExpense(d) {
  const monthName = getThaiMonth(d.date);
  await ensureMonthSheet(monthName);

  const amount = Number(d.amount) || 0;

  const row = [
    d.date || '',
    d.txnId || '',
    'ใบรับรองแทนใบเสร็จ',
    'จ่ายแลว',
    d.description || '',
    1,
    amount,
    amount,
    0,
    0,
    amount,
    d.expenseType || '',
    d.category || '',
    d.subCategory || '',
    d.payee || '',
    d.taxId || '',
    '',
    d.evidenceLink || '',
    '',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${monthName}'!A:S`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  return monthName;
}

module.exports = { appendExpense };
