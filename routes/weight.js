const express = require('express');
const { prisma } = require('../database');
const { sensorApiKeyRequired } = require('../middleware/auth');

const router = express.Router();

function validateCagePayload(obj, name) {
  if (!obj || typeof obj !== 'object') return `"${name}" is required`;
  if (typeof obj.weight !== 'number') return `"${name}.weight" must be a number`;
  return null;
}

// POST /api/data/weight
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
    if (cage1) saves.push(prisma.weightData.create({ data: { cage: 1, weight: cage1.weight } }));
    if (cage2) saves.push(prisma.weightData.create({ data: { cage: 2, weight: cage2.weight } }));

    const docs = await Promise.all(saves);
    const response = {};
    if (cage1) response.cage1 = { id: docs[0].id, timestamp: docs[0].timestamp };
    if (cage2) response.cage2 = { id: docs[cage1 ? 1 : 0].id, timestamp: docs[cage1 ? 1 : 0].timestamp };

    return res.status(201).json(response);
  } catch (err) {
    console.error('Error saving weight data:', err);
    return res.status(500).json({ error: 'Failed to save weight data' });
  }
});

module.exports = router;
