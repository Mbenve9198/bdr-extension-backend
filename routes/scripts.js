const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const scriptController = require('../controllers/scriptController');

// Genera nuovo script
router.post('/generate', 
  auth,
  [
    body('analysisId')
      .notEmpty()
      .withMessage('ID analisi richiesto')
      .isMongoId()
      .withMessage('ID analisi non valido'),
    body('language')
      .optional()
      .isIn(['it', 'en', 'es', 'fr', 'de'])
      .withMessage('Lingua non supportata')
  ],
  scriptController.generateScript
);

// Ottieni script per ID
router.get('/:id', auth, scriptController.getScriptById);

// Lista script
router.get('/', auth, scriptController.getScriptsList);

// Ottieni script per analisi
router.get('/analysis/:analysisId', auth, scriptController.getScriptByAnalysis);

module.exports = router; 