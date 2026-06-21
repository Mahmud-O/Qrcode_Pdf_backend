const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123123';

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (!existing) {
    const hashed = await bcrypt.hash(password, 12);
    const admin = await prisma.admin.create({
      data: { email, password: hashed },
    });
    console.log(`✅ Admin created: ${admin.email}`);
  } else {
    console.log(`Admin already exists: ${email}`);
  }

  // Seed or update QR settings
  const settings = await prisma.qRSettings.findFirst();
  if (settings) {
    await prisma.qRSettings.update({
      where: { id: settings.id },
      data: {
        customX: 480,
        customY: 60,
        qrSize: 50,
      },
    });
    console.log("✅ Updated existing QR settings in database to X=480, Y=60");
  } else {
    await prisma.qRSettings.create({
      data: {
        qrPosition: 'custom',
        qrSize: 50,
        customX: 480,
        customY: 60,
        applyTo: 'all',
      },
    });
    console.log("✅ Created new QR settings in database with X=480, Y=60");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
