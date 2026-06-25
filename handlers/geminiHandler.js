const { GoogleGenerativeAI } = require('@google/generative-ai');
const Jimp = require('jimp');
const jsQR = require('jsqr');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
  apiVersion: 'v1'
});

// 1. เพิ่มฟังก์ชันหน่วงเวลาสำหรับ Backoff
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fixYear(dateStr) {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;

  let year = parseInt(parts[2]);

  if (year > 2400) {
    year = year - 543;
  } else if (year < 100) {
    year = year + 1957;
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
    if (!code) return null;

    const text = code.data;
    const amountMatch = text.match(/54\d{2}(\d+\.?\d*)/);
    if (amountMatch) {
      return parseFloat(amountMatch[1]);
    }
    return null;
  } catch (err) {
    console.error('QR decode error:', err);
    return null;
  }
}

async function readReceipt(imageBuffer) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const prompt = `คุณคือผู้ช่วยอ่านสลิป/ใบเสร็จของร้านกาแฟ "ชูใจ มิตรภาพ"
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
- วันที่: ตอบเป็น ค.ศ. เท่านั้น DD/MM/YYYY
- ปี 2 หลัก: 69 = 2026, 68 = 2025, 67 = 2024
- พ.ศ.: 2569 = 2026, 2568 = 2025 (ลบ 543)
- amount: ตัวเลขล้วน ไม่มีคอมม่า เช่น 38,000.00 = 38000
- category: วัตถุดิบ, ค่าเช่า, อุปกรณ์, ค่าช่าง, การตลาด, ค่าน้ำค่าไฟ, อื่นๆ
- subCategory: หมวดย่อย เช่น ผงมัทฉะ, นม, แก้ว, ค่าบริการ
- expenseType: "ต้นทุนขาย" หรือ "ค่าใช้จ่ายดำเนินงาน"
- ช่องไหนอ่านไม่ได้ ให้ใส่ "" หรือ 0`;

  // 2. จัดการบีบอัดรูปภาพฝั่ง Client ก่อนส่ง (แทนที่บรรทัด 80-84 เดิม)
  const image = await Jimp.read(imageBuffer);
  if (image.getWidth() > 1024 || image.getHeight() > 1024) {
    image.scaleToFit(1024, 1024); // ย่อขนาดลงมาให้ด้านยาวสุดไม่เกิน 1024px
  }
  const compressedBuffer = await image.quality(80).getBufferAsync(Jimp.MIME_JPEG); // บีบอัด Quality 80%

  const imagePart = {
    inlineData: {
      data: compressedBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    },
  };

    // 3. ระบบ Exponential Backoff ดักจับทั้ง 429 (High Demand) และ 503 (Service Unavailable)
  let result;
  let retries = 0;
  const maxRetries = 5;

  while (retries < maxRetries) {
    try {
      result = await model.generateContent([prompt, imagePart]);
      break; // ยิงสำเร็จให้หลุดลูปทันที
    } catch (error) {
      retries++;
      
      // ดึงสถานะ Error ออกมาตรวจจับ
      const status = error.status || error.statusCode;
      const errorMessage = error.message || '';
      
      // เช็กว่าเป็น 429, 503 หรือข้อความตระกูล High Demand / Service Unavailable หรือไม่
      const isRateLimitOrUnavailable = 
        status === 429 || 
        status === 503 || 
        errorMessage.includes('429') || 
        errorMessage.includes('503') || 
        errorMessage.includes('ResourceExhausted') || 
        errorMessage.includes('Service Unavailable');

      if (isRateLimitOrUnavailable) {
        if (retries >= maxRetries) throw error; // ถ้าพยายามจนครบกำหนดแล้วยังไม่รอด ให้โยน error ออกไป
        
        // สูตรเพิ่มเวลาหยุดรอแบบทวีคูณ (2^attempt) + random_jitter ป้องกันการยิงชนกัน
        const waitTime = Math.pow(2, retries) * 1000 + Math.random() * 1000;
        console.warn(`[Gemini API] เจอ Error ${status || 'High Demand'} กำลังลองใหม่ครั้งที่ ${retries}/${maxRetries} ในอีก ${(waitTime/1000).toFixed(2)} วินาที...`);
        await sleep(waitTime);
      } else {
        throw error; // ถ้าเป็น Error อื่นๆ เช่น สิทธิ์ใช้งานไม่ผ่าน (401/403) ให้พ่นออกไปเลย ไม่ต้องรีไทร์
      }
    }
  }


  const response = result.response;

  let raw = response.text();
  raw = raw.replace(/```json|```/g, '').trim();
  const data = JSON.parse(raw);

  data.date = fixYear(data.date);

  const qrAmount = await decodeQR(imageBuffer);
  if (qrAmount !== null) {
    console.log(`QR amount: ${qrAmount} (Gemini: ${data.amount})`);
    data.amount = qrAmount;
  }

  return data;
}

module.exports = { readReceipt };
