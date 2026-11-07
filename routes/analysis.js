const express = require('express');
const { prisma } = require('../database');

const router = express.Router();

const VISIT_GAP_MS = 30 * 1000;

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function groupIntoVisits(readings) {
  if (readings.length === 0) return [];

  const visits = [];
  let current = [readings[0]];

  for (let i = 1; i < readings.length; i++) {
    const gap = new Date(readings[i].timestamp) - new Date(readings[i - 1].timestamp);
    if (gap > VISIT_GAP_MS) {
      visits.push(current);
      current = [readings[i]];
    } else {
      current.push(readings[i]);
    }
  }
  visits.push(current);

  return visits;
}

function buildVisitStats(visitGroups) {
  return visitGroups.map((group, i) => {
    const start = new Date(group[0].timestamp);
    const end = new Date(group[group.length - 1].timestamp);
    const durationSeconds = Math.max(0, Math.round((end - start) / 1000));
    const avgWeight = group.reduce((sum, r) => sum + r.weight, 0) / group.length;

    return {
      visitNumber: i + 1,
      start: start.toISOString(),
      end: end.toISOString(),
      durationSeconds,
      duration: formatDuration(durationSeconds),
      averageWeightGrams: Math.round(avgWeight * 10) / 10,
      readings: group.length,
    };
  });
}

function buildSummary(visits) {
  if (visits.length === 0) {
    return {
      totalVisits: 0, totalNursingSeconds: 0, totalNursingTime: '0s',
      averageVisitSeconds: 0, averageVisitDuration: '0s', averageWeightGrams: 0,
      longestVisitSeconds: 0, longestVisitDuration: '0s',
      shortestVisitSeconds: 0, shortestVisitDuration: '0s',
      averageGapBetweenVisitsSeconds: null, averageGapBetweenVisits: null,
    };
  }

  const totalNursingSeconds = visits.reduce((s, v) => s + v.durationSeconds, 0);
  const avgVisitSeconds = Math.round(totalNursingSeconds / visits.length);
  const avgWeight = visits.reduce((s, v) => s + v.averageWeightGrams, 0) / visits.length;

  const durations = visits.map((v) => v.durationSeconds);
  const longest = Math.max(...durations);
  const shortest = Math.min(...durations);

  let avgGapSeconds = null;
  if (visits.length > 1) {
    const gaps = [];
    for (let i = 1; i < visits.length; i++) {
      gaps.push(Math.round((new Date(visits[i].start) - new Date(visits[i - 1].end)) / 1000));
    }
    avgGapSeconds = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  }

  return {
    totalVisits: visits.length,
    totalNursingSeconds,
    totalNursingTime: formatDuration(totalNursingSeconds),
    averageVisitSeconds: avgVisitSeconds,
    averageVisitDuration: formatDuration(avgVisitSeconds),
    averageWeightGrams: Math.round(avgWeight * 10) / 10,
    longestVisitSeconds: longest,
    longestVisitDuration: formatDuration(longest),
    shortestVisitSeconds: shortest,
    shortestVisitDuration: formatDuration(shortest),
    averageGapBetweenVisitsSeconds: avgGapSeconds,
    averageGapBetweenVisits: avgGapSeconds !== null ? formatDuration(avgGapSeconds) : null,
  };
}

function buildHourlyDistribution(visits) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, visits: 0, nursingSeconds: 0 }));
  for (const visit of visits) {
    const hour = new Date(visit.start).getHours();
    hours[hour].visits += 1;
    hours[hour].nursingSeconds += visit.durationSeconds;
  }
  return hours.filter((h) => h.visits > 0);
}

async function analyzeCage(cage, from, to) {
  const readings = await prisma.weightData.findMany({
    where: { cage, timestamp: { gte: from, lte: to } },
    orderBy: { timestamp: 'asc' },
  });

  const visitGroups = groupIntoVisits(readings);
  const visits = buildVisitStats(visitGroups);
  const summary = buildSummary(visits);
  const hourlyDistribution = buildHourlyDistribution(visits);

  return { cage, summary, hourlyDistribution, visits };
}

// GET /api/analysis/maternal?cage=1&from=<ISO>&to=<ISO>
router.get('/maternal', async (req, res) => {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from
    ? new Date(req.query.from)
    : new Date(to.getTime() - 24 * 60 * 60 * 1000);

  if (isNaN(from) || isNaN(to)) {
    return res.status(400).json({ error: 'Invalid date format for "from" or "to"' });
  }
  if (from >= to) {
    return res.status(400).json({ error: '"from" must be before "to"' });
  }

  const period = { from: from.toISOString(), to: to.toISOString() };

  try {
    if (req.query.cage !== undefined) {
      const cage = parseInt(req.query.cage);
      if (isNaN(cage)) {
        return res.status(400).json({ error: '"cage" must be a number' });
      }
      const result = await analyzeCage(cage, from, to);
      return res.json({ period, ...result });
    }

    const distinctRows = await prisma.weightData.findMany({
      select: { cage: true },
      distinct: ['cage'],
      where: { timestamp: { gte: from, lte: to } },
      orderBy: { cage: 'asc' },
    });
    const distinctCages = distinctRows.map((r) => r.cage);

    const cages = await Promise.all(distinctCages.map((cage) => analyzeCage(cage, from, to)));

    return res.json({ period, cages });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Failed to compute analysis' });
  }
});

module.exports = router;
