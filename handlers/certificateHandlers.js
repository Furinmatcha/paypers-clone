const PDFDocument = require('pdfkit');
const bahttext = require('bahttext');
const { PDFDocument: LibPDF } = require('pdf-lib');

const SHOP = {
  name: 'ฟูริน มัทฉะ',
  address: '4/21 หมู่ 2 ติดอาคารซูเหลียน ตำบลเนินพระ อำเภอเมือง ระยอง 21000',
  taxId: '1219900781992',
  tel: '0946824466',
  issuer: 'Terapat Pechtumpai',
};

function buildCertificatePdf(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('th', './Sarabun-Regular.ttf');
    doc.registerFont('th-bold', './Sarabun-Bold.ttf');

    const amount = Number(d.amount) || 0;
    const amountStr = amount.toLocaleString('th-TH', { minimumFractionDigits: 2 });

    doc.font('th-bold').fontSize(20).text('ใบรับรองแทนใบเสร็จรับเงิน', { align: 'center' });
    doc.moveDown(1);

    doc.font('th').fontSize(12);
    doc.text(`ผู้ซื้อ/ผู้รับบริการ: ${SHOP.name}`);
    doc.text(`ที่อยู่: ${SHOP.address}`);
    doc.text(`เลขประจำตัวผู้เสียภาษี: ${SHOP.taxId}`);
    doc.text(`โทร: ${SHOP.tel}`);
    doc.text(`วันที่: ${d.date}`, { align: 'right' });
    doc.moveDown(1);

    const top = doc.y;
    const cols = [50, 100, 380, 480, 545];
    const rowH = 25;

    function cell(text, x1, x2, y, opt = {}) {
      doc.text(text, x1 + 4, y + 6, { width: x2 - x1 - 8, ...opt });
    }

    doc.rect(cols[0], top, cols[4]-cols[0], rowH).stroke();
    doc.font('th-bold').fontSize(11);
    cell('ลำดับ', cols[0], cols[1], top, { align: 'center' });
    cell('รายละเอียด', cols[1], cols[2], top);
    cell('จำนวนเงิน', cols[2], cols[3], top, { align: 'center' });
    cell('หมายเหตุ', cols[3], cols[4], top, { align: 'center' });

    const r1 = top + rowH;
    doc.rect(cols[0], r1, cols[4]-cols[0], rowH).stroke();
    doc.font('th').fontSize(11);
    cell('1', cols[0], cols[1], r1, { align: 'center' });
    cell(d.description || '-', cols[1], cols[2], r1);
    cell(amountStr, cols[2], cols[3], r1, { align: 'right' });

    const r2 = r1 + rowH;
    doc.rect(cols[0], r2, cols[4]-cols[0], rowH).stroke();
    cell('รวมทั้งสิ้น', cols[1], cols[2], r2, { align: 'right' });
    cell(amountStr, cols[2], cols[3], r2, { align: 'right' });

    doc.y = r2 + rowH + 15;
    doc.x = 50;
    doc.font('th').fontSize(12).text(`รวมทั้งสิ้น (ตัวอักษร) ${bahttext(amount)}`);
    doc.moveDown(1);
    doc.text(`ข้าพเจ้า ${SHOP.issuer} (ผู้เบิกจ่าย)`);
    doc.moveDown(1);
    doc.text(
      `ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้ ` +
      `และข้าพเจ้าได้จ่ายไปในงานของทางร้านค้า/กิจการเจ้าของคนเดียวโดยแท้ ` +
      `ตังแต่วันที่ ${d.date} ถึงวันที่ ${d.date}`
    );
    doc.moveDown(3);

    doc.text('____________________', 80, doc.y, { continued: true });
    doc.text('____________________', { align: 'right' });
    doc.text(`(${SHOP.issuer})`, 80, doc.y, { continued: true });
    doc.text(`(${SHOP.issuer})`, { align: 'right' });
    doc.text('ผู้เบิกจ่าย', 110, doc.y, { continued: true });
    doc.text('ผู้อนุมัติ', { align: 'right' });

    doc.end();
  });
}

async function mergeCertAndSlip(certPdf, slipImage) {
  const merged = await LibPDF.create();

  const certDoc = await LibPDF.load(certPdf);
  const pages = await merged.copyPages(certDoc, certDoc.getPageIndices());
  pages.forEach(p => merged.addPage(p));

  const img = await merged.embedJpg(slipImage);
  const page = merged.addPage();
  const { width, height } = page.getSize();
  const scale = Math.min(width / img.width, height / img.height) * 0.85;
  page.drawImage(img, {
    x: (width - img.width * scale) / 2,
    y: (height - img.height * scale) / 2,
    width: img.width * scale,
    height: img.height * scale,
  });

  return Buffer.from(await merged.save());
}

module.exports = { buildCertificatePdf, mergeCertAndSlip };
