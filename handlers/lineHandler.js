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

// ฟังก์ชันแปลงรูปแบบวันที่ให้อ่านง่ายแบบไทย
function formatThaiDate(dateStr) {
  try {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear() + 543}`;
  } catch (e) {
    return dateStr;
  }
}

async function handleEvent(event) {
  if (event.type !== 'message' || !event.source || !event.source.userId) {
    return;
  }
  
  const userId = event.source.userId;

  // 1. ดักจับข้อมูลเมื่อกดบันทึกมาจาก LIFF
  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text;

    if (text.startsWith('CMD_SAVE_EXPENSE:')) {
      try {
        const jsonStr = text.replace('CMD_SAVE_EXPENSE:', '');
        const updatedData = JSON.parse(jsonStr);

        await appendExpense([
          updatedData.date,
          updatedData.payee,
          updatedData.amount,
          updatedData.category,
          updatedData.subCategory,
          updatedData.description,
          updatedData.receiptId
        ]);

        // การ์ดแสดงผลเมื่อบันทึกสำเร็จ (รูปที่ 2)
        await client.pushMessage({
          to: userId,
          messages: [
            {
              type: 'flex',
              altText: '✅ อัปเดตค่าใช้จ่ายสำเร็จ',
              contents: {
                type: 'bubble',
                body: {
                  type: 'box',
                  layout: 'vertical',
                  backgroundColor: '#f1f9f4',
                  contents: [
                    {
                      type: 'box',
                      layout: 'horizontal',
                      alignment: 'center',
                      contents: [
                        { type: 'text', text: '✅ อัปเดตค่าใช้จ่ายสำเร็จ', weight: 'bold', color: '#27ae60', size: 'md' }
                      ]
                    }
                  ]
                }
              }
            }
          ]
        });
      } catch (err) {
        console.error('Save error:', err);
      }
      return;
    }
  }

  // 2. จังหวะที่ผู้ใช้ส่งรูปสลิปเข้ามา (ปรับปรุงให้แสดงผลครบเหมือนรูป 2)
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
      
      const queryParams = new URLSearchParams({
        receiptId: receiptId,
        date: d.date || '',
        payee: d.payee || '',
        amount: d.amount || 0,
        category: d.category || '',
        subCategory: d.subCategory || '',
        description: d.description || ''
      }).toString();

      // ส่งหน้าตาการ์ดตรวจรับข้อมูลชุดใหม่ที่มีรายละเอียดครบถ้วนแบบ รูปที่ 2
      await client.pushMessage({
        to: userId,
        messages: [
          {
            type: 'flex',
            altText: '🧾 ตรวจสอบข้อมูลสลิปโอนเงิน',
            contents: {
              type: 'bubble',
              size: 'mega',
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: 'จำนวนเงิน', color: '#8c8c8c', size: 'sm', flex: 3, verticalAlign: 'center' },
                      { type: 'text', text: `${Number(d.amount).toLocaleString()} THB`, weight: 'bold', size: 'xl', color: '#000000', flex: 5, align: 'end' }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: 'ประเภทเอกสาร', color: '#8c8c8c', size: 'sm', flex: 3 },
                      { type: 'text', text: 'สลิปโอนเงิน', size: 'sm', color: '#333333', flex: 5 }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: 'วันที่', color: '#8c8c8c', size: 'sm', flex: 3 },
                      { type: 'text', text: `${formatThaiDate(d.date)}`, size: 'sm', color: '#333333', flex: 5 }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: 'หมวดหมู่', color: '#8c8c8c', size: 'sm', flex: 3 },
                      { type: 'text', text: `${d.category || '-'}`, size: 'sm', color: '#333333', flex: 5 }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: 'หมวดหมู่ย่อย', color: '#8c8c8c', size: 'sm', flex: 3 },
                      { type: 'text', text: `${d.subCategory || '-'}`, size: 'sm', color: '#333333', flex: 5 }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: 'รายละเอียด', color: '#8c8c8c', size: 'sm', flex: 3 },
                      { type: 'text', text: `${d.description || '-'}`, size: 'sm', color: '#333333', flex: 5, wrap: true }
                    ]
                  },
                  { type: 'separator', margin: 'md' },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    margin: 'md',
                    contents: [
                      { type: 'text', text: 'ผู้ขาย/ร้านค้า', color: '#8c8c8c', size: 'sm', flex: 3 },
                      { type: 'text', text: `${d.payee}`, weight: 'bold', size: 'sm', color: '#333333', flex: 5, wrap: true }
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
      console.error('Image processing error:', err);
    }
  }
}

module.exports = { handleEvent };
