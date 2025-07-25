const express = require('express');
const { body } = require('express-validator');
const prospectController = require('../controllers/prospectController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Validazioni per creazione prospect
const createProspectValidation = [
  body('url')
    .isURL({ require_protocol: true })
    .withMessage('URL valido richiesto (deve includere http:// o https://)'),
  body('name')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Nome deve essere tra 1 e 200 caratteri'),
  body('company')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Nome azienda deve essere tra 1 e 200 caratteri'),
  body('industry')
    .optional()
    .isIn(['fashion', 'electronics', 'home_garden', 'health_beauty', 'sports_outdoors', 
           'books_media', 'food_beverage', 'jewelry_luxury', 'automotive', 'toys_games', 'pets', 'other'])
    .withMessage('Settore non valido'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priorità non valida'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags deve essere un array'),
  body('tags.*')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Ogni tag deve essere tra 1 e 50 caratteri'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Note non possono superare 1000 caratteri'),
  body('contactInfo.email')
    .optional()
    .isEmail()
    .withMessage('Email contatto non valida'),
  body('contactInfo.phone')
    .optional()
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Numero di telefono contatto non valido'),
  body('contactInfo.contactPerson')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nome contatto deve essere tra 1 e 100 caratteri'),
  body('contactInfo.position')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Posizione deve essere tra 1 e 100 caratteri')
];

// Validazioni per aggiornamento prospect
const updateProspectValidation = [
  body('name')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Nome deve essere tra 1 e 200 caratteri'),
  body('company')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Nome azienda deve essere tra 1 e 200 caratteri'),
  body('industry')
    .optional()
    .isIn(['fashion', 'electronics', 'home_garden', 'health_beauty', 'sports_outdoors', 
           'books_media', 'food_beverage', 'jewelry_luxury', 'automotive', 'toys_games', 'pets', 'other'])
    .withMessage('Settore non valido'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priorità non valida'),
  body('status')
    .optional()
    .isIn(['pending', 'analyzing', 'completed', 'failed', 'qualified', 'contacted'])
    .withMessage('Status non valido'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags deve essere un array'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Note non possono superare 1000 caratteri')
];

// Validazioni per assegnazione
const assignValidation = [
  body('assignedTo')
    .isMongoId()
    .withMessage('ID utente non valido')
];

// Validazioni per importazione
const importValidation = [
  body('prospects')
    .isArray({ min: 1, max: 100 })
    .withMessage('Array di prospect richiesto (max 100)'),
  body('prospects.*.url')
    .isURL({ require_protocol: true })
    .withMessage('URL valido richiesto per ogni prospect')
];

// Routes per tutti gli utenti autenticati
router.use(protect);

// CRUD operations
router.post('/', createProspectValidation, prospectController.createProspect);
router.get('/', prospectController.getProspects);
router.get('/stats', prospectController.getProspectStats);
router.get('/:id', prospectController.getProspectById);
router.put('/:id', updateProspectValidation, prospectController.updateProspect);
router.delete('/:id', prospectController.deleteProspect);

// Operations per admin/manager
router.put('/:id/assign', authorize('admin', 'manager'), assignValidation, prospectController.assignProspect);
router.post('/import', importValidation, prospectController.importProspects);

module.exports = router; 