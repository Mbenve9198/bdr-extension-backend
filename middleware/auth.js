const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware per verificare il token JWT
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Controlla se il token è nell'header Authorization
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Accesso negato. Token non fornito.'
      });
    }

    // Verifica il token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Trova l'utente
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token non valido. Utente non trovato.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account disattivato.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Errore autenticazione:', error);
    res.status(401).json({
      success: false,
      message: 'Token non valido.'
    });
  }
};

// Middleware per controllare i ruoli
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato. Permessi insufficienti.'
      });
    }
    next();
  };
};

 