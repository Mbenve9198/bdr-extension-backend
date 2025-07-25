const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Validazioni per registrazione
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username deve essere tra 3 e 30 caratteri')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username può contenere solo lettere, numeri e underscore'),
  body('email')
    .isEmail()
    .withMessage('Email non valida')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password deve essere almeno 6 caratteri')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password deve contenere almeno una lettera minuscola, maiuscola e un numero'),
  body('firstName')
    .isLength({ min: 2, max: 50 })
    .withMessage('Nome deve essere tra 2 e 50 caratteri')
    .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
    .withMessage('Nome può contenere solo lettere e spazi'),
  body('lastName')
    .isLength({ min: 2, max: 50 })
    .withMessage('Cognome deve essere tra 2 e 50 caratteri')
    .matches(/^[a-zA-ZÀ-ÿ\s]+$/)
    .withMessage('Cognome può contenere solo lettere e spazi'),
  body('company')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Nome azienda non può superare 100 caratteri'),
  body('phone')
    .optional()
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Numero di telefono non valido')
];

// Validazioni per login
const loginValidation = [
  body('login')
    .notEmpty()
    .withMessage('Email o username richiesto'),
  body('password')
    .notEmpty()
    .withMessage('Password richiesta')
];

// Validazioni per aggiornamento profilo
const updateProfileValidation = [
  body('firstName')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Nome deve essere tra 2 e 50 caratteri'),
  body('lastName')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Cognome deve essere tra 2 e 50 caratteri'),
  body('company')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Nome azienda non può superare 100 caratteri'),
  body('phone')
    .optional()
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Numero di telefono non valido')
];

// Validazioni per cambio password
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Password corrente richiesta'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Nuova password deve essere almeno 6 caratteri')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password deve contenere almeno una lettera minuscola, maiuscola e un numero')
];

// Routes pubbliche
router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);

// Routes protette
router.get('/me', protect, authController.getMe);
router.put('/profile', protect, updateProfileValidation, authController.updateProfile);
router.put('/change-password', protect, changePasswordValidation, authController.changePassword);
router.post('/logout', protect, authController.logout);

module.exports = router; 