const express = require('express');
const multer = require('multer');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } }).single('file');

const { requireAuth } = require('../middleware/auth');
const { uploadImageToImgBB } = require('../services/imgbb');

// Upload a profile image for the signed-in user (stored on ImgBB).
router.post('/avatar', requireAuth, upload, async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ success: false, error: 'Please upload a file under the key "file"' });
  }
  const url = await uploadImageToImgBB(req.file.buffer.toString('base64'));
  return res.json({ success: true, url });
});

module.exports = router;
