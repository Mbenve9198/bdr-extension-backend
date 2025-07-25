const mongoose = require('mongoose');

const keywordSchema = new mongoose.Schema({
  name: { type: String, required: true },
  estimatedValue: { type: Number },
  volume: { type: Number },
  cpc: { type: Number }
}, { _id: false });

const countrySchema = new mongoose.Schema({
  countryCode: { type: String, required: true },
  countryName: { type: String, required: true },
  countryUrlCode: { type: String },
  visitsShare: { type: Number, required: true },
  estimatedVisits: { type: Number }, // calcolato basandosi su visitsShare
  estimatedShipments: { type: Number } // calcolato con 2% conversion rate
}, { _id: false });

const ecommerceAnalysisSchema = new mongoose.Schema({
  prospect: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prospect'
  },
  analyzedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Dati base del sito
  url: { type: String, required: true },
  name: { type: String },
  title: { type: String },
  description: { type: String },
  category: { type: String },
  vertical: { type: String }, // derivato dalla category
  
  // Immagini
  icon: { type: String },
  previewDesktop: { type: String },
  previewMobile: { type: String },
  
  // Rankings
  globalRank: {
    rank: { type: Number }
  },
  countryRank: {
    countryCode: { type: String },
    rank: { type: Number }
  },
  categoryRank: {
    category: { type: String },
    rank: { type: Number }
  },
  globalCategoryRank: {
    category: { type: String },
    rank: { type: Number }
  },
  
  // Engagement metrics
  engagements: {
    visits: { type: Number },
    timeOnSite: { type: Number },
    pagePerVisit: { type: Number },
    bounceRate: { type: Number }
  },
  
  // Traffic sources
  trafficSources: {
    direct: { type: Number },
    referrals: { type: Number },
    social: { type: Number },
    mail: { type: Number },
    paidReferrals: { type: Number },
    search: { type: Number }
  },
  
  // Keywords
  topKeywords: [keywordSchema],
  
  // Paesi con visite e spedizioni stimate
  topCountries: [countrySchema],
  
  // Visite mensili (ultimi 3 mesi)
  estimatedMonthlyVisits: {
    type: Map,
    of: Number
  },
  
  // Metriche calcolate
  calculatedMetrics: {
    totalVisitsLast3Months: { type: Number },
    averageMonthlyVisits: { type: Number },
    estimatedMonthlyShipments: { type: Number },
    estimatedShipmentsLast3Months: { type: Number }, // Manteniamo per compatibilità
    conversionRate: { type: Number, default: 0.02 }, // 2% default
    growthRate: { type: Number }, // crescita percentuale
    topCountryByVisits: { type: String },
    topCountryByShipments: { type: String }
  },
  
  // Metadati Apify
  apifyData: {
    runId: { type: String },
    actorId: { type: String },
    scrapedAt: { type: Date },
    snapshotDate: { type: Date },
    processingTime: { type: Number } // in millisecondi
  },
  
  // Status dell'analisi
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed', 'partial'],
    default: 'processing'
  },
  
  // Errori se presenti
  errorLogs: [{
    message: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Qualità dei dati
  dataQuality: {
    completeness: { type: Number, min: 0, max: 100 }, // percentuale completezza dati
    confidence: { type: Number, min: 0, max: 100 }, // fiducia nei dati
    lastUpdated: { type: Date }
  }
  
}, {
  timestamps: true
});

// Indexes per performance
ecommerceAnalysisSchema.index({ prospect: 1 });
ecommerceAnalysisSchema.index({ analyzedBy: 1 });
ecommerceAnalysisSchema.index({ url: 1 });
ecommerceAnalysisSchema.index({ status: 1 });
ecommerceAnalysisSchema.index({ createdAt: -1 });
ecommerceAnalysisSchema.index({ 'calculatedMetrics.totalVisitsLast3Months': -1 });
ecommerceAnalysisSchema.index({ 'apifyData.scrapedAt': -1 });

// Middleware per calcolare le metriche automaticamente
ecommerceAnalysisSchema.pre('save', function(next) {
  if (this.isModified('estimatedMonthlyVisits') || this.isModified('topCountries')) {
    this.calculateMetrics();
  }
  next();
});

// Metodo per calcolare metriche derivate
ecommerceAnalysisSchema.methods.calculateMetrics = function() {
  // Calcola totale visite ultimi 3 mesi
  if (this.estimatedMonthlyVisits && this.estimatedMonthlyVisits.size > 0) {
    this.calculatedMetrics.totalVisitsLast3Months = Array.from(this.estimatedMonthlyVisits.values())
      .reduce((sum, visits) => sum + visits, 0);
    
    this.calculatedMetrics.averageMonthlyVisits = 
      this.calculatedMetrics.totalVisitsLast3Months / this.estimatedMonthlyVisits.size;
  }
  
  // Calcola spedizioni stimate mensili (2% conversion rate)
  if (this.calculatedMetrics.averageMonthlyVisits) {
    this.calculatedMetrics.estimatedMonthlyShipments = 
      Math.round(this.calculatedMetrics.averageMonthlyVisits * this.calculatedMetrics.conversionRate);
    // Manteniamo per compatibilità ma ora rappresenta le spedizioni mensili
    this.calculatedMetrics.estimatedShipmentsLast3Months = this.calculatedMetrics.estimatedMonthlyShipments;
  }
  
  // Calcola spedizioni per paese (mensili)
  if (this.topCountries && this.topCountries.length > 0 && this.calculatedMetrics.averageMonthlyVisits) {
    this.topCountries.forEach(country => {
      country.estimatedVisits = Math.round(this.calculatedMetrics.averageMonthlyVisits * country.visitsShare);
      country.estimatedShipments = Math.round(country.estimatedVisits * this.calculatedMetrics.conversionRate);
    });
    
    // Trova top country per visite e spedizioni
    const topByVisits = this.topCountries.reduce((max, country) => 
      country.visitsShare > max.visitsShare ? country : max);
    const topByShipments = this.topCountries.reduce((max, country) => 
      country.estimatedShipments > max.estimatedShipments ? country : max);
    
    this.calculatedMetrics.topCountryByVisits = topByVisits.countryName;
    this.calculatedMetrics.topCountryByShipments = topByShipments.countryName;
  }
  
  // Estrai vertical dalla category
  if (this.category) {
    const categoryParts = this.category.toLowerCase().split('/');
    this.vertical = categoryParts[categoryParts.length - 1].replace(/_/g, ' ');
  }
};

// Metodo per ottenere summary per il frontend
ecommerceAnalysisSchema.methods.getSummary = function() {
  return {
    name: this.name || this.url,
    vertical: this.vertical,
    totalVisitsLast3Months: this.calculatedMetrics.totalVisitsLast3Months,
    averageMonthlyVisits: this.calculatedMetrics.averageMonthlyVisits,
    estimatedMonthlyShipments: this.calculatedMetrics.estimatedMonthlyShipments,
    estimatedShipmentsLast3Months: this.calculatedMetrics.estimatedShipmentsLast3Months, // Compatibilità
    topCountries: this.topCountries.slice(0, 5), // top 5 paesi
    category: this.category,
    status: this.status,
    analyzedAt: this.createdAt
  };
};

module.exports = mongoose.model('EcommerceAnalysis', ecommerceAnalysisSchema); 