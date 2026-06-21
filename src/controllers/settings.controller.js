const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULTS = {
  qrPosition: 'custom',
  qrSize: 50,
  customX: 490,
  customY: 145,
  applyTo: 'all',
};

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.qRSettings.findFirst();
    if (!settings) {
      settings = await prisma.qRSettings.create({ data: DEFAULTS });
    }
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { qrPosition, qrSize, customX, customY, applyTo } = req.body;
    let settings = await prisma.qRSettings.findFirst();

    const data = {
      qrPosition: qrPosition || DEFAULTS.qrPosition,
      qrSize: qrSize !== undefined ? parseInt(qrSize) : DEFAULTS.qrSize,
      customX: customX !== undefined ? parseInt(customX) : DEFAULTS.customX,
      customY: customY !== undefined ? parseInt(customY) : DEFAULTS.customY,
      applyTo: applyTo || DEFAULTS.applyTo,
    };

    if (settings) {
      settings = await prisma.qRSettings.update({
        where: { id: settings.id },
        data,
      });
    } else {
      settings = await prisma.qRSettings.create({
        data,
      });
    }

    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

