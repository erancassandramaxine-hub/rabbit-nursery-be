const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
require('dotenv').config();

const prisma = new PrismaClient();

const connectDB = async () => {
  await prisma.$connect();
  console.log('PostgreSQL connected.');
};

const ensureAdminUser = async () => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set; skipping default admin creation.');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, passwordHash, name: 'Administrator', role: 'admin', mustResetPassword: false },
  });
  console.log(`Default admin created: ${email}`);
};

module.exports = { connectDB, ensureAdminUser, prisma };
