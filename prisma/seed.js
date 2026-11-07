const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // --- Admin user ---
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@rnmecs.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@1234';

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        name: 'Administrator',
        role: 'admin',
        mustResetPassword: false,
      },
    });
    console.log(`Admin created: ${adminEmail}`);
  } else {
    console.log(`Admin already exists: ${adminEmail}`);
  }

  // --- Regular user ---
  const userEmail = 'user@example.com';
  const existingUser = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!existingUser) {
    await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: await bcrypt.hash('User@1234', 10),
        name: 'Demo User',
        role: 'user',
        status: 'active',
        mustResetPassword: false,
      },
    });
    console.log(`User created: ${userEmail}`);
  } else {
    console.log(`User already exists: ${userEmail}`);
  }

  // --- Threshold settings (singleton) ---
  const thresholds = await prisma.thresholdSettings.findFirst();
  if (!thresholds) {
    await prisma.thresholdSettings.create({
      data: {
        temperatureThresholdDown: 23,
        temperatureThresholdUp: 28,
        weightThresholdGrams: 100,
      },
    });
    console.log('Threshold settings seeded.');
  } else {
    console.log('Threshold settings already exist, skipping.');
  }

  // --- Sample sensor data (last 2 hours, 2 cages) ---
  const sensorCount = await prisma.sensorData.count();
  if (sensorCount === 0) {
    const now = Date.now();
    const records = [];

    for (let i = 24; i >= 0; i--) {
      const ts = new Date(now - i * 5 * 60 * 1000); // every 5 minutes
      records.push(
        { cage: 1, temperature: 25 + Math.random() * 3, humidity: 60 + Math.random() * 10, samples: 10, timestamp: ts },
        { cage: 2, temperature: 24 + Math.random() * 3, humidity: 58 + Math.random() * 10, samples: 10, timestamp: ts },
      );
    }

    await prisma.sensorData.createMany({ data: records });
    console.log(`Sensor data seeded: ${records.length} records.`);
  } else {
    console.log('Sensor data already exists, skipping.');
  }

  // --- Sample weight data (last 2 hours, 2 cages) ---
  const weightCount = await prisma.weightData.count();
  if (weightCount === 0) {
    const now = Date.now();
    const records = [];

    for (let i = 24; i >= 0; i--) {
      const ts = new Date(now - i * 5 * 60 * 1000);
      records.push(
        { cage: 1, weight: 150 + Math.random() * 50, timestamp: ts },
        { cage: 2, weight: 140 + Math.random() * 50, timestamp: ts },
      );
    }

    await prisma.weightData.createMany({ data: records });
    console.log(`Weight data seeded: ${records.length} records.`);
  } else {
    console.log('Weight data already exists, skipping.');
  }

  // --- Sample control status ---
  const controlCount = await prisma.controlStatus.count();
  if (controlCount === 0) {
    const now = Date.now();
    const records = [];

    for (let i = 5; i >= 0; i--) {
      const ts = new Date(now - i * 60 * 60 * 1000);
      records.push(
        { cage: 1, fan: false, heater: false, timestamp: ts },
        { cage: 2, fan: false, heater: false, timestamp: ts },
      );
    }

    await prisma.controlStatus.createMany({ data: records });
    console.log(`Control status seeded: ${records.length} records.`);
  } else {
    console.log('Control status already exists, skipping.');
  }

  console.log('Seeding complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
