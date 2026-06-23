import { google } from 'googleapis';

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

// หัวตาราง 19 คอลัมน์ (ต้องตรงลำดับกับ row ด้านล่าง)
const HEADERS = [
  'วันที่', 'Transaction ID', 'ประเภทเอกสาร', 'สถานะการจ่ายเงิน',
  'รายละเอียด', 'จำนวน', 'ราคาต่อหน่วย', 'ยอดรวมก่อนภาษี',
  'ส่วนลด', 'ภาษีหัก ณ ที่จ่าย', 'ยอดสุทธิ', 'ประเภทค่าใช้จ่าย',
  'หมวดหมู่', 'หมวดหมู่ย่อย', 'ผู้ขาย/ผู้ให้บริการ', 'เลขผู้เสียภาษี',
  'สาขา', 'ลิงก์หลักฐาน', 'หมายเหตุ'
];

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// แปลงวันที่ DD/MM/YYYY -> ชื่อเดือนไทย
function getThaiMonth(dateStr) {
  try {
    const month = parseInt(dateStr.split('/')[1], 10); // เลขเดือน
    return THAI_MONTHS[month - 1] || 'อื่นๆ';
  } catch {
    return 'อื่นๆ';
  }
}

// สร้างแท็บเดือนถ้ายังไม่มี + ใส่หัวตาราง
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
    // ใส่หัวตารางแถวแรก
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${monthName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS] },
    });
  }
}

/**
 * บันทึกรายจ่าย 1 รายการลงแท็บเดือนที่ตรงกับวันที่
 * @param {Object} d ข้อมูลจาก Gemini + ลิงก์หลักฐาน
 */
export async function appendExpense(d) {
  const monthName = getThaiMonth(d.date);
  await ensureMonthSheet(monthName);

  const amount = Number(d.amount) || 0;

  const row = [
    d.date || '',                 // A วันที่
    d.txnId || '',                // B Transaction ID
    'ใบรับรองแทนใบเสร็จ',          // C ประเภทเอกสาร (default)
    'จ่ายแล้ว',                    // D สถานะ
    d.description || '',          // E รายละเอียด
    1,                            // F จำนวน
    amount,                       // G ราคาต่อหน่วย
    amount,                       // H ยอดรวมก่อนภาษี
    0,                            // I ส่วนลด
    0,                            // J หัก ณ ที่จ่าย
    amount,                       // K ยอดสุทธิ
    d.expenseType || '',          // L ประเภทค่าใช้จ่าย
    d.category || '',             // M หมวดหมู่
    d.subCategory || '',          // N หมวดหมู่ย่อย
    d.payee || '',                // O ผู้ขาย
    d.taxId || '',                // P เลขผู้เสียภาษี
    '',                           // Q สาขา
    d.evidenceLink || '',         // R ลิงก์หลักฐาน
    '',                           // S หมายเหตุ
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${monthName}'!A:S`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  return monthName;
}
