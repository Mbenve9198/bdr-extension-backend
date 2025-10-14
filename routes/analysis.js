const express = require('express');
const { body } = require('express-validator');
const analysisController = require('../controllers/analysisController');
const { protect } = require('../middleware/auth');

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
router.post('/analyze', analyzeValidation, analysisController.analyzeEcommerce);
router.post('/batch', batchAnalyzeValidation, analysisController.analyzeBatch);

// Gestione risultati
router.get('/', analysisController.getAnalysisList);
router.get('/dashboard', analysisController.getDashboardStats);
router.get('/by-domain/:domain', analysisController.getAnalysisByDomain);
router.get('/:id', analysisController.getAnalysisById);
router.get('/:id/export', analysisController.exportAnalysis);

// Analisi Perplexity e raccomandazioni corrieri
router.post('/:id/perplexity', analysisController.generatePerplexityAnalysis);

// Ricerca ecommerce simili (nuovo flusso: Google Search + Analisi + Filtri)
router.post('/:id/similar', analysisController.findSimilarEcommerce);

// Gestione leads generati
router.get('/leads/my-leads', analysisController.getMyLeadsList);
router.get('/leads/:leadsId', analysisController.getSimilarLeads);
router.delete('/leads/:leadsId', analysisController.deleteSimilarLeads);
router.post('/leads/:leadsId/expand', analysisController.expandSimilarLeads); // Espandi ricerca
router.post('/leads/:leadsId/enrich/:leadIndex', analysisController.enrichSingleLead);

module.exports = router; 