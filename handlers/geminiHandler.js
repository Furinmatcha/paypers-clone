const { GoogleGenerativeAI } = require('@google/generative-ai');
const Jimp = require('jimp');
const jsQR = require('jsqr');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
 apiVersion: 'v1'
});

function fixYear(dateStr) {
 if (!dateStr) return dateStr;
 const parts = dateStr.split('/');
 if (parts.length !== 3) return dateStr;

 let year = parseInt(parts[2]);

 if (year < 100) {
   year = year + 1957; // 69 → 2026
 } else if (year > 2400) {
   year = year - 543; // 2569 → 2026
 }

 parts[2] = year.toString();
 return parts.join('/');
}

async function decodeQR(imageBuffer) {
 try {
   const image = await Jimp.read(imageBuffer);
   const { data, width, height } = image.bitmap;
   const code = jsQR(data, width, height);
   if (!code) return null;

   const text = code.data;
   const amountMatch = text.match(/54(\d{2})(\d+\.?\d*)/);
   if (amountMatch) {
     return parseFloat(amountMatch[2]);
   }
   return null;
 } catch (err) {
   console.error('QR decode error:', err);
   return null;
 }
}

async function readReceipt(imageBuffer) {
 const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

 const prompt = `
คุณคือผู้ช่วยอ่านสลิป/ใบเสร็จของร้านกาแฟ "ฟูริน มัทฉะ"
อ่านรูปแล้วตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามมี markdown หรือ backtick

รูปแบบ JSON:
{
 "date": "DD/MM/YYYY",
 "payee": "ชื่อผู้รับเงิน (ช่องไปที่ หรือชื่อร้าน)",
 "description": "สรุปสั้นๆ ว่าจ่ายค่าอะไร",
 "amount": 0,
 "taxId": "",
 "expenseType": "",
 "category": "",
 "subCategory": ""
}

กฎสำคัญ:
- วันที่: ตอบเป็น ค.ศ. เท่านั้น ในรูปแบบ DD/MM/YYYY
- ถ้าเห็นปี 2 หลัก เช่น 69 = ค.ศ. 2026, 68 = ค.ศ. 2025
- ถ้าเห็นปี พ.ศ. เช่น 2569 = ค.ศ. 2026 (ลบ 543)
- amount: ตัวเลขล้วน ห้ามมีคอมม่า เช่น 38,000.00 = 38000
- category: เลือกจาก: วัตถุดิบ, ค่าเช่า, อุปกรณ์, ค่าจ้าง, การตลาด, ค่าน้ำค่าไฟ, อื่นๆ
- subCategory: หมวดย่อย เช่น ผงมัทฉะ, นม, แก้ว, ค่าเช่าร้าน ฯลฯ
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

 // แก้ปีทุกครั้ง
 data.date = fixYear(data.date);

 // decode QR แล้ว override amount ถ้าได้
 const qrAmount = await decodeQR(imageBuffer);
 if (qrAmount !== null) {
   console.log(`QR amount: ${qrAmount} (Gemini: ${data.amount})`);
   data.amount = qrAmount;
 }

 return data;
}

module.exports = { readReceipt };
