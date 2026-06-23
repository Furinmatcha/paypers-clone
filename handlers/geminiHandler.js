import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function readReceipt(imageBuffer) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `
คุณคือผู้ชวยอ่านสลิป/ใบเสร็จของร้านกาแฟ "ฟริน มัทฉะ"
อ่านรูปแล้วตอบเป็น JSON เท่านน ห้ามมีข้อความอื่น ห้ามมี markdown หรือ backtick

รูปแบบ JSON:
{
  "date": "DD/MM/YYYY",
  "payee": "ชอผู้รับเงิน (ช่องไปที หรือชื่อร้าน)",
  "description": "สรุปสันๆ ว่าจ่ายค่าอะไร",
  "amount": 0,
  "taxId": "",
  "expenseType": "",
  "category": "",
  "subCategory": ""
}

กฎสำคัญ:
- วันที่: ถ้าเป็น พ.ศ. (ปี > 2500) ให้ลบ 543 เป็น ค.ศ. เช่น 05 มิ.ย. 69 = 05/06/2026
- amount: เป็นตัวเลขล้วน ห้ามมีคอมมา ห้ามมีหน่วย เช่น 38,000.00 = 38000
- category: เลือกจาก: วัตถุดิบ, ค่าเช่า, อุปกรณ์, ค่าจาง, การตลาด, ค่าน้ำคาไฟ, อื่นๆ
- subCategory: หมวดยอย เช่น ผงมัทฉะ, นม, แก้ว, ค่าเช่าร้าน ฯลฯ
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
