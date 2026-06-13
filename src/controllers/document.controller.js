const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { generateQRCode, embedQRInPDF } = require('../services/pdf.service');

const prisma = new PrismaClient();

exports.uploadDocuments = async (req, res) => {
  // req.files is a flat array from upload.array('files') — accepts any number of PDFs
  const files = req.files || [];
  const uploadSettings = req.body || {};

  console.log('[Upload Controller] Files received:', files.map(f => ({
    fieldname: f.fieldname,
    originalname: f.originalname,
    size: f.size,
    mimetype: f.mimetype,
    path: f.path,
  })));

  if (files.length === 0) {
    console.warn('[Upload Controller] No files found in request.');
    return res.status(400).json({ error: 'At least one PDF file is required.' });
  }

  const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:5000';
  const results = [];

  for (const file of files) {
    const token = uuidv4();
    const qrUrl = `${baseUrl}/pdf/${token}`;
    const title = path.basename(file.originalname, '.pdf').replace(/_/g, ' ');

    // Create document record with PROCESSING status
    const doc = await prisma.document.create({
      data: {
        title,
        originalFilePath: file.path,
        qrToken: token,
        qrUrl,
        processingStatus: 'PROCESSING',
      },
    });

    try {
      // Load QR placement settings - always use fixed defaults
      const qrSettings = await prisma.qRSettings.findFirst();
      const settings = {
        position: 'custom',
        customX: qrSettings?.customX ?? 48,
        customY: qrSettings?.customY ?? 620,
        qrSize: qrSettings?.qrSize ?? 50,
        pageSelection: 'all',
      };

      // Generate QR code image
      const qrImagePath = await generateQRCode(qrUrl, token);

// Embed QR in PDF using placement settings
       const processedPath = await embedQRInPDF(file.path, qrImagePath, {
        position: settings.position,
        customX: settings.customX,
        customY: settings.customY,
        qrSize: settings.qrSize,
        pageSelection: settings.pageSelection,
        outputFilename: `processed_${token}.pdf`,
      });

      // Update document with COMPLETED status
      const updatedDoc = await prisma.document.update({
        where: { id: doc.id },
        data: {
          processedFilePath: processedPath,
          qrImagePath,
          processingStatus: 'COMPLETED',
        },
      });

      results.push(updatedDoc);
    } catch (err) {
      console.error(`Failed to process document ${doc.title}:`, err);

      // Mark as FAILED
      await prisma.document.update({
        where: { id: doc.id },
        data: { processingStatus: 'FAILED' },
      }).catch(console.error);

      results.push({
        ...doc,
        processingStatus: 'FAILED',
        error: err.message,
      });
    }
  }

  const allFailed = results.every(r => r.processingStatus === 'FAILED');
  if (allFailed) {
    return res.status(500).json({ error: 'All documents failed to process', documents: results });
  }

  res.status(201).json({ message: 'Documents uploaded successfully', documents: results });
};

exports.getDocuments = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search
      ? { title: { contains: search, mode: 'insensitive' } }
      : {};

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.document.count({ where }),
    ]);

    res.json({
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        qrUrl: d.qrUrl,
        processingStatus: d.processingStatus,
        createdAt: d.createdAt,
      })),
      total,
    });
  } catch (err) {
    console.error('[Documents Controller] Error fetching:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

exports.getDocument = async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      id: doc.id,
      title: doc.title,
      qrUrl: doc.qrUrl,
      processingStatus: doc.processingStatus,
      createdAt: doc.createdAt,
    });
  } catch (err) {
    console.error('[Documents Controller] Error getting:', err);
    res.status(500).json({ error: 'Failed to get document' });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const filesToDelete = [
      doc.originalFilePath,
      doc.processedFilePath,
      doc.qrImagePath,
    ].filter(Boolean);

    for (const filePath of filesToDelete) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await prisma.document.delete({ where: { id: req.params.id } });

    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('[Documents Controller] Error deleting:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
};

exports.downloadDocument = async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!doc || !doc.processedFilePath) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!fs.existsSync(doc.processedFilePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.title}.pdf"`);
    fs.createReadStream(doc.processedFilePath).pipe(res);
  } catch (err) {
    console.error('[Documents Controller] Error downloading:', err);
    res.status(500).json({ error: 'Failed to download document' });
  }
};