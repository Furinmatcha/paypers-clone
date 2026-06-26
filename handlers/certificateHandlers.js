const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLibDoc } = require('pdf-lib');
const path = require('path');

// ฟังก์ชันแปลงวันที่ภายในไฟล์ PDF ให้เสถียร (รองรับทั้ง 2026-06-05 และ 05/06/2026)
function parseToThaiDateStr(dateStr) {
  try {
    if (!dateStr) return '-';
    let parts = [];
    if (dateStr.includes('/')) {
      parts = dateStr.split('/'); // DD/MM/YYYY
      const day = parseInt(parts[0]);
      const monthIdx = parseInt(parts[1]) - 1;
      const year = parseInt(parts[2]) + 543;
      const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
      return `${day} ${months[monthIdx]} ${year}`;
    } else if (dateStr.includes('-')) {
      parts = dateStr.split('-'); // YYYY-MM-DD
      const day = parseInt(parts[2]);
      const monthIdx = parseInt(parts[1]) - 1;
      const year = parseInt(parts[0]) + 543;
      const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
      return `${day} ${months[monthIdx]} ${year}`;
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

// เฟส 3: ฟังก์ชันสร้างใบรับรองแทนใบเสร็จรับเงิน
function buildCertificatePdf(data, txnId) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    // โหลดฟอนต์ภาษาไทยจากโฟลเดอร์ fonts
    const fontPath = path.join(__dirname, '../fonts/THSarabunNew.ttf');
    const fontBoldPath = path.join(__dirname, '../fonts/THSarabunNew_Bold.ttf');

    const thaiDateFormatted = parseToThaiDateStr(data.date);

    // --- ส่วนหัวเอกสาร (Header) ---
    doc.font(fontBoldPath).size(14).text('ผู้ซื้อ/ผู้รับบริการ: ฟูริน มัทฉะ', 40, 40);
    doc.moveDown(0.5);
    doc.font(fontBoldPath).size(22).text('ใบรับรองแทนใบเสร็จรับเงิน', { align: 'center' });
    doc.moveDown(0.5);

    const startY = doc.y;
    doc.font(fontPath).size(14);
    doc.text('ที่อยู่: 4/21 หมู่ 2 ติดอาคารซูเหลียน ตำบล เนินพระ อำเภอเมือง ระยอง 21000', 40, startY, { width: 320 });
    doc.text('เลขประจำตัวผู้เสียภาษี: 1219900781992', 40, startY + 18);
    doc.text('โทร: 0946824466', 40, startY + 36);

    doc.text(`วันที่: ${data.thaiDateText || thaiDateFormatted}`, 380, startY, { align: 'right', width: 175 });
    doc.text(`เลขที่เอกสาร: ${txnId}`, 380, startY + 18, { align: 'right', width: 175 });

    const tableTop = startY + 70;

    // --- ส่วนตารางรายการ (Table) ---
    doc.lineWidth(1).moveTo(40, tableTop).lineTo(555, tableTop).stroke();
    
    doc.font(fontBoldPath).size(13);
    doc.text('ลำดับ', 45, tableTop + 6);
    doc.text('รายละเอียด', 90, tableTop + 6);
    doc.text('จำนวนเงิน (บาท)', 380, tableTop + 6, { width: 90, align: 'right' });
    doc.text('หมายเหตุ', 490, tableTop + 6);
    
    doc.lineWidth(1).moveTo(40, tableTop + 24).lineTo(555, tableTop + 24).stroke();

    doc.font(fontPath).size(13);
    doc.text('1', 45, tableTop + 32);
    doc.text(`${data.description || data.subCategory || 'ค่าใช้จ่ายตามสลิป'}`, 90, tableTop + 32, { width: 280 });
    
    const formattedAmount = Number(data.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.text(`${formattedAmount}`, 380, tableTop + 32, { width: 90, align: 'right' });
    doc.text('-', 490, tableTop + 32);

    const tableBottom = tableTop + 60;
    doc.lineWidth(1).moveTo(40, tableBottom).lineTo(555, tableBottom).stroke();

    doc.font(fontBoldPath).text('รวมทั้งสิ้น', 90, tableBottom + 6);
    doc.text(`${formattedAmount}`, 380, tableBottom + 6, { width: 90, align: 'right' });
    
    doc.lineWidth(1).moveTo(40, tableBottom + 24).lineTo(555, tableBottom + 24).stroke();

    // จำนวนเงินตัวอักษรและรายละเอียดคำรับรอง
    const noteY = tableBottom + 35;
    doc.font(fontBoldPath).size(13).text(`รวมทั้งสิ้น (ตัวอักษร)   ${data.amountCharText || '-'}`, 45, noteY);
    
    const userLogger = data.requesterName || 'Terapat Pechtumpai';
    doc.font(fontPath).size(13).text(`ข้าพเจ้า  ${userLogger}  (ผู้เบิกจ่าย)`, 45, noteY + 25);
    
    // 🌟 ปรับปรุงการพิมพ์ข้อความยาวแบบยืดหยุ่น ย้ายพิกัดลงล็อกและใช้กล่องครอบข้อความแบบจำกัดขอบเขตอัตโนมัติ
    const longText = `ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในงานของทาง ร้านค้า/กิจการเจ้าของคนเดียว โดยแท้ ตั้งแต่วันที่ ${thaiDateFormatted} ถึงวันที่ ${thaiDateFormatted}`;
    doc.text(longText, 45, noteY + 45, { width: 510, lineGap: 2 });

    // --- ส่วนคำรับรองและลายเซ็นด้านล่าง (Footer Signatures) ---
    const signY = noteY + 115;
    
    doc.text(`(............................................................)`, 60, signY, { width: 200, align: 'center' });
    doc.text(`( ${userLogger} )`, 60, signY + 18, { width: 200, align: 'center' });
    doc.text('ผู้เบิกจ่าย', 60, signY + 34, { width: 200, align: 'center' });

    doc.text(`(............................................................)`, 335, signY, { width: 200, align: 'center' });
    doc.text(`( ${data.approverName || userLogger} )`, 335, signY + 18, { width: 200, align: 'center' });
    doc.text('ผู้อนุมัติ', 335, signY + 34, { width: 200, align: 'center' });

    doc.end();
  });
}

// ฟังก์ชันรวมเล่ม PDF คู่กับสลิปแบบดั้งเดิม (คงเดิมไว้)
async function mergeCertAndSlip(certPdfBuffer, slipImageBuffer) {
  const mergedPdf = await PDFLibDoc.create();

  const certDoc = await PDFLibDoc.load(certPdfBuffer);
  const copiedPages = await mergedPdf.copyPages(certDoc, certDoc.getPageIndices());
  copiedPages.forEach((page) => mergedPdf.addPage(page));

  const page = mergedPdf.addPage([595.28, 841.89]); 
  
  let embeddedImage;
  try {
    embeddedImage = await mergedPdf.embedPng(slipImageBuffer);
  } catch (e) {
    try {
      embeddedImage = await mergedPdf.embedJpg(slipImageBuffer);
    } catch (jpgErr) {
      console.error('Cannot embed image to PDF:', jpgErr);
      return certPdfBuffer; 
    }
  }

  if (embeddedImage) {
    const { width, height } = embeddedImage.scale(0.5);
    page.drawImage(embeddedImage, {
      x: (page.getWidth() - width) / 2,
      y: (page.getHeight() - height) / 2,
      width,
      height
    });
  }

  const mergedPdfBytes = await mergedPdf.save();
  return Buffer.from(mergedPdfBytes);
}

module.exports = { buildCertificatePdf, mergeCertAndSlip };
