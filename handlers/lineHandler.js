const { readReceipt } = require('./geminiHandler');
const { buildFolderPath, uploadToDrive } = require('./driveHandler');
const { buildCertificatePdf, mergeCertAndSlip } = require('./certificateHandlers');
const { appendExpense } = require('./sheetsHandler');
const https = require('https');

async function downloadImage(messageId, client) {
  const stream = await client.getMessageContent(messageId)
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', chunk => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

async function handleEvent(event, client) {
  const userId = event.source.userId;

  if (event.type === 'message' && event.message.type === 'image') {
    try {
      const response = await fetch(
        `https://api-data.line.me/v2/bot/message/${event.message.id}/content`,
        { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` } }
      );
      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '🔄 กำลังประมวลผล รอสักครู่...' }]
      });

      // 1. อ่านสลิป
      const d = await readReceipt(imageBuffer);
      d.txnId = 'TXN' + Date.now().toString(36);

      // 2. สร้างโฟลเดอร์
      const { txnFolderId, accountingRoot } = await buildFolderPath(d.date, d.payee, d.txnId);

      // 3. อัปสลิป
      const slipName = `${d.date.replaceAll('/','-')}_${d.payee}_${d.txnId}.jpg`;
      d.evidenceLink = await uploadToDrive(imageBuffer, slipName, txnFolderId);

      // 4. สร้างใบรับรอง PDF
      const certPdf = await buildCertificatePdf(d);
      await uploadToDrive(certPdf, `ใบรับรอง_${d.txnId}.pdf`, txnFolderId, 'application/pdf');

      // 5. รวม PDF
      const mergedPdf = await mergeCertAndSlip(certPdf, imageBuffer);
      await uploadToDrive(mergedPdf, `${slipName.replace('.jpg','')}_รวม.pdf`, accountingRoot, 'application/pdf');

      // 6. บันทึก Sheet
      const month = await appendExpense(d);

      // 7. ตอบกลับ
      await client.pushMessage({
        to: userId,
        messages: [{
          type: 'text',
          text: `✅ บันทึกครบแล้ว (${month})\n🏪 ${d.payee}\n📅 ${d.date}\n💰 ${Number(d.amount).toLocaleString()}฿\n🏷️ ${d.category}`
        }]
      });

    } catch (err) {
      console.error('Image error:', err);
      await client.pushMessage({
        to: userId,
        messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่' }]
      });
    }

  } else if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '📸 ส่งรูปสลิปมาได้เลย แล้วฉันจะบันทึกให้!' }]
    });
  }
}

module.exports = { handleEvent };
