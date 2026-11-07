const express = require('express');
const { prisma } = require('../database');
const { sensorApiKeyRequired } = require('../middleware/auth');

const router = express.Router();

function validateCagePayload(obj, name) {
  if (!obj || typeof obj !== 'object') return `"${name}" is required`;
  if (typeof obj.temperature !== 'number') return `"${name}.temperature" must be a number`;
  if (typeof obj.humidity !== 'number') return `"${name}.humidity" must be a number`;
  return null;
}

// POST /api/data/temperature-humidity
router.post('/temperature-humidity', sensorApiKeyRequired, async (req, res) => {
  const { cage1, cage2 } = req.body;

  const err1 = validateCagePayload(cage1, 'cage1');
  const err2 = cage2 ? validateCagePayload(cage2, 'cage2') : null;
  if (err1 || err2) {
    return res.status(400).json({ error: [err1, err2].filter(Boolean).join('; ') });
  }

  try {
    const saves = [
      prisma.sensorData.create({
        data: {
          cage: 1,
          temperature: cage1.temperature,
          humidity: cage1.humidity,
          ...(typeof cage1.samples === 'number' && { samples: cage1.samples }),
        },
      }),
    ];

    if (cage2) {
      saves.push(
        prisma.sensorData.create({
          data: {
            cage: 2,
            temperature: cage2.temperature,
            humidity: cage2.humidity,
            ...(typeof cage2.samples === 'number' && { samples: cage2.samples }),
          },
        })
      );
    }

    const [doc1, doc2] = await Promise.all(saves);

    return res.status(201).json({
      cage1: { id: doc1.id, timestamp: doc1.timestamp },
      ...(doc2 && { cage2: { id: doc2.id, timestamp: doc2.timestamp } }),
    });
  } catch (err) {
    console.error('Error saving sensor data:', err);
    return res.status(500).json({ error: 'Failed to save sensor data' });
  }
});

module.exports = router;
