const { google } = require('googleapis')
const { Readable } = require('stream')

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/drive']
})

async function uploadFile(buffer, filename) {
  const client = await auth.getClient()
  const drive = google.drive({ version: 'v3', auth: client })

  const stream = Readable.from(buffer)

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
    },
    media: {
      mimeType: 'image/jpeg',
      body: stream
    },
    fields: 'id, webViewLink'
  })

  // ตั้งให้ดูได้โดยไม่ต้อง login
  await drive.permissions.create({
    fileId: res.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    }
  })

  return res.data.webViewLink
}

module.exports = { uploadFile }
