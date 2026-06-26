const { GoogleGenerativeAI } = require('@google/generative-ai');
const Jimp = require('jimp');
const jsQR = require('jsqr');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fixYear(dateStr) {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;

  let year = parseInt(parts[2]);

  if (year > 2500) {
    year = year - 543;
  } else if (year < 100) {
    year = year + 2000;
  }

  const currentYear = new Date().getFullYear();
  if (year > currentYear + 1 || year < 2020) {
    year = currentYear;
  }

  parts[2] = year.toString();
  return parts.join('/');
}

async function decodeQR(imageBuffer) {
  try {
    const image = await Jimp.read(imageBuffer);
    const { data, width, height } = image.bitmap;
    const code = jsQR(data, width, height);
    if (code) return code.text;
    return null;
  } catch (err) {
    console.error('QR decode error:', err);
    return null;
  }
}

async function readReceipt(imageBuffer) {
  // ใช้โมเดลเวอร์ชันล่าสุดที่มีเสถียรภาพสูง
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const prompt = `คุณคือผู้เชี่ยวชาญ OCR สำหรับสแกนสลิปโอนเงินธนาคารไทยที่มีความแม่นยำสูงมาก
อ่านข้อความในสลิปอย่างละเอียดตัวอักษรต่อตัวอักษร แล้วตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามมี markdown หรือ backtick

รูปแบบ JSON:
{
  "date": "DD/MM/YYYY",
  "payee": "ชื่อ-นามสกุลของผู้รับเงิน",
  "description": "สรุปสั้นๆ ว่าจ่ายค่าอะไรจากสิ่งที่พบในสลิป",
  "amount": 0,
  "taxID": "",
  "expenseType": "",
  "category": "",
  "subCategory": ""
}

กฎเกณฑ์วิเคราะห์ชื่อผู้รับเงิน (payee) *สำคัญมาก*:
1. ให้หาชื่อผู้รับโอน/ผู้รับเงิน (To / Receiver) เท่านั้น ห้ามเอาชื่อผู้โอน (From / Sender) มาใส่เด็ดขาด
2. แกะตัวอักษรชื่อและนามสกุลภาษาไทยอย่างระมัดระวัง ห้ามเดาคำ ห้ามเติมหรือเปลี่ยนสระ/พยัญชนะเองเด็ดขาด เช่น ถ้าสลิปเขียนว่า "อร่ามรัตน์" ต้องสะกด "อร่ามรัตน์" ห้ามเปลี่ยนเป็น "อร่ามรักษ์" หรือเติมคำอื่นต่อท้าย
3. ให้ตัดคำนำหน้านามออกเสมอ (เช่น นาย, นาง, น.ส., นางสาว, Miss, Mr.) ให้เหลือเฉพาะ ชื่อ และ นามสกุล เท่านั้น (เช่น "ปวีณา อร่ามรัตน์")
4. หากเป็นชื่อบริษัท หรือร้านค้า ให้ใช้ชื่อเต็มตามที่ปรากฏบนสลิป

กฎการจัดข้อมูลและเลือกหมวดหมู่:
- วันที่ (date): ตอบเป็น ค.ศ. เท่านั้นในรูปแบบ DD/MM/YYYY (เช่น 25 มิ.ย. 69 หรือ 25 Jun 2026 ให้แปลงเป็น 25/06/2026)
- amount: ตัวเลขทศนิยมยอดรวมค่าสินค้า เช่น ยอด 38,000.00 ให้ตอบเป็น 38000
- category: เลือกหมวดหมู่ที่เหมาะสมที่สุด เช่น สินค้า, ค่าเช่า, อุปกรณ์, ค่าเดินทาง, ค่าน้ำค่าไฟ, อื่นๆ
- subCategory: ระบุหมวดหมู่ย่อยที่สอดคล้อง เช่น แม่บ้าน, รถ, ดอกไม้, บริการ, ค่าใช้จ่ายเบ็ดเตล็ด
- expenseType: ระบุเป็น "ต้นทุนผลิต" หรือ "ค่าใช้จ่ายดำเนินงาน"
- ช่องไหนไม่มีข้อมูล หรืออ่านไม่ได้ ให้ใส่เป็น "" หรือ 0`;

  const image = await Jimp.read(imageBuffer);
  if (image.bitmap.width > 1024 || image.bitmap.height > 1024) {
    image.scaleToFit(1024, 1024);
  }
  const compressedBuffer = await image.quality(80).getBufferAsync(Jimp.MIME_JPEG);

  const imagePart = {
    inlineData: {
      data: compressedBuffer.toString('base64'),
      mimeType: 'image/jpeg'
    }
  };

  let result;
  let retries = 0;
  const maxRetries = 5;

  while (retries < maxRetries) {
    try {
      result = await model.generateContent([prompt, imagePart]);
      break;
    } catch (error) {
      retries++;
      const status = error.status || error.statusCode;
      const errorMessage = error.message || '';

      const isRateLimitOrUnavailable =
        status === 429 ||
        status === 503 ||
        errorMessage.includes('429') ||
        errorMessage.includes('503') ||
        errorMessage.includes('ResourceExhausted') ||
        errorMessage.includes('Service Unavailable');

      if (isRateLimitOrUnavailable) {
        if (retries === maxRetries) throw error;
        const waitTime = Math.pow(2, retries) * 1000 + Math.random() * 1000;
        console.warn(`[Gemini API] Error ${status} | Retry ${retries}/${maxRetries} หลังจากรอ ${waitTime}ms`);
        await sleep(waitTime);
      } else {
        throw error;
      }
    }
  }

  const response = result.response;
  let raw = response.text();
  raw = raw.replace(/```json|```/g, '').trim();
  const data = JSON.parse(raw);

  data.date = fixYear(data.date);

  const qrAmount = await decodeQR(imageBuffer);
  if (qrAmount) {
    console.log(`[QR Match] ตรวจสอบยอดจาก Mini QR Code: ${qrAmount} THB (ยึดตามค่านี้แทน AI)`);
    data.amount = qrAmount;
  }

  return data;
}

module.exports = { readReceipt };
