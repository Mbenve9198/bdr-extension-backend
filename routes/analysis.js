const express = require('express');
const { body } = require('express-validator');
const analysisController = require('../controllers/analysisController');
const { protect, checkAnalysisLimit } = require('../middleware/auth');

const router = express.Router();

// Validazioni per analisi singola
const analyzeValidation = [
  body('url')
    .isURL({ require_protocol: true })
    .withMessage('URL valido richiesto (deve includere http:// o https://)'),
  body('prospectId')
    .optional()
    .isMongoId()
    .withMessage('ID prospect non valido')
];

// Validazioni per analisi batch
const batchAnalyzeValidation = [
  body('urls')
    .isArray({ min: 1, max: 10 })
    .withMessage('Array di URL richiesto (min 1, max 10)'),
  body('urls.*')
    .isURL({ require_protocol: true })
    .withMessage('Ogni URL deve essere valido')
];

// Routes protette
router.use(protect);

// Analisi ecommerce
router.post('/analyze', checkAnalysisLimit, analyzeValidation, analysisController.analyzeEcommerce);
router.post('/batch', checkAnalysisLimit, batchAnalyzeValidation, analysisController.analyzeBatch);

// Gestione risultati
router.get('/', analysisController.getAnalysisList);
router.get('/dashboard', analysisController.getDashboardStats);
router.get('/:id', analysisController.getAnalysisById);
router.get('/:id/export', analysisController.exportAnalysis);

module.exports = router; 