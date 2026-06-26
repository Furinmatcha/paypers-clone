const { readReceipt } = require('./geminiHandler');
const { appendExpense } = require('./sheetsHandler');
// 🛠️ เชื่อมโยงเข้ากับฟังก์ชันใน drive และ certificate ด้วยชื่อที่ถูกต้อง
const { createFolder, uploadFile } = require('./driveHandler');
const { buildCertificatePdf, mergeCertAndSlip } = require('./certificateHandlers');

const line = require('@line/bot-sdk');
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

function formatThaiDate(dateStr) {
  try {
    if (!dateStr) return '-';
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    
    const day = parseInt(parts[0]);
    const monthIdx = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]) + 543;
    
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `${day} ${months[monthIdx]} ${year}`;
  } catch (e) {
    return dateStr;
  }
}

async function handleEvent(event) {
  if (!event || !event.source || !event.source.userId) {
    return;
  }
  
  const userId = event.source.userId;

  // 1. จังหวะกดบันทึกมาจากหน้า LIFF
  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text;

    if (text.startsWith('CMD_SAVE_EXPENSE:')) {
      try {
        const jsonStr = text.replace('CMD_SAVE_EXPENSE:', '');
        const updatedData = JSON.parse(jsonStr);

        // ดึง Image Buffer ของสลิปที่เก็บสำรองไว้ใน Global Memory ออกมาใช้งาน
        const slipImageBuffer = global.currentSlipBuffer || Buffer.alloc(0); 
        const txnId = updatedData.receiptId || 'TXN-' + Date.now().toString(36).toUpperCase();

        // 🌟 สร้างแผนผังโฟลเดอร์ตามโครงสร้าง ปี -> เดือนภาษาไทย -> รวมหลักฐาน/สำหรับสำนักงานบัญชี
        const folders = await createFolder(updatedData.date, updatedData.payee, txnId);

        // 🌟 เฟส 2: เซฟสลิปดั้งเดิมลงโฟลเดอร์รายการย่อย
        if (slipImageBuffer.length > 0) {
          await uploadFile(slipImageBuffer, 'สลิป.jpg', 'image/jpeg', folders.itemFolderId);
        }

        // 🌟 เฟส 3: สร้าง PDF ใบรับรองแทนใบเสร็จ แล้วบันทึกลงโฟลเดอร์รายการย่อย
        const certPdfBuffer = await buildCertificatePdf(updatedData, txnId);
        await uploadFile(certPdfBuffer, 'ใบรับรอง.pdf', 'application/pdf', folders.itemFolderId);

        // 🌟 เฟส 4: มัดรวมใบรับรอง + รูปสลิป เป็นไฟล์เดียว ยิงเข้าโฟลเดอร์ "สำหรับสำนักงานบัญชี"
        if (slipImageBuffer.length > 0) {
          const combinedPdfBuffer = await mergeCertAndSlip(certPdfBuffer, slipImageBuffer);
          await uploadFile(combinedPdfBuffer, `ใบรับรอง+สลิป_${txnId}.pdf`, 'application/pdf', folders.accountingId);
        }

        // บันทึกลงบัญชี Google Sheets ตามปกติ
        await appendExpense([
          updatedData.date,
          updatedData.payee,
          updatedData.amount,
          updatedData.category,
          updatedData.subCategory,
          updatedData.description,
          txnId
        ]);

        // เคลียร์หน่วยความจำชั่วคราว
        global.currentSlipBuffer = null;

        // แจ้งเตือนบันทึกสำเร็จด้วยกล่องสีเขียว
        await client.pushMessage({
          to: userId,
          messages: [
            {
              type: 'flex',
              altText: '✅ บันทึกข้อมูลและจัดเก็บลง Drive สำเร็จ',
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
                        { type: 'text', text: 'บันทึกข้อมูลและจัดเก็บเอกสารสำเร็จ', weight: 'bold', color: '#27ae60', size: 'sm', flex: 11 }
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
                        { type: 'text', text: 'ผู้ขาย/ร้านค้า', color: '#8c8c8c', size: 'sm', flex: 3 },
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
        console.error('Save to Sheets and Drive error:', err);
        try {
          await client.pushMessage({
            to: userId,
            messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง' }]
          });
        } catch (msgErr) { console.error(msgErr); }
      }
      return;
    }
  }

  // 2. จังหวะส่งรูปสลิปเข้ามาครั้งแรก
  else if (event.type === 'message' && event.message.type === 'image') {
    try {
      const response = await fetch(
        `https://api-data.line.me/v2/bot/message/${event.message.id}/content`,
        { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` } }
      );
      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      // สำรองรูปสลิปเก็บไว้ชั่วคราวในระดับ Global Memory
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

      // ส่งหน้าต่างตรวจสอบ (Flex Message) ให้กดยืนยันเข้าหน้า LIFF
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
      try {
        await client.pushMessage({
          to: userId,
          messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองใหม่อีกครั้ง' }]
        });
      } catch (pushErr) { console.error(pushErr); }
    }
  }
}

module.exports = { handleEvent };
