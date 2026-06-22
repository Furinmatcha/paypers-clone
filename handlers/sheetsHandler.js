const { google } = require('googleapis')

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})

async function saveToSheets(receipt) {
  const client = await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth: client })

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'Sheet1!A:H',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        receipt.date,
        receipt.shopName,
        receipt.items,
        receipt.total,
        receipt.vat || 0,
        receipt.category,
        receipt.fileUrl,
        receipt.userId
      ]]
    }
  })
}

async function getSummary() {
  const client = await auth.getClient()
  const sheets = google.sheets({ version: 'v4', auth: client })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    range: 'Sheet1!A:H'
  })

  const rows = res.data.values || []
  if (rows.length <= 1) return '📭 ยังไม่มีรายจ่ายเดือนนี้'

  let total = 0
  const categories = {}

  rows.slice(1).forEach(row => {
    const amount = parseFloat(row[3]) || 0
    total += amount
    const cat = row[5] || 'อื่นๆ'
    categories[cat] = (categories[cat] || 0) + amount
  })

  const catSummary = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k}: ${v.toLocaleString('th-TH')} บาท`)
    .join('\n')

  return `📊 สรุปรายจ่ายเดือนนี้\n${'─'.repeat(20)}\n💰 ยอดรวม: ${total.toLocaleString('th-TH')} บาท\n\n📂 แยกหมวดหมู่:\n${catSummary}`
}

module.exports = { saveToSheets, getSummary }
