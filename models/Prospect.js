const mongoose = require('mongoose');

const prospectSchema = new mongoose.Schema({
  url: {
    type: String,
    required: [true, 'URL è obbligatorio'],
    trim: true,
    lowercase: true,
    match: [/^https?:\/\/.+\..+/, 'URL non valido']
  },
  domain: {
    type: String,
    trim: true,
    lowercase: true
  },
  name: {
    type: String,
    trim: true,
    maxlength: [200, 'Nome non può superare 200 caratteri']
  },
  company: {
    type: String,
    trim: true,
    maxlength: [200, 'Nome azienda non può superare 200 caratteri']
  },
  industry: {
    type: String,
    trim: true,
    enum: [
      'fashion',
      'electronics',
      'home_garden', 
      'health_beauty',
      'sports_outdoors',
      'books_media',
      'food_beverage',
      'jewelry_luxury',
      'automotive',
      'toys_games',
      'pets',
      'other'
    ]
  },
  status: {
    type: String,
    enum: ['pending', 'analyzing', 'completed', 'failed', 'qualified', 'contacted'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag non può superare 50 caratteri']
  }],
  notes: {
    type: String,
    maxlength: [1000, 'Note non possono superare 1000 caratteri']
  },
  contactInfo: {
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email non valida']
    },
    phone: {
      type: String,
      trim: true
    },
    contactPerson: {
      type: String,
      trim: true,
      maxlength: [100, 'Nome contatto non può superare 100 caratteri']
    },
    position: {
      type: String,
      trim: true,
      maxlength: [100, 'Posizione non può superare 100 caratteri']
    }
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastAnalyzed: {
    type: Date
  },
  analysisCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes per performance
prospectSchema.index({ url: 1 });
prospectSchema.index({ domain: 1 });
prospectSchema.index({ status: 1 });
prospectSchema.index({ addedBy: 1 });
prospectSchema.index({ assignedTo: 1 });
prospectSchema.index({ createdAt: -1 });
prospectSchema.index({ industry: 1 });

// Middleware per estrarre il dominio dall'URL
prospectSchema.pre('save', function(next) {
  if (this.isModified('url') && this.url) {
    try {
      // Assicuriamoci che l'URL abbia un protocollo
      let urlToProcess = this.url;
      if (!urlToProcess.startsWith('http://') && !urlToProcess.startsWith('https://')) {
        urlToProcess = 'https://' + urlToProcess;
      }
      
      const urlObj = new URL(urlToProcess);
      this.domain = urlObj.hostname.replace('www.', '');
    } catch (error) {
      console.error('Errore estrazione dominio:', error.message, 'URL:', this.url);
      return next(new Error(`URL non valido: ${this.url}`));
    }
  }
  next();
});

module.exports = mongoose.model('Prospect', prospectSchema); 