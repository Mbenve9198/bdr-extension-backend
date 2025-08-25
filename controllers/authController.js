const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const User = require('../models/User');

// Genera JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Registra nuovo utente
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    // Controlla errori di validazione
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dati non validi',
        errors: errors.array()
      });
    }

    const { username, email, password, firstName, lastName, company, phone } = req.body;

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
        message: existingUser.email === email.toLowerCase() 
          ? 'Email già registrata' 
          : 'Username già in uso'
      });
    }

    // Crea nuovo utente
    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      company,
      phone
    });

    // Genera token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Utente registrato con successo',
      data: {
        user: user.toJSON(),
        token
      }
    });

  } catch (error) {
    console.error('Errore registrazione:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// @desc    Login utente
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dati non validi',
        errors: errors.array()
      });
    }

    const { login, password } = req.body;

    // Trova utente per email o username
    const user = await User.findOne({
      $or: [
        { email: login.toLowerCase() },
        { username: login.toLowerCase() }
      ]
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenziali non valide'
      });
    }

    // Controlla se account è attivo
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account disattivato. Contatta l\'amministratore.'
      });
    }

    // Verifica password
    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Credenziali non valide'
      });
    }

    // Aggiorna ultimo login
    user.lastLogin = new Date();
    await user.save();

    // Genera token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login effettuato con successo',
      data: {
        user: user.toJSON(),
        token
      }
    });

  } catch (error) {
    console.error('Errore login:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// @desc    Ottieni profilo utente corrente
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Errore getMe:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// @desc    Aggiorna profilo utente
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dati non validi',
        errors: errors.array()
      });
    }

    const { firstName, lastName, company, phone } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        firstName,
        lastName,
        company,
        phone
      },
      {
        new: true,
        runValidators: true
      }
    );

    res.json({
      success: true,
      message: 'Profilo aggiornato con successo',
      data: user
    });

  } catch (error) {
    console.error('Errore updateProfile:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// @desc    Cambia password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dati non validi',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Trova utente con password
    const user = await User.findById(req.user._id).select('+password');

    // Verifica password corrente
    const isCurrentPasswordCorrect = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordCorrect) {
      return res.status(400).json({
        success: false,
        message: 'Password corrente non valida'
      });
    }

    // Aggiorna password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password cambiata con successo'
    });

  } catch (error) {
    console.error('Errore changePassword:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// @desc    Logout (client-side, invalida token)
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logout effettuato con successo'
    });
  } catch (error) {
    console.error('Errore logout:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
}; 