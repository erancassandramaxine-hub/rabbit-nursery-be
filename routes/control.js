const express = require('express');
const { prisma } = require('../database');
const { sensorApiKeyRequired, authRequired } = require('../middleware/auth');

const router = express.Router();

function validateCagePayload(obj, name) {
  if (!obj || typeof obj !== 'object') return `"${name}" is required`;
  if (typeof obj.fan !== 'boolean') return `"${name}.fan" must be a boolean`;
  if (typeof obj.heater !== 'boolean') return `"${name}.heater" must be a boolean`;
  return null;
}

function formatDoc(doc) {
  if (!doc) return null;
  return { fan: doc.fan, heater: doc.heater, timestamp: doc.timestamp };
}

// POST /api/control
router.post('/', sensorApiKeyRequired, async (req, res) => {
  const { cage1, cage2 } = req.body;

  if (!cage1 && !cage2) {
    return res.status(400).json({ error: 'At least one of "cage1" or "cage2" is required' });
  }

  const err1 = cage1 ? validateCagePayload(cage1, 'cage1') : null;
  const err2 = cage2 ? validateCagePayload(cage2, 'cage2') : null;
  if (err1 || err2) {
    return res.status(400).json({ error: [err1, err2].filter(Boolean).join('; ') });
  }

  try {
    const saves = [];
    if (cage1) saves.push(prisma.controlStatus.create({ data: { cage: 1, fan: cage1.fan, heater: cage1.heater } }));
    if (cage2) saves.push(prisma.controlStatus.create({ data: { cage: 2, fan: cage2.fan, heater: cage2.heater } }));

    const docs = await Promise.all(saves);
    const response = {};
    if (cage1) response.cage1 = { id: docs[0].id, timestamp: docs[0].timestamp };
    if (cage2) response.cage2 = { id: docs[cage1 ? 1 : 0].id, timestamp: docs[cage1 ? 1 : 0].timestamp };

    return res.status(201).json(response);
  } catch (err) {
    console.error('Error saving control status:', err);
    return res.status(500).json({ error: 'Failed to save control status' });
  }
});

// GET /api/control/latest
router.get('/latest', authRequired, async (req, res) => {
  try {
    const [cage1, cage2] = await Promise.all([
      prisma.controlStatus.findFirst({ where: { cage: 1 }, orderBy: { timestamp: 'desc' } }),
      prisma.controlStatus.findFirst({ where: { cage: 2 }, orderBy: { timestamp: 'desc' } }),
    ]);

    return res.json({ cage1: formatDoc(cage1), cage2: formatDoc(cage2) });
  } catch (err) {
    console.error('Error fetching latest control status:', err);
    return res.status(500).json({ error: 'Failed to fetch control status' });
  }
});

// GET /api/control/history?cage=1&from=<ISO>&to=<ISO>&page=1&limit=20
router.get('/history', authRequired, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const where = {};

  if (req.query.cage !== undefined) {
    const cage = parseInt(req.query.cage);
    if (isNaN(cage)) return res.status(400).json({ error: '"cage" must be a number' });
    where.cage = cage;
  }

  if (req.query.from || req.query.to) {
    where.timestamp = {};
    if (req.query.from) {
      const from = new Date(req.query.from);
      if (isNaN(from)) return res.status(400).json({ error: 'Invalid "from" date' });
      where.timestamp.gte = from;
    }
    if (req.query.to) {
      const to = new Date(req.query.to);
      if (isNaN(to)) return res.status(400).json({ error: 'Invalid "to" date' });
      where.timestamp.lte = to;
    }
  }

  try {
    const [data, total] = await Promise.all([
      prisma.controlStatus.findMany({ where, orderBy: { timestamp: 'desc' }, skip, take: limit }),
      prisma.controlStatus.count({ where }),
    ]);

    return res.json({
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error fetching control history:', err);
    return res.status(500).json({ error: 'Failed to fetch control history' });
  }
});

module.exports = router;
