const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const sensorConfig = require('../config/sensorConfig');

function initSensorListener(prisma, options = {}) {
  if (!sensorConfig.isControllerConnected) {
    return { close: () => {} };
  }

  const {
    port = sensorConfig.port,
    baudRate = sensorConfig.baudRate,
    saveIntervalMs = sensorConfig.saveIntervalMs,
    conditionalSaveIntervalMs = sensorConfig.conditionalSaveIntervalMs,
    weightThresholdGrams = sensorConfig.weightThresholdGrams,
  } = options;

  const arduinoSerial = new SerialPort({ path: port, baudRate });
  const parser = arduinoSerial.pipe(new ReadlineParser({ delimiter: '\r\n' }));

  arduinoSerial.on('error', (err) => {
    console.error('Serial port error:', err);
  });

  let dataBuffer = [];
  let lastSaveTime = Date.now();
  let lastConditionalSaveTime = null;

  parser.on('data', (rawData) => {
    let parseData;
    try {
      parseData = JSON.parse(rawData);
    } catch (e) {
      console.warn('Invalid JSON from sensor:', rawData);
      return;
    }

    const { h, t, w } = parseData;

    handleConditionalWeightSave({ w });

    if (!isNaN(h) && !isNaN(t)) {
      dataBuffer.push({ h, t });

      if (Date.now() - lastSaveTime >= saveIntervalMs) {
        saveAverageToDB();
      }
    }
  });

  async function saveAverageToDB() {
    if (dataBuffer.length === 0) return;

    const avgH = parseFloat((dataBuffer.reduce((a, b) => a + b.h, 0) / dataBuffer.length).toFixed(2));
    const avgT = parseFloat((dataBuffer.reduce((a, b) => a + b.t, 0) / dataBuffer.length).toFixed(2));

    try {
      await prisma.sensorData.create({
        data: {
          cage: sensorConfig.cage,
          humidity: avgH,
          temperature: avgT,
          samples: dataBuffer.length,
        },
      });

      console.log(`[DB] Saved 5-min average: ${avgT}°C`);
      dataBuffer = [];
      lastSaveTime = Date.now();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleConditionalWeightSave({ w }) {
    const weight = Number(w);
    const now = Date.now();

    if (Number.isNaN(weight) || weight < weightThresholdGrams) {
      lastConditionalSaveTime = null;
      return;
    }

    if (lastConditionalSaveTime === null) {
      lastConditionalSaveTime = now;
      console.log(`[DB] Weight threshold met, starting save cycle (every ${conditionalSaveIntervalMs}ms): ${weight}g`);
      return;
    }

    if (now - lastConditionalSaveTime < conditionalSaveIntervalMs) return;

    try {
      await prisma.weightData.create({
        data: { cage: sensorConfig.cage, weight },
      });

      lastConditionalSaveTime = now;
      console.log(`[DB] Saved weight snapshot: ${weight}g`);
    } catch (e) {
      console.error('Failed to save weight snapshot:', e);
    }
  }

  return {
    close: () => {
      try {
        arduinoSerial.close();
      } catch (e) {
        console.error('Error closing serial port:', e);
      }
    },
  };
}

module.exports = { initSensorListener };
