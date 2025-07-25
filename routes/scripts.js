const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');

// Test semplice senza import del controller
const testController = {
  generateScript: async (req, res) => {
    res.json({
      success: true,
      message: 'Test endpoint funziona',
      data: { test: true }
    });
  }
};

// Genera nuovo script (test)
router.post('/generate', auth, testController.generateScript);

// Ottieni script per ID (test)
router.get('/:id', auth, (req, res) => {
  res.json({ success: true, message: 'getScriptById test', data: null });
});

// Lista script (test)
router.get('/', auth, (req, res) => {
  res.json({ success: true, message: 'getScriptsList test', data: [] });
});

// Ottieni script per analisi (test)
router.get('/analysis/:analysisId', auth, (req, res) => {
  res.json({ success: true, message: 'getScriptByAnalysis test', data: null });
});

module.exports = router; 