const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const amazonController = require('../controllers/amazonController');

// Tutte le route richiedono autenticazione
router.use(protect);

/**
 * @route   POST /api/amazon/find-sellers
 * @desc    Avvia ricerca venditori Amazon da URL Amazon
 * @access  Private (BDR, Manager, Admin)
 */
router.post('/find-sellers', amazonController.findAmazonSellers);

/**
 * @route   GET /api/amazon/sellers/:sellersId
 * @desc    Ottieni risultati ricerca venditori Amazon
 * @access  Private (Proprietario o Admin/Manager)
 */
router.get('/sellers/:sellersId', amazonController.getAmazonSellers);

/**
 * @route   GET /api/amazon/my-searches
 * @desc    Lista tutte le ricerche venditori dell'utente
 * @access  Private (BDR vede solo le proprie, Admin/Manager vedono tutte)
 */
router.get('/my-searches', amazonController.getMySearchesList);

/**
 * @route   DELETE /api/amazon/sellers/:sellersId
 * @desc    Cancella una ricerca venditori
 * @access  Private (Solo proprietario)
 */
router.delete('/sellers/:sellersId', amazonController.deleteAmazonSellers);

module.exports = router;


