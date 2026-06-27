const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLibDoc } = require('pdf-lib');
const bahttext = require('bahttext');
const path = require('path');

const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function parseToThaiDateStr(dateStr) {
  try {
    if (!dateStr) return '-';
    if (dateStr.includes('/')) {
      const [d, m, y] = dateStr.split('/');
      return `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${parseInt(y)}`;
    } else if (dateStr.includes('-')) {
      const [y, m, d] = dateStr.split('-');
      return `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${parseInt(y)}`;
    }
    return dateStr;
  } catch (e) { return dateStr; }
}

function buildCertificatePdf(data, txnId) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const buffers = [];
    doc.on('data', b => buffers.push(b));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const fontPath = path.join(__dirname, '../Sarabun-Regular.ttf');
    const fontBoldPath = path.join(__dirname, '../Sarabun-Bold.ttf');

    const amountNum = Number(data.amount || 0);
    const formattedAmount = amountNum.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const amountInWords = bahttext(amountNum);
    const thaiDate = parseToThaiDateStr(data.date);
    const userLogger = data.requesterName || 'Terapat Pechtumpai';
    const txnIdStr = txnId || data.txnId || '-';
    const description = data.description || data.subCategory || 'ค่าใช้จ่ายตามสลิป';

    // ชื่อเรื่องกลางหน้า
    doc.font(fontBoldPath).fontSize(26)
      .text('ใบรับรองแทนใบเสร็จรับเงิน', { align: 'center' });
    doc.moveDown(1.5);

    // ข้อมูลร้าน (ซ้าย)
    const infoY = doc.y;
    doc.font(fontPath).fontSize(14);
    doc.text('ผู้ซื้อ/ผู้รับบริการ: ฟูริน มัทฉะ', 60, infoY);
    doc.text('ที่อยู่: 4/21 หมู่ 2 ติดอาคารซูเหลียน ตำบล เนินพระ อำเภอเมือง ระยอง 21000', 60, infoY + 22);
    doc.text('เลขประจำตัวผู้เสียภาษี: 1219900781992', 60, infoY + 44);
    doc.text('โทร: 0946824466', 60, infoY + 66);

    // วันที่ (ขวา)
    doc.text(`วันที่: ${thaiDate}`, 60, infoY + 88, { align: 'right', width: 475 });

    doc.moveDown(0.5);
    const tableTop = infoY + 115;

    // ขนาดคอลัมน์
    const col1x = 60;   // ลำดับ
    const col2x = 110;  // รายละเอียด
    const col3x = 390;  // จำนวนเงิน
    const col4x = 490;  // หมายเหตุ
    const tableRight = 535;
    const rowH = 28;

    // วาดตาราง header
    const headerY = tableTop;
    doc.lineWidth(0.5);

    // เส้นกรอบ header
    doc.rect(col1x, headerY, tableRight - col1x, rowH).stroke();
    // เส้นแบ่งคอลัมน์ใน header
    doc.moveTo(col2x, headerY).lineTo(col2x, headerY + rowH).stroke();
    doc.moveTo(col3x, headerY).lineTo(col3x, headerY + rowH).stroke();
    doc.moveTo(col4x, headerY).lineTo(col4x, headerY + rowH).stroke();

    doc.font(fontBoldPath).fontSize(13);
    doc.text('ลำดับ', col1x, headerY + 7, { width: col2x - col1x, align: 'center' });
    doc.text('รายละเอียด', col2x, headerY + 7, { width: col3x - col2x, align: 'center' });
    doc.text('จำนวนเงิน (บาท)', col3x, headerY + 7, { width: col4x - col3x, align: 'center' });
    doc.text('หมายเหตุ', col4x, headerY + 7, { width: tableRight - col4x, align: 'center' });

    // แถวข้อมูล row 1
    const row1Y = headerY + rowH;
    doc.rect(col1x, row1Y, tableRight - col1x, rowH).stroke();
    doc.moveTo(col2x, row1Y).lineTo(col2x, row1Y + rowH).stroke();
    doc.moveTo(col3x, row1Y).lineTo(col3x, row1Y + rowH).stroke();
    doc.moveTo(col4x, row1Y).lineTo(col4x, row1Y + rowH).stroke();

    doc.font(fontPath).fontSize(13);
    doc.text('1', col1x, row1Y + 7, { width: col2x - col1x, align: 'center' });
    doc.text(description, col2x + 5, row1Y + 7, { width: col3x - col2x - 10 });
    doc.text(formattedAmount, col3x, row1Y + 7, { width: col4x - col3x - 5, align: 'right' });
    doc.text('', col4x + 5, row1Y + 7);

    // แถวรวมทั้งสิ้น
    const row2Y = row1Y + rowH;
    doc.rect(col1x, row2Y, tableRight - col1x, rowH).stroke();
    doc.moveTo(col3x, row2Y).lineTo(col3x, row2Y + rowH).stroke();
    doc.moveTo(col4x, row2Y).lineTo(col4x, row2Y + rowH).stroke();

    doc.font(fontBoldPath).fontSize(13);
    doc.text('รวมทั้งสิ้น', col2x, row2Y + 7, { width: col3x - col2x - 5, align: 'right' });
    doc.text(formattedAmount, col3x, row2Y + 7, { width: col4x - col3x - 5, align: 'right' });

    // ส่วนล่างตาราง
    const belowTable = row2Y + rowH + 20;

    doc.font(fontPath).fontSize(13);
    doc.text(`รวมทั้งสิ้น ( ตัวอักษร )  ${amountInWords}`, 60, belowTable);
    doc.moveDown(0.8);
    doc.text(`ข้าพเจ้า ${userLogger} (ผู้เบิกจ่าย)`);
    doc.moveDown(0.5);
    doc.text(
      `ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในงานของทาง ร้านค้า/กิจการเจ้าของคนเดียว โดยแท้ ตั้งแต่วันที่ ${data.date} ถึงวันที่ ${data.date}`,
      { width: 475, lineGap: 3 }
    );

    // ลายเซ็น
    doc.moveDown(3);
    const signY = doc.y;
    doc.text('____________________________', 100, signY, { width: 200, align: 'center' });
    doc.text('____________________________', 340, signY, { width: 200, align: 'center' });
    doc.moveDown(0.3);
    doc.text(`(${userLogger})`, 100, doc.y, { width: 200, align: 'center' });
    doc.text(`(${data.approverName || userLogger})`, 340, doc.y, { width: 200, align: 'center' });
    doc.moveDown(0.3);
    doc.font(fontBoldPath).text('ผู้เบิกจ่าย', 100, doc.y, { width: 200, align: 'center' });
    doc.text('ผู้อนุมัติ', 340, doc.y, { width: 200, align: 'center' });

    doc.end();
  });
}

async function mergeCertAndSlip(certPdfBuffer, slipImageBuffer) {
  const mergedPdf = await PDFLibDoc.create();

  const certDoc = await PDFLibDoc.load(certPdfBuffer);
  const copiedPages = await mergedPdf.copyPages(certDoc, certDoc.getPageIndices());
  copiedPages.forEach(page => mergedPdf.addPage(page));

  const page = mergedPdf.addPage([595.28, 841.89]);
  let embeddedImage;
  try {
    embeddedImage = await mergedPdf.embedPng(slipImageBuffer);
  } catch (e) {
    try {
      embeddedImage = await mergedPdf.embedJpg(slipImageBuffer);
    } catch (jpgErr) {
      console.error('Cannot embed image:', jpgErr);
      return certPdfBuffer;
    }
  }

  if (embeddedImage) {
    const { width, height } = embeddedImage.scale(0.5);
    page.drawImage(embeddedImage, {
      x: (page.getWidth() - width) / 2,
      y: (page.getHeight() - height) / 2,
      width,
      height,
    });
  }

  return Buffer.from(await mergedPdf.save());
}

module.exports = { buildCertificatePdf, mergeCertAndSlip };
