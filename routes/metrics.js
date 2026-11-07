const express = require('express');
const { prisma } = require('../database');
const sensorConfig = require('../config/sensorConfig');
const { adminOnly } = require('../middleware/auth');

const router = express.Router();

const validIntervals = {
  '1m':  1 * 60 * 1000,
  '5m':  5 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h':  60 * 60 * 1000,
};

function parseTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    const ms = numeric < 1e12 ? numeric * 1000 : numeric;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/metrics/temperature-humidity
router.get('/temperature-humidity', async (req, res) => {
  try {
    const { limit = 100, from, to, interval } = req.query;
    const intervalMs = interval ? validIntervals[String(interval)] : null;

    if (interval && !intervalMs) {
      return res.status(400).json({ error: 'Invalid interval. Use 1m, 5m, 30m, or 1h' });
    }

    let fromDate = parseTimestamp(from);
    let toDate = parseTimestamp(to);

    if ((from && !fromDate) || (to && !toDate)) {
      return res.status(400).json({
        error: 'Invalid from/to. Use Unix timestamp in seconds or milliseconds',
      });
    }

    if (!fromDate && !toDate) {
      toDate = new Date();
      fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000);
    }

    const where = { timestamp: {} };
    if (fromDate) where.timestamp.gte = fromDate;
    if (toDate) where.timestamp.lte = toDate;

    const docs = await prisma.sensorData.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: Math.min(parseInt(limit, 10) || 100, 1000),
    });

    const formatted = docs.map((doc) => {
      const ts = doc.timestamp ? new Date(doc.timestamp) : null;
      return {
        id: doc.id,
        cage: doc.cage,
        humidity: Math.round(doc.humidity * 100) / 100,
        temperature: Math.round(doc.temperature * 100) / 100,
        timestamp: ts ? ts.toISOString() : null,
        timestampLabel: ts
          ? ts.toLocaleString('en-US', {
              year: 'numeric', month: 'short', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
            })
          : null,
      };
    });

    if (!intervalMs) return res.json(formatted);

    const buckets = new Map();
    for (const row of formatted) {
      if (!row.timestamp) continue;
      const ts = new Date(row.timestamp).getTime();
      if (Number.isNaN(ts)) continue;

      const bucketStartMs = Math.floor(ts / intervalMs) * intervalMs;
      const key = `${row.cage}-${bucketStartMs}`;

      if (!buckets.has(key)) {
        buckets.set(key, { cage: row.cage, timestampMs: bucketStartMs, humiditySum: 0, humidityCount: 0, temperatureSum: 0, temperatureCount: 0 });
      }

      const bucket = buckets.get(key);
      if (typeof row.humidity === 'number') { bucket.humiditySum += row.humidity; bucket.humidityCount += 1; }
      if (typeof row.temperature === 'number') { bucket.temperatureSum += row.temperature; bucket.temperatureCount += 1; }
    }

    const aggregated = Array.from(buckets.values())
      .sort((a, b) => a.cage - b.cage || a.timestampMs - b.timestampMs)
      .map((bucket) => {
        const ts = new Date(bucket.timestampMs);
        return {
          id: `${bucket.cage}-${bucket.timestampMs}`,
          cage: bucket.cage,
          humidity: bucket.humidityCount ? Math.round((bucket.humiditySum / bucket.humidityCount) * 100) / 100 : null,
          temperature: bucket.temperatureCount ? Math.round((bucket.temperatureSum / bucket.temperatureCount) * 100) / 100 : null,
          timestamp: ts.toISOString(),
          timestampLabel: ts.toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
          }),
          interval: String(interval),
        };
      });

    return res.json(aggregated);
  } catch (err) {
    console.error('Error fetching sensor data:', err);
    res.status(500).json({ error: 'Failed to fetch sensor data' });
  }
});

