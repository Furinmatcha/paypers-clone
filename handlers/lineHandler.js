const { readReceipt } = require('./geminiHandler');
const { builderFolderPath, uploadToDrive } = require('./driveHandler');
const { buildCertificatePdf, mergeCertAndSlip } = require('./certificateHandlers');
const { appendExpense } = require('./sheetsHandler');

const line = require('@line/bot-sdk');
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// เก็บ state การแก้ไขชั่วคราว
const pendingEdits = {};

async function handleEvent(event) {
  if (event.type !== 'message' || !event.source || !event.source.userId) {
    return;
  }
  
  const userId = event.source.userId;

  // กรณีผู้ใช้ส่งรูปภาพสลิปเข้ามา
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
        messages: [{ type: 'text', text: '⏳ กำลังประมวลผล รอสักครู่...' }]
      });

      const d = await readReceipt(imageBuffer);
      
      // สร้าง ID บิลด้วยฟอร์แมตหลักในโค้ดของคุณ (REC-XXXXXX)
      d.receiptId = 'REC-' + Date.now().toString(36).toUpperCase();
      d.imageBuffer = imageBuffer;

      pendingEdits[userId] = { d, step: 'confirm' };

      // ส่งผลลัพธ์ในการ์ดดีไซน์ Flex Message ตรวจสอบข้อมูลสลิป (รูปที่ 19)
      await client.pushMessage({
        to: userId,
        messages: [
          {
            type: 'flex',
            altText: '🧾 ตรวจสอบข้อมูลสลิปโอนเงิน',
            contents: {
              type: 'bubble',
              size: 'mega',
              header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#27ae60',
                contents: [
                  {
                    type: 'text',
                    text: 'ตรวจสอบข้อมูลสลิป',
                    weight: 'bold',
                    color: '#ffffff',
                    size: 'lg',
                    align: 'center'
                  }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '📅 วันที่โอน:', color: '#8c8c8c', size: 'sm', flex: 2 },
                      { type: 'text', text: `${d.date}`, weight: 'bold', size: 'sm', color: '#333333', flex: 4 }
                    ]
                  },
                  { type: 'separator' },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '👤 ผู้รับเงิน:', color: '#8c8c8c', size: 'sm', flex: 2 },
                      { type: 'text', text: `${d.payee}`, weight: 'bold', size: 'sm', color: '#333333', flex: 4, wrap: true }
                    ]
                  },
                  { type: 'separator' },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '💰 จำนวนเงิน:', color: '#8c8c8c', size: 'sm', flex: 2 },
                      { type: 'text', text: `${Number(d.amount).toLocaleString()} THB`, weight: 'bold', size: 'sm', color: '#27ae60', flex: 4 }
                    ]
                  },
                  { type: 'separator' },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '📝 รายละเอียด:', color: '#8c8c8c', size: 'sm', flex: 2 },
                      { type: 'text', text: `${d.description || '-'}`, size: 'sm', color: '#555555', flex: 4, wrap: true }
                    ]
                  },
                  { type: 'separator' },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '📦 หมวดหมู่:', color: '#8c8c8c', size: 'sm', flex: 2 },
                      { type: 'text', text: `${d.category} (${d.subCategory || '-'})`, size: 'sm', color: '#555555', flex: 4, wrap: true }
                    ]
                  }
                ]
              },
              footer: {
                type: 'box',
                layout: 'horizontal',
                spacing: 'md',
                contents: [
                  {
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    action: {
                      type: 'uri',
                      label: '✏️ แก้ไขข้อมูล',
                      // ผูกกับค่า d.receiptId (ระบบ Payper) ไปหลัง URL อย่างสมบูรณ์แบบ
                      uri: `https://liff.line.me/2008225018-p8njd0VK/businesses/cmq3i1jyh047as60e7j8xz1y9?panel=edit&receiptId=${d.receiptId}&openExternalBrowser=1`
                    },
                    flex: 1
                  },
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#27ae60',
                    height: 'sm',
                    action: {
                      type: 'message',
                      label: '💾 บันทึกข้อมูล',
                      text: 'confirm_save'
                    },
                    flex: 1
                  }
                ]
              }
            }
          }
        ]
      });

    } catch (err) {
      console.error('Image error:', err);
      await client.pushMessage({
        to: userId,
        messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่' }]
      });
    }
  } 
  
  // กรณีผู้ใช้ส่งข้อความ Text กลับมาโต้ตอบ (ปุ่มกดยืนยัน)
  else if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();
    const state = pendingEdits[userId];

    if (text === 'confirm_save' && state) {
      try {
        const d = state.d;
        const imageBuffer = d.imageBuffer;
        delete d.imageBuffer;

        // ดึง receiptId ไปใช้ต่อในส่วนการเซฟลงไดรฟ์และคลาวด์
        const txnFolderId = await builderFolderPath(d.date, d.payee, d.receiptId);
        const slipName = `${d.date.replaceAll('/', '-')}_${d.payee}_${d.receiptId}.jpg`;
        
        const driveLink = await uploadToDrive(imageBuffer, slipName, txnFolderId);
        d.evidenceLink = driveLink;

        const certPdf = await buildCertificatePdf(d);
        await uploadToDrive(certPdf, `ใบรับรอง_${d.receiptId}.pdf`, txnFolderId, 'application/pdf');

        const mergedPdf = await mergeCertAndSlip(certPdf, imageBuffer);
        const accountingRoot = 'your_accounting_root_folder_id'; 
        await uploadToDrive(mergedPdf, `${slipName.replace('.jpg', '')}_FW.pdf`, accountingRoot, 'application/pdf');

        const month = await appendExpense(d);
        delete pendingEdits[userId];

        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: `✅ บันทึกครบแล้ว (${month}) \n👤 ${d.payee}\n📅 ${d.date}\n💰 ${Number(d.amount).toLocaleString()} บาท` }]
        });
      } catch (err) {
        console.error('Save error:', err);
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '❌ บันทึกไม่สำเร็จ กรุณาลองใหม่' }]
        });
      }
    } else {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '🤖 ส่งรูปสลิปเพื่อบันทึกค่าใช้จ่ายได้เลยครับ' }]
      });
    }
  }
}

module.exports = { handleEvent };
