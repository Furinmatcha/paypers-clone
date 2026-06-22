const { readReceipt } = require('./geminiHandler')
const { saveToSheets, getSummary } = require('./sheetsHandler')
const { uploadFile } = require('./driveHandler')

async function handleEvent(event, client) {
  const userId = event.source.userId

  // รับรูปใบเสร็จ
  if (event.type === 'message' && event.message.type === 'image') {

    // ดาวน์โหลดรูปจาก LINE
    const stream = await client.getMessageContent(event.message.id)
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const imageBuffer = Buffer.concat(chunks)
    const base64Image = imageBuffer.toString('base64')

    // แจ้งว่ากำลังประมวลผล
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '⏳ กำลังอ่านใบเสร็จ รอสักครู่...'
    })

    // ส่งให้ Gemini อ่าน
    const receipt = await readReceipt(base64Image)

    // อัปโหลดรูปลง Drive
    const fileUrl = await uploadFile(imageBuffer, `receipt_${Date.now()}.jpg`)

    // บันทึกลง Sheets
    receipt.fileUrl = fileUrl
    receipt.userId = userId
    await saveToSheets(receipt)

    // ตอบกลับผล
    await client.pushMessage(userId, {
      type: 'text',
      text: `✅ บันทึกสำเร็จ!\n\n🏪 ร้าน: ${receipt.shopName}\n📅 วันที่: ${receipt.date}\n💰 ยอด: ${receipt.total} บาท\n🏷️ หมวด: ${receipt.category}\n📎 ดูสลิป: ${receipt.fileUrl}`
    })
  }

  // รับข้อความ
  else if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim()

    // คำสั่งสรุป
    if (text === 'สรุป' || text === 'สรุปเดือนนี้') {
      const summary = await getSummary()
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: summary
      })

    // บันทึกแบบ manual เช่น "ค่ากาแฟ 65"
    } else {
      const match = text.match(/^(.+?)\s+(\d+(\.\d+)?)$/)
      if (match) {
        const receipt = {
          shopName: match[1],
          total: match[2],
          date: new Date().toLocaleDateString('th-TH'),
          items: match[1],
          vat: 0,
          category: 'อื่นๆ',
          fileUrl: '-',
          userId
        }
        await saveToSheets(receipt)
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `✅ บันทึกแล้ว!\n📝 ${match[1]} — ${match[2]} บาท`
        })

      // ไม่รู้จักคำสั่ง
      } else {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '📌 วิธีใช้งาน:\n\n📷 ส่งรูปใบเสร็จ → AI อ่านให้อัตโนมัติ\n✏️ พิมพ์ "ค่ากาแฟ 65" → บันทึกเลย\n📊 พิมพ์ "สรุป" → ดูยอดเดือนนี้'
        })
      }
    }
  }
}

module.exports = { handleEvent }
