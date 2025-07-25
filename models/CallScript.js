const mongoose = require('mongoose');

const callScriptSchema = new mongoose.Schema({
  // Riferimenti
  analysis: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EcommerceAnalysis',
    required: true
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Dati sito
  siteName: { type: String, required: true },
  siteUrl: { type: String, required: true },
  
  // Report Perplexity
  perplexityReport: {
    couriers: [String], // corrieri utilizzati
    averageOrderValue: { type: Number }, // valore medio carrello
    averagePackageWeight: { type: Number }, // peso medio pacchi
    usesInsurance: { type: Boolean }, // usa assicurazione
    reviews: {
      googleMaps: { type: Number }, // numero recensioni Google Maps
      trustpilot: { type: Number }, // numero recensioni Trustpilot
      averageRating: { type: Number } // rating medio
    },
    additionalInfo: { type: String }, // info aggiuntive trovate
    rawResponse: { type: String } // risposta completa Perplexity
  },
  
  // Script generato
  script: {
    language: { 
      type: String, 
      enum: ['it', 'en', 'es', 'fr', 'de'], 
      default: 'it' 
    },
    hook: { type: String, required: true }, // hook di apertura
    qualificationQuestions: [String], // domande di qualificazione
    pricingSuggestions: {
      recommendedCouriers: [{
        name: String,
        service: String,
        standardPrice: String,
        discountedPrice: String,
        countries: [String]
      }],
      insuranceInfo: {
        national: String, // 0.6%
        international: String // 1.5%
      }
    },
    closingNotes: { type: String }, // note di chiusura
    fullScript: { type: String, required: true } // script completo
  },
  
  // Metadati
  isInternational: { type: Boolean, default: false }, // se spedisce all'estero >10%
  topCountries: [String], // paesi principali
  estimatedShipments: { type: Number }, // spedizioni stimate mensili
  
  // Status
  status: {
    type: String,
    enum: ['generating', 'completed', 'failed'],
    default: 'generating'
  },
  
  // Errori se presenti
  errorLogs: [{
    message: { type: String },
    timestamp: { type: Date, default: Date.now }
  }]
  
}, {
  timestamps: true
});

// Indexes
callScriptSchema.index({ analysis: 1 });
callScriptSchema.index({ generatedBy: 1 });
callScriptSchema.index({ createdAt: -1 });

// Metodo per ottenere summary
callScriptSchema.methods.getSummary = function() {
  return {
    _id: this._id,
    siteName: this.siteName,
    siteUrl: this.siteUrl,
    language: this.script.language,
    isInternational: this.isInternational,
    estimatedShipments: this.estimatedShipments,
    status: this.status,
    createdAt: this.createdAt,
    hook: this.script.hook?.substring(0, 100) + '...' // preview hook
  };
};

module.exports = mongoose.model('CallScript', callScriptSchema); 