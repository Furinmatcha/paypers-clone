const { readReceipt } = require('./geminiHandler');
// 🌟 แก้จุดนี้: แตกตัวแปรออกมาเป็น { appendExpense } ให้ตรงกับที่ sheetsHandler ส่งมา
const { appendExpense } = require('./sheetsHandler');

// 🌟 ดึงฟังก์ชันจัดการโครงสร้างโฟลเดอร์ และอัปโหลดที่ใช้ Service Account ของ Drive
const { buildFolderPath, uploadToDrive } = require('./driveHandler');
const { buildCertificatePdf, mergeCertAndSlip } = require('./certificateHandlers');

const line = require('@line/bot-sdk');
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// ฟังก์ชันแปลงรูปแบบวันที่ให้เป็นภาษาไทยสำหรับแสดงบน Flex Message
function formatThaiDate(dateStr) {
  try {
    if (!dateStr) return '-';
    let parts = [];
    if (dateStr.includes('/')) {
      parts = dateStr.split('/');
      const day = parseInt(parts[0]);
      const monthIdx = parseInt(parts[1]) - 1;
      const year = parseInt(parts[2]) + 543;
      const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
      return `${day} ${months[monthIdx]} ${year}`;
    } else if (dateStr.includes('-')) {
      parts = dateStr.split('-');
      const day = parseInt(parts[2]);
      const monthIdx = parseInt(parts[1]) - 1;
      const year = parseInt(parts[0]) + 543;
      const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
      return `${day} ${months[monthIdx]} ${year}`;
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

async function handleEvent(event) {
  if (!event || !event.source || !event.source.userId) {
    return;
  }
  
  const userId = event.source.userId;

  // 1. จังหวะกดยืนยันบันทึกข้อมูลมาจากหน้า LIFF
  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text;

    if (text.startsWith('CMD_SAVE_EXPENSE:')) {
      try {
        const jsonStr = text.replace('CMD_SAVE_EXPENSE:', '');
        const updatedData = JSON.parse(jsonStr);

        // ดึง Image Buffer ของสลิปที่เซฟค้างไว้ในหน่วยความจำ
        const slipImageBuffer = global.currentSlipBuffer || Buffer.alloc(0); 
        const txnId = updatedData.receiptId || 'TXN-' + Date.now().toString(36).toUpperCase();

        // แนบค่าเข้า Object เพื่อให้ sheetsHandler นำไปบันทึกลงคอลัมน์ได้ครบถ้วน
        updatedData.receiptId = txnId;

        // 🟢 ส่วนที่ 1: เรียกใช้ appendExpense และส่งออบเจกต์เข้าไปตรง ๆ (แก้ปัญหา TypeError)
        await appendExpense(updatedData);

        // 🟢 ส่วนที่ 2: จัดสร้างโครงสร้างโฟลเดอร์ Google Drive
        const folders = await buildFolderPath(updatedData.date, updatedData.payee, txnId);

        // อัปโหลดไฟล์สลิปต้นฉบับลงโฟลเดอร์ฝั่ง "รวมหลักฐาน"
        if (slipImageBuffer.length > 0) {
          await uploadToDrive(slipImageBuffer, 'สลิปดั้งเดิม.jpg', folders.txnFolderId, 'image/jpeg');
        }

        // 🟢 ส่วนที่ 3: สร้างไฟล์ PDF ใบรับรองแทนใบเสร็จรับเงิน และรวมเล่มส่งฝั่งสำนักงานบัญชี
        const certPdfBuffer = await buildCertificatePdf(updatedData, txnId);
        await uploadToDrive(certPdfBuffer, 'ใบรับรองแทนใบเสร็จ.pdf', folders.txnFolderId, 'application/pdf');

        if (slipImageBuffer.length > 0) {
          const combinedPdfBuffer = await mergeCertAndSlip(certPdfBuffer, slipImageBuffer);
          await uploadToDrive(combinedPdfBuffer, `ใบรับรอง+สลิป_${txnId}.pdf`, folders.accountingRoot, 'application/pdf');
        }

        // เคลียร์ค่าแรมรูปภาพเมื่อทำงานเสร็จสิ้น
        global.currentSlipBuffer = null;

        // ตอบกลับ LINE แจ้งเตือนสเตตัสสำเร็จ
        await client.pushMessage({
          to: userId,
          messages: [
            {
              type: 'flex',
              altText: '✅ บันทึกบัญชีและเอกสารลง Drive สำเร็จ',
              contents: {
                type: 'bubble',
                size: 'mega',
                body: {
                  type: 'box',
                  layout: 'vertical',
                  backgroundColor: '#f4fbf7',
                  cornerRadius: 'md',
                  spacing: 'md',
                  contents: [
                    {
                      type: 'box',
                      layout: 'horizontal',
                      spacing: 'sm',
                      contents: [
                        { type: 'text', text: '✅', size: 'md', flex: 1 },
                        { type: 'text', text: 'บันทึกบัญชีและจัดเก็บเอกสารสำเร็จ', weight: 'bold', color: '#27ae60', size: 'sm', flex: 11 }
                      ]
                    },
                    { type: 'separator', color: '#e2e2e2' },
                    {
                      type: 'box',
                      layout: 'horizontal',
                      contents: [
                        { type: 'text', text: 'จำนวนเงิน', color: '#8c8c8c', size: 'sm', flex: 3 },
                        { type: 'text', text: `${Number(updatedData.amount).toLocaleString()} THB`, weight: 'bold', size: 'md', color: '#000000', flex: 5, align: 'end' }
                      ]
                    },
                    {
                      type: 'box',
                      layout: 'horizontal',
                      contents: [
                        { type: 'text', text: 'ผู้รับเงิน/ร้านค้า', color: '#8c8c8c', size: 'sm', flex: 3 },
                        { type: 'text', text: `${updatedData.payee}`, size: 'sm', color: '#333333', flex: 5, wrap: true }
                      ]
                    }
                  ]
                }
              }
            }
          ]
        });
      } catch (err) {
        console.error('Save fully transaction flow error:', err);
        try {
          await client.pushMessage({
            to: userId,
            messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาดในการเซฟข้อมูลระบบโปรดตรวจสอบ Log' }]
          });
        } catch (msgErr) { console.error(msgErr); }
      }
      return;
    }
  }

  // 2. จังหวะที่มีการส่งรูปภาพสลิปเข้ามาในแชท LINE ครั้งแรก
  else if (event.type === 'message' && event.message.type === 'image') {
    try {
      const response = await fetch(
        `https://api-data.line.me/v2/bot/message/${event.message.id}/content`,
        { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` } }
      );
      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      global.currentSlipBuffer = imageBuffer; 

      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '⏳ กำลังประมวลผลข้อมูลสลิปสักครู่...' }]
      });

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
                      { type: 'text', text: 'จำนวนเงิน', color: '#aa1111', size: 'sm', flex: 3 },
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
                      { type: 'text', text: `${d.category || 'อื่นๆ'}`, size: 'sm', color: '#333333', flex: 5 }
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
                      { type: 'text', text: 'ผู้รับเงิน', color: '#8c8c8c', size: 'sm', flex: 3 },
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
      console.error('Image processing flow error:', err);
    }
  }
}

module.exports = { handleEvent };
