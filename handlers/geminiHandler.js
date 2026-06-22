const { GoogleGenerativeAI } = require('@google/generative-ai')

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

async function readReceipt(base64Image) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

  const prompt = `อ่านใบเสร็จในรูปนี้แล้วตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามมี markdown:
{
  "shopName": "ชื่อร้านหรือบริษัท",
  "date": "วันที่ในรูปแบบ DD/MM/YYYY ถ้าไม่มีให้ใส่วันนี้",
  "total": "ยอดรวมตัวเลขอย่างเดียว ไม่มีสัญลักษณ์",
  "items": "รายการสินค้าทั้งหมด คั่นด้วยจุลภาค",
  "vat": "ภาษีมูลค่าเพิ่มตัวเลขอย่างเดียว ถ้าไม่มีใส่ 0",
  "category": "หมวดหมู่ที่เหมาะสมที่สุด จากตัวเลือก: อาหาร, เครื่องดื่ม, ขนส่ง, อุปกรณ์สำนักงาน, สาธารณูปโภค, อื่นๆ"
}`

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
  ])

  const text = result.response.text().replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(text)
  } catch {
    return {
      shopName: 'ไม่สามารถอ่านได้',
      date: new Date().toLocaleDateString('th-TH'),
      total: '0',
      items: '-',
      vat: '0',
      category: 'อื่นๆ'
    }
  }
}

module.exports = { readReceipt }
