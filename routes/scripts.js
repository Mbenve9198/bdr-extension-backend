const express = require('express');
const router = express.Router();

// Middleware auth base (senza import esterno per ora)
const simpleAuth = (req, res, next) => {
  // Skip auth per test - solo per deploy iniziale
  next();
};

// Test endpoint semplici
router.post('/generate', simpleAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Test generate endpoint funziona',
      data: { test: true }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Scripts API is working' });
});

router.get('/:id', simpleAuth, (req, res) => {
  res.json({ 
    success: true, 
    message: 'getScriptById test', 
    data: { id: req.params.id } 
  });
});

router.get('/', simpleAuth, (req, res) => {
  res.json({ 
    success: true, 
    message: 'getScriptsList test', 
    data: [] 
  });
});

module.exports = router; 