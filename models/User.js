const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username è obbligatorio'],
    unique: true,
    trim: true,
    minlength: [3, 'Username deve essere almeno 3 caratteri'],
    maxlength: [30, 'Username non può superare 30 caratteri']
  },
  email: {
    type: String,
    required: [true, 'Email è obbligatoria'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email non valida']
  },
  password: {
    type: String,
    required: [true, 'Password è obbligatoria'],
    minlength: [6, 'Password deve essere almeno 6 caratteri']
  },
  firstName: {
    type: String,
    required: [true, 'Nome è obbligatorio'],
    trim: true,
    maxlength: [50, 'Nome non può superare 50 caratteri']
  },
  lastName: {
    type: String,
    required: [true, 'Cognome è obbligatorio'],
    trim: true,
    maxlength: [50, 'Cognome non può superare 50 caratteri']
  },
  role: {
    type: String,
    enum: ['bdr', 'admin', 'manager'],
    default: 'bdr'
  },
  company: {
    type: String,
    trim: true,
    maxlength: [100, 'Nome azienda non può superare 100 caratteri']
  },
  phone: {
    type: String,
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Numero di telefono non valido']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  analysisCount: {
    type: Number,
    default: 0
  },
  monthlyAnalysisLimit: {
    type: Number,
    default: null // nessun limite
  }
}, {
  timestamps: true
});

// Index per performance (email e username già indicizzati tramite unique: true)
userSchema.index({ role: 1 });

// Hash password prima di salvare
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Metodo per confrontare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Metodo per ottenere info utente senza password
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

// Virtual per nome completo
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('User', userSchema); 