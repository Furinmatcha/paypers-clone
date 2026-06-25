const { readReceipt } = require('./geminiHandler');
const { buildFolderPath, uploadToDrive } = require('./driveHandler');
const { buildCertificatePdf, mergeCertAndSlip } = require('./certificateHandlers');
const { appendExpense } = require('./sheetsHandler');

// เก็บ state การแก้ไขชั่วคราว
const pendingEdits = {};

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

      const d = await readReceipt(imageBuffer);
      d.txnId = 'TXN' + Date.now().toString(36);
      d.imageBuffer = imageBuffer;

      // เก็บ state รอ confirm
      pendingEdits[userId] = { d, step: 'confirm' };

      await client.pushMessage({
        to: userId,
        messages: [{
          type: 'text',
          text: `📋 ตรวจสอบข้อมูล\n🏪 ${d.payee}\n📅 ${d.date}\n💰 ${Number(d.amount).toLocaleString()}฿\n📝 ${d.description}\n🏷️ ${d.category}\n\nถูกต้องไหม?`,
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '✅ บันทึกเลย', text: 'confirm_save' } },
              { type: 'action', action: { type: 'message', label: '✏️ แก้ไข', text: 'edit_receipt' } },
            ]
          }
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
    const state = pendingEdits[userId];

    // ยืนยันบันทึก
    if (text === 'confirm_save' && state) {
      try {
        const d = state.d;
        const imageBuffer = d.imageBuffer;
        delete d.imageBuffer;

        const { txnFolderId, accountingRoot } = await buildFolderPath(d.date, d.payee, d.txnId);
        const slipName = `${d.date.replaceAll('/','-')}_${d.payee}_${d.txnId}.jpg`;
        d.evidenceLink = await uploadToDrive(imageBuffer, slipName, txnFolderId);
        const certPdf = await buildCertificatePdf(d);
        await uploadToDrive(certPdf, `ใบรับรอง_${d.txnId}.pdf`, txnFolderId, 'application/pdf');
        const mergedPdf = await mergeCertAndSlip(certPdf, imageBuffer);
        await uploadToDrive(mergedPdf, `${slipName.replace('.jpg','')}_รวม.pdf`, accountingRoot, 'application/pdf');
        const month = await appendExpense(d);

        delete pendingEdits[userId];

        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: `✅ บันทึกครบแล้ว (${month})\n🏪 ${d.payee}\n📅 ${d.date}\n💰 ${Number(d.amount).toLocaleString()}฿` }]
        });
      } catch (err) {
        console.error('Save error:', err);
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '❌ บันทึกไม่สำเร็จ กรุณาลองใหม่' }]
        });
      }

    // เลือกแก้ไข
    } else if (text === 'edit_receipt' && state) {
      pendingEdits[userId].step = 'choosing_field';
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: 'แก้ไขอะไร?',
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '📅 วันที่', text: 'edit_date' } },
              { type: 'action', action: { type: 'message', label: '💰 จำนวนเงิน', text: 'edit_amount' } },
              { type: 'action', action: { type: 'message', label: '🏪 ผู้รับเงิน', text: 'edit_payee' } },
              { type: 'action', action: { type: 'message', label: '📝 รายละเอียด', text: 'edit_description' } },
              { type: 'action', action: { type: 'message', label: '🏷️ ประเภท', text: 'edit_category' } },
            ]
          }
        }]
      });

    // เลือก field ที่จะแก้
    } else if (['edit_date','edit_amount','edit_payee','edit_description','edit_category'].includes(text) && state) {
      const fieldMap = {
        edit_date: { field: 'date', label: 'วันที่ (DD/MM/YYYY)' },
        edit_amount: { field: 'amount', label: 'จำนวนเงิน (ตัวเลขล้วน)' },
        edit_payee: { field: 'payee', label: 'ชื่อผู้รับเงิน' },
        edit_description: { field: 'description', label: 'รายละเอียด' },
        edit_category: { field: 'category', label: 'ประเภท (วัตถุดิบ/ค่าเช่า/อุปกรณ์/ค่าจ้าง/การตลาด/ค่าน้ำค่าไฟ/อื่นๆ)' },
      };
      const { field, label } = fieldMap[text];
      pendingEdits[userId].step = `editing_${field}`;
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `พิมพ์ ${label} ใหม่:` }]
      });

    // รับค่าที่แก้ไข
    } else if (state && state.step && state.step.startsWith('editing_')) {
      const field = state.step.replace('editing_', '');
      if (field === 'amount') {
        pendingEdits[userId].d.amount = parseFloat(text.replace(/,/g, '')) || 0;
      } else {
        pendingEdits[userId].d[field] = text;
      }
      pendingEdits[userId].step = 'confirm';
      const d = pendingEdits[userId].d;

      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: `📋 ข้อมูลล่าสุด\n🏪 ${d.payee}\n📅 ${d.date}\n💰 ${Number(d.amount).toLocaleString()}฿\n📝 ${d.description}\n🏷️ ${d.category}`,
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '✅ บันทึกเลย', text: 'confirm_save' } },
              { type: 'action', action: { type: 'message', label: '✏️ แก้ไขเพิ่ม', text: 'edit_receipt' } },
            ]
          }
        }]
      });

    } else {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '📸 ส่งรูปสลิปมาได้เลย' }]
      });
    }
  }
}

module.exports = { handleEvent };
