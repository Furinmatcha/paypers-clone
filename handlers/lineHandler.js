const { readReceipt } = require('./geminiHandler')
const { saveToSheets, getSummary } = require('./sheetsHandler')
const { uploadFile } = require('./driveHandler')
const https = require('https')

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
  const userId = event.source.userId

  if (event.type === 'message' && event.message.type === 'image') {
    try {
      // ดาวน์โหลดรูปจาก LINE
      const response = await fetch(
        `https://api-data.line.me/v2/bot/message/${event.message.id}/content`,
        {
          headers: {
            Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
          }
        }
      )
      const arrayBuffer = await response.arrayBuffer()
      const imageBuffer = Buffer.from(arrayBuffer)
      const base64Image = imageBuffer.toString('base64')

      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '⏳ กำลังอ่านใบเสร็จ รอสักครู่...' }]
      })

      const receipt = await readReceipt(base64Image)
      const fileUrl = await uploadFile(imageBuffer, `receipt_${Date.now()}.jpg`)
      receipt.fileUrl = fileUrl
      receipt.userId = userId
      await saveToSheets(receipt)

      await client.pushMessage({
        to: userId,
        messages: [{
          type: 'text',
          text: `✅ บันทึกสำเร็จ!\n\n🏪 ร้าน: ${receipt.shopName}\n📅 วันที่: ${receipt.date}\n💰 ยอด: ${receipt.total} บาท\n🏷️ หมวด: ${receipt.category}`
        }]
      })
    } catch (err) {
      console.error('Image error:', err)
      await client.pushMessage({
        to: userId,
        messages: [{ type: 'text', text: '❌ เกิดขอผิดพลาด กรุณาลองใหม่' }]
      })
    }

  } else if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim()

    if (text === 'สรุป' || text === 'สรุปเดือนนี้') {
      const summary = await getSummary()
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: summary }]
      })
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
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: `✅ บันทึกแล้ว!\n📝 ${match[1]} — ${match[2]} บาท` }]
        })
      } else {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: '📌 วิธีใช้งาน:\n\n📷 ส่งรูปใบเสร็จ → AI อ่านให้\n✏️ พิมพ์ "ค่ากาแฟ 65" → บนทึกเลย\n📊 พมพ์ "สรุป" → ดูยอดเดือนนี้'
          }]
        })
      }
    }
  }
}

module.exports = { handleEvent }