// GET /api/metrics/weight
router.get('/weight', async (req, res) => {
  try {
    const { limit = 100, from, to, interval } = req.query;
    const intervalMs = interval ? validIntervals[String(interval)] : null;

    if (interval && !intervalMs) {
      return res.status(400).json({ error: 'Invalid interval. Use 1m, 5m, 30m, or 1h' });
    }

    let fromDate = parseTimestamp(from);
    let toDate = parseTimestamp(to);

    if ((from && !fromDate) || (to && !toDate)) {
      return res.status(400).json({
        error: 'Invalid from/to. Use Unix timestamp in seconds or milliseconds',
      });
    }

    if (!fromDate && !toDate) {
      toDate = new Date();
      fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000);
    }

    const where = { timestamp: {} };
    if (fromDate) where.timestamp.gte = fromDate;
    if (toDate) where.timestamp.lte = toDate;

    const docs = await prisma.weightData.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: Math.min(parseInt(limit, 10) || 100, 1000),
    });

    const formatted = docs.map((doc) => {
      const ts = doc.timestamp ? new Date(doc.timestamp) : null;
      return {
        id: doc.id,
        cage: doc.cage,
        weight: doc.weight,
        timestamp: ts ? ts.toISOString() : null,
        timestampLabel: ts
          ? ts.toLocaleString('en-US', {
              year: 'numeric', month: 'short', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
            })
          : null,
      };
    });

    if (!intervalMs) return res.json(formatted);

    const buckets = new Map();
    for (const row of formatted) {
      if (!row.timestamp) continue;
      const ts = new Date(row.timestamp).getTime();
      if (Number.isNaN(ts)) continue;

      const bucketStartMs = Math.floor(ts / intervalMs) * intervalMs;
      const key = String(bucketStartMs);

      if (!buckets.has(key)) {
        buckets.set(key, { timestampMs: bucketStartMs, weightSum: 0, weightCount: 0 });
      }

      const bucket = buckets.get(key);
      if (typeof row.weight === 'number') { bucket.weightSum += row.weight; bucket.weightCount += 1; }
    }

    const aggregated = Array.from(buckets.values())
      .sort((a, b) => a.timestampMs - b.timestampMs)
      .map((bucket) => {
        const ts = new Date(bucket.timestampMs);
        return {
          id: String(bucket.timestampMs),
          weight: bucket.weightCount ? bucket.weightSum / bucket.weightCount : null,
          timestamp: ts.toISOString(),
          timestampLabel: ts.toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
          }),
          interval: String(interval),
        };
      });

    return res.json(aggregated);
  } catch (err) {
    console.error('Error fetching weight data:', err);
    res.status(500).json({ error: 'Failed to fetch weight data' });
  }
});

// GET /api/metrics/thresholds
router.get('/thresholds', async (req, res) => {
  try {
    const saved = await prisma.thresholdSettings.findFirst();
    return res.json({
      temperatureThresholdDown: saved?.temperatureThresholdDown ?? sensorConfig.temperatureThresholdDown,
      temperatureThresholdUp:   saved?.temperatureThresholdUp   ?? sensorConfig.temperatureThresholdUp,
      weightThresholdGrams:     saved?.weightThresholdGrams      ?? sensorConfig.weightThresholdGrams,
      updatedAt: saved?.updatedAt ?? null,
    });
  } catch (err) {
    console.error('Error fetching thresholds:', err);
    return res.status(500).json({ error: 'Failed to fetch thresholds' });
  }
});

// PUT /api/metrics/thresholds
router.put('/thresholds', adminOnly, async (req, res) => {
  try {
    const { temperatureThresholdDown, temperatureThresholdUp, weightThresholdGrams } = req.body;

    const errors = [];
    if (typeof temperatureThresholdDown !== 'number') errors.push('"temperatureThresholdDown" must be a number');
    if (typeof temperatureThresholdUp !== 'number')   errors.push('"temperatureThresholdUp" must be a number');
    if (typeof weightThresholdGrams !== 'number')     errors.push('"weightThresholdGrams" must be a number');
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    if (weightThresholdGrams < 0) {
      return res.status(400).json({ error: '"weightThresholdGrams" must be >= 0' });
    }
    if (temperatureThresholdDown >= temperatureThresholdUp) {
      return res.status(400).json({ error: '"temperatureThresholdDown" must be less than "temperatureThresholdUp"' });
    }

    const data = { temperatureThresholdDown, temperatureThresholdUp, weightThresholdGrams };
    const existing = await prisma.thresholdSettings.findFirst();

    const updated = existing
      ? await prisma.thresholdSettings.update({ where: { id: existing.id }, data })
      : await prisma.thresholdSettings.create({ data });

    return res.json({
      temperatureThresholdDown: updated.temperatureThresholdDown,
      temperatureThresholdUp:   updated.temperatureThresholdUp,
      weightThresholdGrams:     updated.weightThresholdGrams,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    console.error('Error saving thresholds:', err);
    return res.status(500).json({ error: 'Failed to save thresholds' });
  }
});

module.exports = router;
