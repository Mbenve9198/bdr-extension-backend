const mongoose = require('mongoose');

const similarLeadsSchema = new mongoose.Schema({
  // Riferimento all'analisi originale
  originalAnalysis: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EcommerceAnalysis',
    required: true
  },
  
  // BDR che ha generato i leads
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Query Google usata per la ricerca
  searchQuery: {
    type: String,
    required: true,
    trim: true
  },
  
  // Lista dei leads trovati
  leads: [{
    // Dati base
    url: {
      type: String,
      required: true
    },
    name: String,
    title: String,
    description: String,
    category: String,
    
    // Metriche visite
    averageMonthlyVisits: {
      type: Number,
      default: 0
    },
    
    // Spedizioni per paese
    shipmentsByCountry: [{
      countryName: String,
      countryCode: String,
      monthlyShipments: Number,
      monthlyVisits: Number,
      visitsShare: Number
    }],
    
    // Totali spedizioni
    totalMonthlyShipments: {
      type: Number,
      default: 0
    },
    monthlyShipmentsItaly: {
      type: Number,
      default: 0
    },
    monthlyShipmentsAbroad: {
      type: Number,
      default: 0
    },
    
    // Dati Google Search
    googleSearchPosition: Number,
    googleSearchDescription: String,
    
    // Status analisi
    analysisStatus: {
      type: String,
      enum: ['pending', 'analyzed', 'failed'],
      default: 'pending'
    },
    
    // Timestamp analisi
    analyzedAt: Date,
    
    // Errori eventuali
    error: String,
    
    // Note aggiuntive
    notes: String
  }],
  
  // Statistiche della ricerca
  searchStats: {
    type: {
      totalUrlsFound: {
        type: Number,
        default: 0
      },
      totalUrlsAnalyzed: {
        type: Number,
        default: 0
      },
      totalUrlsQualified: {
        type: Number,
        default: 0
      },
      totalUrlsFailed: {
        type: Number,
        default: 0
      }
    },
    default: () => ({
      totalUrlsFound: 0,
      totalUrlsAnalyzed: 0,
      totalUrlsQualified: 0,
      totalUrlsFailed: 0
    })
  },
  
  // Filtri applicati
  filters: {
    type: {
      minShipmentsItaly: {
        type: Number,
        default: 100
      },
      minShipmentsAbroad: {
        type: Number,
        default: 30
      },
      maxShipmentsItaly: {
        type: Number,
        default: 10000
      }
    },
    default: () => ({
      minShipmentsItaly: 100,
      minShipmentsAbroad: 30,
      maxShipmentsItaly: 10000
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
similarLeadsSchema.index({ generatedBy: 1, createdAt: -1 });
similarLeadsSchema.index({ originalAnalysis: 1 });
similarLeadsSchema.index({ status: 1 });
similarLeadsSchema.index({ 'leads.url': 1 });

// Metodo per ottenere solo i leads qualificati
similarLeadsSchema.methods.getQualifiedLeads = function() {
  return this.leads.filter(lead => lead.analysisStatus === 'analyzed');
};

// Metodo per ottenere summary
similarLeadsSchema.methods.getSummary = function() {
  return {
    _id: this._id,
    searchQuery: this.searchQuery,
    status: this.status,
    stats: this.searchStats,
    filters: this.filters,
    qualifiedLeads: this.getQualifiedLeads().length,
    createdAt: this.createdAt,
    processingTime: this.processingTime
  };
};

module.exports = mongoose.model('SimilarLeads', similarLeadsSchema);

