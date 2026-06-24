const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
  apiVersion: 'v1'
});


async function readReceipt(imageBuffer) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const prompt = `
คุณคือผู้ช่วยอานสลิป/ใบเสร็จของร้านกาแฟ "ฟูริน มทฉะ"
อ่านรปแล้วตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามมี markdown หรือ backtick

รูปแบบ JSON:
{
  "date": "DD/MM/YYYY",
  "payee": "ชื่อผู้รับเงิน (ช่องไปที่ หรือชื่อร้าน)",
  "description": "สรุปสั้นๆ ว่าจ่ายคาอะไร",
  "amount": 0,
  "taxId": "",
  "expenseType": "",
  "category": "",
  "subCategory": ""
}

กฎสำคัญ:
- วันที่: ถ้าเป็น พ.ศ. (ปี > 2500) ใหลบ 543 เป็น ค.ศ. เช่น 05 มิ.ย. 69 = 05/06/2026
- amount: เป็นตัวเลขล้วน ห้ามมีคอมม่า ห้ามมีหน่วย เช่น 38,000.00 = 38000
- category: เลือกจาก: วัตถุดิบ, คาเช่า, อุปกรณ์, ค่าจาง, การตลาด, ค่าน้ำค่าไฟ, อนๆ
- subCategory: หมวดย่อย เชน ผงมัทฉะ, นม, แก้ว, ค่าเช่าร้าน ฯลฯ
- expenseType: "ต้นทุนขาย" หรือ "ค่าใช้จ่ายดำเนินงาน"
- ช่องไหนอ่านไม่ได้ ใส่ "" หรือ 0
`;

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const response = result.response;

  let raw = response.text();
  raw = raw.replace(/```json|```/g, '').trim();
  const data = JSON.parse(raw);
  return data;
}

module.exports = { readReceipt };
