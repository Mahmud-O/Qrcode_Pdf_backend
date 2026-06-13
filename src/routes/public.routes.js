const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

// GET /pdf/:token  — opens processed PDF directly in browser
router.get('/:token', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { qrToken: req.params.token },
    });

    if (!doc || !doc.processedFilePath) {
      return res.status(404).send('Document not found');
    }

    if (!fs.existsSync(doc.processedFilePath)) {
      return res.status(404).send('File not found on disk');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.title}.pdf"`);
    fs.createReadStream(doc.processedFilePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
