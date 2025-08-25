const express = require('express');
const { body } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Validazioni per creazione utente
const createUserValidation = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username deve essere tra 3 e 30 caratteri'),
  body('email')
    .isEmail()
    .withMessage('Email non valida'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password deve essere almeno 6 caratteri'),
  body('firstName')
    .isLength({ min: 2, max: 50 })
    .withMessage('Nome deve essere tra 2 e 50 caratteri'),
  body('lastName')
    .isLength({ min: 2, max: 50 })
    .withMessage('Cognome deve essere tra 2 e 50 caratteri'),
  body('role')
    .isIn(['bdr', 'admin', 'manager'])
    .withMessage('Ruolo non valido')
];

// Validazioni per aggiornamento utente
const updateUserValidation = [
  body('username')
    .optional()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username deve essere tra 3 e 30 caratteri'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Email non valida'),
  body('firstName')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Nome deve essere tra 2 e 50 caratteri'),
  body('lastName')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Cognome deve essere tra 2 e 50 caratteri'),
  body('role')
    .optional()
    .isIn(['bdr', 'admin', 'manager'])
    .withMessage('Ruolo non valido'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive deve essere booleano'),
  body('monthlyAnalysisLimit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Limite analisi deve essere numero positivo')
];

// Routes protette - solo admin e manager
router.use(protect);
router.use(authorize('admin', 'manager'));

// @desc    Lista tutti gli utenti
// @route   GET /api/users
// @access  Private (Admin/Manager)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      role,
      isActive,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [users, total] = await Promise.all([
      User.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Errore getUsers:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @desc    Crea nuovo utente
// @route   POST /api/users
// @access  Private (Admin)
router.post('/', authorize('admin'), createUserValidation, async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, role, company, phone, monthlyAnalysisLimit } = req.body;

    // Controlla se utente esiste già
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email o username già in uso'
      });
    }

    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      role,
      company,
      phone,
      monthlyAnalysisLimit: monthlyAnalysisLimit || null
    });

    res.status(201).json({
      success: true,
      message: 'Utente creato con successo',
      data: user
    });

  } catch (error) {
    console.error('Errore createUser:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @desc    Ottieni utente per ID
// @route   GET /api/users/:id
// @access  Private (Admin/Manager)
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Errore getUserById:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @desc    Aggiorna utente
// @route   PUT /api/users/:id
// @access  Private (Admin)
router.put('/:id', authorize('admin'), updateUserValidation, async (req, res) => {
  try {
    const { username, email, firstName, lastName, role, company, phone, isActive, monthlyAnalysisLimit } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato'
      });
    }

    // Controlla duplicati se email o username sono cambiati
    if ((email && email !== user.email) || (username && username !== user.username)) {
      const existingUser = await User.findOne({
        _id: { $ne: req.params.id },
        $or: [
          { email: email?.toLowerCase() || user.email },
          { username: username?.toLowerCase() || user.username }
        ]
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email o username già in uso'
        });
      }
    }

    // Aggiorna campi
    if (username) user.username = username.toLowerCase();
    if (email) user.email = email.toLowerCase();
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (role) user.role = role;
    if (company !== undefined) user.company = company;
    if (phone !== undefined) user.phone = phone;
    if (isActive !== undefined) user.isActive = isActive;
    if (monthlyAnalysisLimit) user.monthlyAnalysisLimit = monthlyAnalysisLimit;

    await user.save();

    res.json({
      success: true,
      message: 'Utente aggiornato con successo',
      data: user
    });

  } catch (error) {
    console.error('Errore updateUser:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @desc    Elimina utente (soft delete)
// @route   DELETE /api/users/:id
// @access  Private (Admin)
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato'
      });
    }

    // Non permettere eliminazione del proprio account
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Non puoi eliminare il tuo proprio account'
      });
    }

    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: 'Utente disattivato con successo'
    });

  } catch (error) {
    console.error('Errore deleteUser:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @desc    Statistiche utenti
// @route   GET /api/users/stats/overview
// @access  Private (Admin/Manager)
router.get('/stats/overview', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      usersByRole,
      recentUsers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      User.find({ isActive: true })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('firstName lastName username role createdAt')
    ]);

    res.json({
      success: true,
      data: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        byRole: usersByRole,
        recent: recentUsers
      }
    });

  } catch (error) {
    console.error('Errore getUserStats:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

module.exports = router; 