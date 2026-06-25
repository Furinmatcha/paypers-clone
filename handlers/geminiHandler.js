const { GoogleGenerativeAI } = require('@google/generative-ai');
const Jimp = require('jimp');
const jsQR = require('jsqr');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
  apiVersion: 'v1'
});

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

// ฟังก์ชันสแกน Mini QR Code บนสลิป (อัปเดตใหม่ให้แม่นยำและเสถียรกว่าเดิม)
async function decodeQR(imageBuffer) {
  try {
    const image = await Jimp.read(imageBuffer);
    const { data, width, height } = image.bitmap;
    const code = jsQR(data, width, height);
    if (!code) return null;

    const text = code.data;
    
    // ปรับปรุง Regex ใหม่เป็นระดับสากล ดักจับข้อมูลยอดเงิน (Tag 54) ของสลิปธนาคารไทยได้ครอบคลุมทุกค่าย
    const amountMatch = text.match(/54\d{2}([0-9]+(\.[0-9]{2})?)/);
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

  const prompt = `คุณคือผู้ช่วยระบบ OCR สำหรับสแกนสลิปโอนเงินธนาคารไทยที่มีความแม่นยำสูง
อ่านรูปภาพสลิปแล้วสกัดข้อมูลเพื่อตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามมี markdown หรือ backtick

รูปแบบ JSON:
{
  "date": "DD/MM/YYYY",
  "payee": "ชื่อ-นามสกุลของผู้รับเงิน",
  "description": "สรุปสั้นๆ ว่าจ่ายค่าอะไรจากบันทึกช่วยจำ",
  "amount": 0,
  "taxId": "",
  "expenseType": "",
  "category": "",
  "subCategory": ""
}

กฎเหล็กวิเคราะห์ชื่อผู้รับเงิน (payee):
1. โครงสร้างสลิปไทยส่วนใหญ่จะเรียงลำดับจากบนลงล่าง: [ข้อมูลผู้โอน (จาก/Sender)] จะอยู่ด้านบน และ [ข้อมูลผู้รับเงิน (ไปยัง/Receiver)] จะอยู่ด้านล่างถัดมาเสมอ
2. ให้ระบุชื่อบุคคลหรือชื่อร้านค้าของ "ผู้รับเงิน" ที่อยู่ฝั่งปลายทาง (มักอยู่ถัดลงมาจากรูปลูกศร หรืออยู่ใต้ชื่อผู้โอน) มาใส่ในช่อง "payee"
3. *** ข้อห้ามเด็ดขาด: ห้ามหยิบชื่อธนาคารต้นทางหรือปลายทาง เช่น "Bangkok Bank", "ธนาคารกรุงเทพ", "K+", "Krungthai", "ttb", "SCB", "ธนาคารออมสิน" หรือคำว่า "พร้อมเพย์" มาตอบในช่อง payee เด็ดขาด! ช่องนี้ต้องการชื่อคนหรือชื่อบัญชีร้านค้าเท่านั้น ***

กฎการจัดฟอร์แมตข้อมูลอื่นๆ:
- วันที่ (date): ตอบเป็น ค.ศ. เท่านั้นในรูปแบบ DD/MM/YYYY (เช่น 25 มิ.ย. 69 หรือ 25 มิ.ย. 2569 ให้แปลงปีเป็น 2026)
- amount: ตัวเลขล้วน ไม่มีเครื่องหมายคอมม่าคั่น เช่น 20,000.00 ให้ตอบเป็น 20000
- category: เลือกหมวดหมู่จากกลุ่มนี้เท่านั้น: วัตถุดิบ, ค่าเช่า, อุปกรณ์, ค่าช่าง, การตลาด, ค่าน้ำค่าไฟ, อื่นๆ
- subCategory: ระบุหมวดย่อยที่สอดคล้อง เช่น ผงมัทฉะ, นม, แก้ว, ค่าบริการ
- expenseType: ระบุเป็น "ต้นทุนขาย" หรือ "ค่าใช้จ่ายดำเนินงาน"
- ช่องไหนที่ไม่มีข้อมูล หรืออ่านไม่ได้ ให้ใส่เป็น "" หรือ 0`;

  // ทำการย่อขนาดและบีบอัดรูปภาพก่อนส่งเข้า API เพื่อความรวดเร็วและประหยัด bandwidth
  const image = await Jimp.read(imageBuffer);
  if (image.getWidth() > 1024 || image.getHeight() > 1024) {
    image.scaleToFit(1024, 1024);
  }
  const compressedBuffer = await image.quality(80).getBufferAsync(Jimp.MIME_JPEG);

  const imagePart = {
    inlineData: {
      data: compressedBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    },
  };

  let result;
  let retries = 0;
  const maxRetries = 5;

  // ลูปกลไก Retry แบบ Exponential Backoff เพื่อจัดการกับปัญหา Error 429 และ 503 ล่วงหน้า
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
        if (retries >= maxRetries) throw error;
        const waitTime = Math.pow(2, retries) * 1000 + Math.random() * 1000;
        console.warn(`[Gemini API] Error ${status || 'Error'} ทำการรีไทร์รอบที่ ${retries}/${maxRetries} รออีก ${(waitTime/1000).toFixed(2)} วินาที...`);
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

  // ตรวจเช็กและแก้ไข Format ปี พ.ศ. / ค.ศ. ให้ถูกต้อง
  data.date = fixYear(data.date);

  // ดึงข้อมูลจำนวนเงินจาก Mini QR Code (ถ้ามีข้อมูลจาก QR จะนำมาเขียนทับยอดเงินที่ได้จาก AI ทันทีเพื่อความแม่นยำสูง)
  const qrAmount = await decodeQR(imageBuffer);
  if (qrAmount !== null) {
    console.log(`[QR Match] ตรวจพบยอดเงินจาก QR Code: ${qrAmount} THB (ยึดตามค่านี้แทน AI)`);
    data.amount = qrAmount;
  }

  return data;
}

module.exports = { readReceipt };
