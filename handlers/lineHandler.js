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

  // 1. ดักจับข้อมูลตอนที่กดปุ่ม "บันทึกข้อมูล" มาจากหน้าต่าง LINE LIFF
  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text;

    if (text.startsWith('CMD_SAVE_EXPENSE:')) {
      try {
        // แกะข้อมูลที่ถูกส่งมาจากฟอร์ม LIFF
        const jsonStr = text.replace('CMD_SAVE_EXPENSE:', '');
        const updatedData = JSON.parse(jsonStr);

        // ทำการบันทึกลง Google Sheets ทันที (บันทึกครั้งเดียวชัวร์ๆ ข้อมูลไม่ซ้ำ)
        await appendExpense([
          updatedData.date,
          updatedData.payee,
          updatedData.amount,
          updatedData.category,
          updatedData.subCategory,
          updatedData.description,
          updatedData.receiptId
        ]);

        // ส่งการ์ดแจ้งเตือนกลับหาผู้ใช้ว่าบันทึกสำเร็จแล้ว
        await client.pushMessage({
          to: userId,
          messages: [{ type: 'text', text: `✅ บันทึกค่าใช้จ่ายจำนวน ${Number(updatedData.amount).toLocaleString()} THB ลงระบบบัญชีเรียบร้อยแล้วครับ!` }]
        });
      } catch (err) {
        console.error('Save from LIFF error:', err);
        await client.pushMessage({
          to: userId,
          messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาดในขณะบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง' }]
        });
      }
      return; // ทำงานเสร็จสิ้นย่อยนี้เรียบร้อย
    }

    // ข้อความต้อนรับปกติทั่วไป
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '🤖 ยินดีต้อนรับครับ ส่งรูปภาพสลิปเงินเข้ามาเพื่อทำการบันทึกค่าใช้จ่ายได้เลยครับ!' }]
    });
  }

  // 2. จังหวะที่ผู้ใช้ส่งรูปภาพสลิปเข้ามาในแชท LINE
  else if (event.type === 'message' && event.message.type === 'image') {
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

      // สแกนสลิปด้วย Gemini
      const d = await readReceipt(imageBuffer);
      const receiptId = 'REC-' + Date.now().toString(36).toUpperCase();
      
      // มัดรวมข้อมูลส่งพ่วงไปตาม URL เพื่อนำไปหยอดใส่ฟอร์ม LIFF
      const queryParams = new URLSearchParams({
        receiptId: receiptId,
        date: d.date || '',
        payee: d.payee || '',
        amount: d.amount || 0,
        category: d.category || '',
        subCategory: d.subCategory || '',
        description: d.description || ''
      }).toString();

      // ส่งการ์ด Flex Message พร้อมปุ่มกดดึงหน้าต่าง LIFF ตัวจริงของคุณขึ้นมาทำงาน
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
                contents: [{ type: 'text', text: 'สแกนสลิปสำเร็จ', weight: 'bold', color: '#ffffff', size: 'lg', align: 'center' }]
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
                      { type: 'text', text: '👤 ผู้รับเงิน:', color: '#8c8c8c', size: 'sm', flex: 2 },
                      { type: 'text', text: `${d.payee}`, weight: 'bold', size: 'sm', color: '#333333', flex: 4, wrap: true }
                    ]
                  },
                  { type: 'separator' },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: '💰 ยอดเงิน:', color: '#8c8c8c', size: 'sm', flex: 2 },
                      { type: 'text', text: `${Number(d.amount).toLocaleString()} THB`, weight: 'bold', size: 'sm', color: '#27ae60', flex: 4 }
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
                    color: '#27ae60',
                    height: 'sm',
                    action: {
                      type: 'uri',
                      label: '✏️ ตรวจสอบ & บันทึกข้อมูลบน Pureper',
                      // ผูกเข้ากับ LIFF ID ของคุณอย่างสมบูรณ์แบบแล้วครับ ⚡
                      uri: `https://liff.line.me/2010518180-uVA58w9J?${queryParams}`
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
}

module.exports = { handleEvent };
