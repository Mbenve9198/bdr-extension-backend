const mongoose = require('mongoose');

const amazonSellersSchema = new mongoose.Schema({
  // BDR che ha generato la ricerca
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // URL Amazon da cui è stata avviata la ricerca
  sourceUrl: {
    type: String,
    required: true,
    trim: true
  },
  
  // Marketplace Amazon (amazon.it, amazon.de, etc)
  marketplace: {
    type: String,
    required: true,
    enum: ['amazon.it', 'amazon.fr', 'amazon.de', 'amazon.es', 'amazon.co.uk', 'amazon.com']
  },
  
  // Query di ricerca (se presente nell'URL)
  searchQuery: {
    type: String,
    trim: true
  },
  
  // Lista dei venditori trovati
  sellers: [{
    // Dati prodotto da cui è stato trovato
    productAsin: String,
    productTitle: String,
    productUrl: String,
    
    // Dati venditore base
    sellerName: {
      type: String,
      required: true
    },
    sellerId: {
      type: String,
      required: true,
      index: true
    },
    sellerUrl: {
      type: String,
      required: true
    },
    
    // Dati compliance estratti da Gemini
    compliance: {
      sellerType: String,        // "Business" o "Individual"
      vatNumber: String,          // Partita IVA
      phoneNumber: String,        // Numero di telefono
      emailAddress: String,       // Email
      address: String,            // Indirizzo completo
      complianceStatement: String, // Dichiarazioni legali
      
      // Metadati estrazione
      marketplace: String,        // amazon.it, amazon.fr, etc
      languageDetected: String,   // it, fr, de, es, en
      extractedAt: Date,
      rawText: String            // Testo raw crawlato (per debug)
    },
    
    // Status analisi
    analysisStatus: {
      type: String,
      enum: ['pending', 'crawling', 'analyzing', 'completed', 'failed', 'rejected'],
      default: 'pending'
    },
    
    // Timestamp
    analyzedAt: Date,
    
    // Errori
    error: String,
    
    // Note
    notes: String,
    
    // Flag per venditori duplicati già processati
    isDuplicate: {
      type: Boolean,
      default: false
    }
  }],
  
  // Statistiche della ricerca
  searchStats: {
    type: {
      totalProductsScraped: {
        type: Number,
        default: 0
      },
      totalSellersFound: {
        type: Number,
        default: 0
      },
      totalSellersUnique: {
        type: Number,
        default: 0
      },
      totalSellersAnalyzed: {
        type: Number,
        default: 0
      },
      totalSellersQualified: {
        type: Number,
        default: 0
      },
      totalSellersRejected: {
        type: Number,
        default: 0
      }
    },
    default: () => ({
      totalProductsScraped: 0,
      totalSellersFound: 0,
      totalSellersUnique: 0,
      totalSellersAnalyzed: 0,
      totalSellersQualified: 0,
      totalSellersRejected: 0
    })
  },
  
  // Status della ricerca
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  
  // Durata della ricerca
  processingTime: {
    type: {
      startedAt: Date,
      completedAt: Date,
      durationMs: Number
    },
    default: () => ({})
  },
  
  // Note ed errori
  notes: String,
  errorLogs: [{
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]

}, {
  timestamps: true
});

// Indici per performance
amazonSellersSchema.index({ generatedBy: 1, createdAt: -1 });
amazonSellersSchema.index({ marketplace: 1 });
amazonSellersSchema.index({ status: 1 });
amazonSellersSchema.index({ 'sellers.sellerId': 1 });
amazonSellersSchema.index({ 'sellers.sellerUrl': 1 });

// Metodo per ottenere solo i venditori qualificati (con telefono italiano)
amazonSellersSchema.methods.getQualifiedSellers = function() {
  return this.sellers.filter(seller => {
    // Deve essere stato analizzato con successo
    if (seller.analysisStatus !== 'completed') return false;
    
    // Deve avere numero di telefono italiano (+39)
    const phone = seller.compliance?.phoneNumber || '';
    const hasItalianPhone = phone.includes('+39') || phone.startsWith('39') || phone.match(/^0\d{1,3}\s?\d+/);
    
    return hasItalianPhone;
  });
};

// Metodo per ottenere summary
amazonSellersSchema.methods.getSummary = function() {
  return {
    _id: this._id,
    sourceUrl: this.sourceUrl,
    marketplace: this.marketplace,
    searchQuery: this.searchQuery,
    status: this.status,
    stats: this.searchStats,
    qualifiedSellers: this.getQualifiedSellers().length,
    createdAt: this.createdAt,
    processingTime: this.processingTime
  };
};

module.exports = mongoose.model('AmazonSellers', amazonSellersSchema);


