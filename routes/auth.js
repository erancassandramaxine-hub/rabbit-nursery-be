const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { prisma } = require('../database');
const { JWT_SECRET, authRequired } = require('../middleware/auth');
const { sendResetCode } = require('../middleware/mailer');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const account = await prisma.user.findUnique({ where: { email } });

    if (!account) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (account.role === 'user' && account.status === 'inactive') {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    const isMatch = await bcrypt.compare(password, account.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { role } = account;
    const token = jwt.sign(
      { id: account.id, email: account.email, role },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      role,
      ...(role === 'user' && { mustResetPassword: account.mustResetPassword }),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const user = await prisma.user.findFirst({ where: { email, role: 'user' } });

    if (!user) {
      return res.json({ message: 'If that email exists, a reset code has been sent' });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetCode: code, resetCodeExpiry: expiry },
    });

    await sendResetCode(email, user.name, code);

    res.json({ message: 'If that email exists, a reset code has been sent' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to send reset code' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'email, code, and newPassword are required' });
  }

  try {
    const user = await prisma.user.findFirst({ where: { email, role: 'user' } });

    if (!user || !user.resetCode || !user.resetCodeExpiry) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    if (user.resetCodeExpiry < new Date()) {
      return res.status(400).json({ error: 'Reset code has expired' });
    }

    if (user.resetCode !== code) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        mustResetPassword: false,
        resetCode: null,
        resetCodeExpiry: null,
      },
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must differ from current password' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        mustResetPassword: false,
      },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
