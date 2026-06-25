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

async function handleEvent(event) {
  if (event.type !== 'message' || !event.source || !event.source.userId) {
    return;
  }
  
  const userId = event.source.userId;

  // ขั้นตอนเดียวจบ: เมื่อผู้ใช้ส่งรูปภาพสลิปเข้ามา
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
        messages: [{ type: 'text', text: '⏳ กำลังประมวลผลข้อมูลสลิปสักครู่...' }]
      });

      // ดึงข้อมูลจาก Gemini และ QR Code
      const d = await readReceipt(imageBuffer);
      
      // สร้าง ID บิลและเตรียมพารามิเตอร์ส่งไปที่หน้าเว็บ
      const receiptId = 'REC-' + Date.now().toString(36).toUpperCase();
      
      // แปลงข้อมูลที่อ่านได้เป็น URL Query Parameters เพื่อเอาไปแสดงบนหน้าเว็บฟอร์ม pureper
      const queryParams = new URLSearchParams({
        panel: 'edit',
        receiptId: receiptId,
        date: d.date || '',
        payee: d.payee || '',
        amount: d.amount || 0,
        category: d.category || '',
        subCategory: d.subCategory || '',
        description: d.description || '',
        openExternalBrowser: '1'
      }).toString();

      // ส่งหน้าตาการ์ด Flex Message แจ้งผู้ใช้ให้กดเปิดหน้าเว็บไปตรวจและเซฟข้อมูล
      await client.pushMessage({
        to: userId,
        messages: [
          {
            type: 'flex',
            altText: '🧾 สแกนสลิปสำเร็จแล้ว',
            contents: {
              type: 'bubble',
              size: 'mega',
              header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#f39c12',
                contents: [{ type: 'text', text: 'สแกนสลิปสำเร็จ', weight: 'bold', color: '#ffffff', size: 'lg', align: 'center' }]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  { type: 'text', text: 'ระบบอ่านข้อมูลเบื้องต้นเรียบร้อยแล้ว กรุณากดปุ่มด้านล่างเพื่อตรวจสอบความถูกต้องและกดบันทึกเข้าสู่ระบบบัญชีครับ', size: 'sm', color: '#666666', wrap: true },
                  { type: 'separator', margin: 'md' },
                  {
                    type: 'box',
                    layout: 'vertical',
                    margin: 'md',
                    spacing: 'sm',
                    contents: [
                      { type: 'text', text: `👤 ผู้รับเงินเบื้องต้น: ${d.payee}`, size: 'sm', color: '#333333', weight: 'bold', wrap: true },
                      { type: 'text', text: `💰 ยอดเงิน: ${Number(d.amount).toLocaleString()} THB`, size: 'sm', color: '#f39c12', weight: 'bold' }
                    ]
                  }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#f39c12',
                    height: 'sm',
                    action: {
                      type: 'uri',
                      label: '✏️ ตรวจสอบ & บันทึกข้อมูลบน Pureper',
                      // ยิงตรงเข้าหน้าเว็บแอปของคุณ พร้อมส่งค่าข้อมูลดิบไปกรอกในฟอร์มทันที ⚡
                      uri: `https://liff.line.me/2008225018-p8njd0VK/businesses/cmq3i1jyh047as60e7j8xz1y9?${queryParams}`
                    }
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
        messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองใหม่' }]
      });
    }
  } 
  
  // จัดการข้อความทั่วไป
  else if (event.type === 'message' && event.message.type === 'text') {
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '🤖 ยินดีต้อนรับครับ ส่งรูปภาพสลิปเงินเข้ามาเพื่อทำการบันทึกค่าใช้จ่ายได้เลยครับ!' }]
    });
  }
}

module.exports = { handleEvent };
