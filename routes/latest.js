const express = require('express');
const { prisma } = require('../database');

const router = express.Router();

// GET /api/latest/temperature-humidity
router.get('/temperature-humidity', async (req, res) => {
  try {
    const [cage1, cage2] = await Promise.all([
      prisma.sensorData.findFirst({ where: { cage: 1 }, orderBy: { timestamp: 'desc' } }),
      prisma.sensorData.findFirst({ where: { cage: 2 }, orderBy: { timestamp: 'desc' } }),
    ]);

    const format = (doc) => {
      if (!doc) return null;
      const ts = doc.timestamp ? new Date(doc.timestamp) : null;
      return {
        temperature: doc.temperature,
        humidity: doc.humidity,
        timestamp: ts ? ts.toISOString() : null,
        timestampLabel: ts
          ? ts.toLocaleString('en-US', {
              year: 'numeric', month: 'short', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
            })
          : null,
      };
    };

    return res.json({ cage1: format(cage1), cage2: format(cage2) });
  } catch (err) {
    console.error('Error fetching latest readings:', err);
    return res.status(500).json({ error: 'Failed to fetch latest readings' });
  }
});

module.exports = router;
