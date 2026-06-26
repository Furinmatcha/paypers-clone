const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLibDoc } = require('pdf-lib');
const path = require('path');

// เฟส 3: ฟังก์ชันสร้างใบรับรองแทนใบเสร็จรับเงิน ตามโครงสร้างตัวอย่างใหม่
function buildCertificatePdf(data, txnId) {
  return new Promise((resolve, reject) => {
    // กำหนดขนาดหน้า A4 ระยะขอบ 40 รอบด้านเพื่อให้มีพื้นที่วางข้อมูลตารางพอดี
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    // โหลดฟอนต์ภาษาไทยจากโฟลเดอร์ fonts
    const fontPath = path.join(__dirname, '../fonts/THSarabunNew.ttf');
    const fontBoldPath = path.join(__dirname, '../fonts/THSarabunNew_Bold.ttf');

    // --- ส่วนหัวเอกสาร (Header) ---
    doc.font(fontBoldPath).size(14).text('ผู้ซื้อ/ผู้รับบริการ: ฟูริน มัทฉะ', { align: 'left' });
    doc.moveDown(0.5);
    doc.font(fontBoldPath).size(22).text('ใบรับรองแทนใบเสร็จรับเงิน', { align: 'center' });
    doc.moveDown(0.5);

    // รายละเอียดข้อมูลร้านฝั่งซ้าย และข้อมูลวันที่ฝั่งขวา
    const startY = doc.y;
    doc.font(fontPath).size(14);
    doc.text('ที่อยู่: 4/21 หมู่ 2 ติดอาคารซูเหลียน ตำบล เนินพระ อำเภอเมือง ระยอง 21000');
    doc.text('เลขประจำตัวผู้เสียภาษี: 1219900781992');
    doc.text('โทร: 0946824466');

    // วางวันที่และข้อมูลเลขที่เอกสารทางด้านขวาให้ขนานกัน
    doc.text(`วันที่: ${data.thaiDateText || data.date}`, 380, startY, { align: 'right', width: 175 });
    doc.text(`เลขที่เอกสาร: ${txnId}`, 380, startY + 16, { align: 'right', width: 175 });

    doc.moveDown(2);
    // ปรับพิกัดแกน X กลับมาที่ตำแหน่งเริ่มต้นปกติ (40)
    const currentY = doc.y;
    doc.x = 40; 

    // --- ส่วนตารางรายการ (Table) ---
    // วาดเส้นหัวตาราง
    doc.lineWidth(1).moveTo(40, currentY).lineTo(555, currentY).stroke();
    doc.font(fontBoldPath).size(13);
    doc.text('ลำดับ', 45, currentY + 6);
    doc.text('รายละเอียด', 90, currentY + 6);
    doc.text('จำนวนเงิน (บาท)', 380, currentY + 6, { width: 90, align: 'right' });
    doc.text('หมายเหตุ', 490, currentY + 6);
    
    // วาดเส้นใต้หัวตาราง
    doc.moveTo(40, currentY + 24).lineTo(555, currentY + 24).stroke();

    // รายการข้อมูลค่าใช้จ่าย
    doc.font(fontPath).size(13);
    doc.text('1', 45, currentY + 32);
    doc.text(`${data.description || data.subCategory || 'ค่าใช้จ่ายตามสลิป'}`, 90, currentY + 32, { width: 280 });
    doc.text(`${Number(data.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 380, currentY + 32, { width: 90, align: 'right' });
    doc.text('-', 490, currentY + 32);

    // วาดเส้นปิดท้ายตารางรายการ
    doc.moveTo(40, currentY + 60).lineTo(555, currentY + 60).stroke();

    // แสดงยอดรวมสุทธิ
    doc.font(fontBoldPath).text('รวมทั้งสิ้น', 90, currentY + 66);
    doc.text(`${Number(data.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 380, currentY + 66, { width: 90, align: 'right' });
    
    // วาดเส้นปิดยอดรวมสัดส่วนท้ายตาราง
    doc.moveTo(40, currentY + 84).lineTo(555, currentY + 84).stroke();
    doc.moveDown(1.5);

    // จำนวนเงินตัวอักษร
    doc.font(fontBoldPath).size(13).text(`รวมทั้งสิ้น (ตัวอักษร)   ${data.amountCharText || '-'}`, 45);
    doc.moveDown(1.5);

    // --- ส่วนคำรับรองและลายเซ็นด้านล่าง (Footer Signatures) ---
    const userLogger = data.requesterName || 'Terapat Pechtumpai';
    doc.font(fontPath).size(13).text(`ข้าพเจ้า  ${userLogger}  (ผู้เบิกจ่าย)`, 45);
    doc.moveDown(0.5);
    doc.text(`ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในงานของทาง`);
    doc.text(`ร้านค้า/กิจการเจ้าของคนเดียว โดยแท้ ตั้งแต่วันที่ ${data.date} ถึงวันที่ ${data.date}`);
    doc.moveDown(3);

    // จุดเซ็นชื่อฝั่งซ้าย (ผู้เบิกจ่าย) และฝั่งขวา (ผู้อนุมัติ)
    const signY = doc.y;
    doc.text(`(............................................................)`, 60, signY, { width: 200, align: 'center' });
    doc.text(`( ${userLogger} )`, 60, signY + 16, { width: 200, align: 'center' });
    doc.text('ผู้เบิกจ่าย', 60, signY + 32, { width: 200, align: 'center' });

    doc.text(`(............................................................)`, 335, signY, { width: 200, align: 'center' });
    doc.text(`( ${data.approverName || userLogger} )`, 335, signY + 16, { width: 200, align: 'center' });
    doc.text('ผู้อนุมัติ', 335, signY + 32, { width: 200, align: 'center' });

    doc.end();
  });
}

// เฟส 4: ฟังก์ชันรวมเล่ม PDF คู่กับสลิปแบบดั้งเดิม (คงไว้ตามเดิม)
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
