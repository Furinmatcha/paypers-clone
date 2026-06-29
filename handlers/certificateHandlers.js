const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLibDoc } = require('pdf-lib');
const bahttext = require('bahttext');
const path = require('path');

const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธนวาคม'];

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
    const description = data.description || data.subCategory || 'ค่าใช้จ่ายตามสลิป';

    // ชื่อเรื่องกลางหน้า
    doc.font(fontBoldPath).fontSize(20)
      .text('ใบรับรองแทนใบเสร็จรับเงิน', { align: 'center' });
    doc.moveDown(1.5);

    // ข้อมูลร้าน
    const infoY = doc.y;
    doc.font(fontPath).fontSize(12);
    doc.text('ผู้ซือ/ผู้รับบริการ: ฟริน มัทฉะ', 60, infoY);
    doc.text('ที่อยู่: 4/21 หมู่ 2 ติดอาคารซูเหลียน ตำบล เนนพระ อำเภอเมือง ระยอง 21000', 60, infoY + 20);
    doc.text('เลขประจำตัวผู้เสียภาษี: 1219900781992', 60, infoY + 40);
    doc.text('โทร: 0946824466', 60, infoY + 60);

    // วันที่ชิดขวา
    doc.text(`วันที่: ${thaiDate}`, 60, infoY + 85, { align: 'right', width: 475 });

    const tableTop = infoY + 110;

    // ขนาดคอลัมน์
    const col1x = 60;
    const col2x = 105;
    const col3x = 375;
    const col4x = 470;
    const tableRight = 535;
    const rowH = 26;

    // Header ตาราง
    doc.lineWidth(0.5);
    doc.rect(col1x, tableTop, tableRight - col1x, rowH).stroke();
    doc.moveTo(col2x, tableTop).lineTo(col2x, tableTop + rowH).stroke();
    doc.moveTo(col3x, tableTop).lineTo(col3x, tableTop + rowH).stroke();
    doc.moveTo(col4x, tableTop).lineTo(col4x, tableTop + rowH).stroke();

    doc.font(fontBoldPath).fontSize(12);
    doc.text('ลำดับ', col1x, tableTop + 6, { width: col2x - col1x, align: 'center' });
    doc.text('รายละเอียด', col2x, tableTop + 6, { width: col3x - col2x, align: 'center' });
    doc.text('จำนวนเงิน (บาท)', col3x, tableTop + 6, { width: col4x - col3x, align: 'center' });
    doc.text('หมายเหตุ', col4x, tableTop + 6, { width: tableRight - col4x, align: 'center' });

    // แถวข้อมูล
    const row1Y = tableTop + rowH;
    doc.rect(col1x, row1Y, tableRight - col1x, rowH).stroke();
    doc.moveTo(col2x, row1Y).lineTo(col2x, row1Y + rowH).stroke();
    doc.moveTo(col3x, row1Y).lineTo(col3x, row1Y + rowH).stroke();
    doc.moveTo(col4x, row1Y).lineTo(col4x, row1Y + rowH).stroke();

    doc.font(fontPath).fontSize(12);
    doc.text('1', col1x, row1Y + 6, { width: col2x - col1x, align: 'center' });
    doc.text(description, col2x + 5, row1Y + 6, { width: col3x - col2x - 10 });
    doc.text(formattedAmount, col3x, row1Y + 6, { width: col4x - col3x - 5, align: 'right' });

    // แถวรวมทังสิ้น
    const row2Y = row1Y + rowH;
    doc.rect(col1x, row2Y, tableRight - col1x, rowH).stroke();
    doc.moveTo(col3x, row2Y).lineTo(col3x, row2Y + rowH).stroke();
    doc.moveTo(col4x, row2Y).lineTo(col4x, row2Y + rowH).stroke();

    doc.font(fontBoldPath).fontSize(12);
    doc.text('รวมทั้งสิ้น', col2x, row2Y + 6, { width: col3x - col2x - 5, align: 'right' });
    doc.text(formattedAmount, col3x, row2Y + 6, { width: col4x - col3x - 5, align: 'right' });

    // ส่วนล่างตาราง
    const belowTable = row2Y + rowH + 18;

    doc.font(fontPath).fontSize(12);
    doc.text(`รวมทั้งสิน ( ตัวอักษร )  ${amountInWords}`, 60, belowTable);
    doc.moveDown(0.7);
    doc.text(`ข้าพเจ้า ${userLogger} (ผู้เบิกจ่าย)`);
    doc.moveDown(0.5);
doc.text(
  `ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในงานของทางร้านค้า/กิจการเจ้าของคนเดียว โดยแท้ ตั้งแต่วันที่ ${data.date} ถึงวันที่ ${data.date}`,
  60, doc.y, { width: 475, lineGap: 2, align: 'left' }
);

    // ลายเซ็น
    doc.moveDown(4);
    const signY = doc.y;
    const sign1X = 80;
    const sign2X = 330;

    doc.fontSize(12);
    doc.text('____________________________', sign1X, signY, { width: 200, align: 'center' });
    doc.text('____________________________', sign2X, signY, { width: 200, align: 'center' });

    doc.text(`(${userLogger})`, sign1X, signY + 18, { width: 200, align: 'center' });
    doc.text(`(${data.approverName || userLogger})`, sign2X, signY + 18, { width: 200, align: 'center' });

    doc.font(fontBoldPath).fontSize(12);
    doc.text('ผู้เบิกจ่าย', sign1X, signY + 36, { width: 200, align: 'center' });
    doc.text('ผู้อนุมัติ', sign2X, signY + 36, { width: 200, align: 'center' });

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
