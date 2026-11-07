const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { prisma } = require('../database');
const { sendTemporaryPassword } = require('../middleware/mailer');
const { adminOnly } = require('../middleware/auth');

const router = express.Router();

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  mustResetPassword: true,
  createdAt: true,
};

// GET /api/users?page=1&limit=10
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  try {
    const [data, total] = await Promise.all([
      prisma.user.findMany({ where: { role: 'user' }, select: USER_SELECT, skip, take: limit }),
      prisma.user.count({ where: { role: 'user' } }),
    ]);

    res.json({
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: parseInt(req.params.id), role: 'user' },
      select: USER_SELECT,
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/users
router.post('/', adminOnly, async (req, res) => {
  const { email, name, role, status } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const tempPassword = crypto.randomBytes(6).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || '',
        role: role || 'user',
        status: status || 'active',
      },
      select: USER_SELECT,
    });

    let emailSent = true;
    try {
      await sendTemporaryPassword(email, name, tempPassword);
    } catch (emailErr) {
      emailSent = false;
      console.error('Email send failed:', emailErr.message);
    }

    res.status(201).json({ ...user, emailSent });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id
router.put('/:id', adminOnly, async (req, res) => {
  const { email, password, name, status } = req.body;
  const data = {};

  if (email) data.email = email;
  if (name !== undefined) data.name = name;
  if (password) data.passwordHash = await bcrypt.hash(password, 10);
  if (status !== undefined) {
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'status must be "active" or "inactive"' });
    }
    data.status = status;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data,
      select: USER_SELECT,
    });
    res.json(user);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'User deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
