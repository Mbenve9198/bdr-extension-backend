const EcommerceAnalysis = require('../models/EcommerceAnalysis');
const Prospect = require('../models/Prospect');
const User = require('../models/User');
const apifyService = require('../services/apifyService');
const perplexityService = require('../services/perplexityService');
const { validationResult } = require('express-validator');

// Analizza un singolo ecommerce
exports.analyzeEcommerce = async (req, res) => {
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

    const { url, prospectId, forceNew } = req.body;
    const userId = req.user._id;

    // Valida URL
    try {
      apifyService.validateUrl(url);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Se è fornito un prospectId, verifica che esista
    let prospect = null;
    if (prospectId) {
      prospect = await Prospect.findById(prospectId);
      if (!prospect) {
        return res.status(404).json({
          success: false,
          message: 'Prospect non trovato'
        });
      }
    }

    // Controlla se esiste già un'analisi recente per questo URL (solo se non forceNew)
    if (!forceNew) {
      const existingAnalysis = await EcommerceAnalysis.findOne({
        url: url.toLowerCase(),
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // ultime 24 ore
        status: 'completed'
      }).sort({ createdAt: -1 });

      if (existingAnalysis) {
        console.log(`📋 Trovata analisi esistente per ${url}`);
        return res.json({
          success: true,
          message: 'Analisi esistente trovata',
          data: existingAnalysis.getSummary(),
          fromCache: true
        });
      }
    } else {
      console.log(`🔄 Forzata nuova analisi per ${url} (forceNew=true)`);
    }

    // Crea record analisi in stato 'processing'
    const analysisRecord = new EcommerceAnalysis({
      prospect: prospectId,
      analyzedBy: userId,
      url: url.toLowerCase(),
      status: 'processing'
    });

    await analysisRecord.save();

    // Aggiorna contatore utente
    await User.findByIdAndUpdate(userId, {
      $inc: { analysisCount: 1 },
      lastLogin: new Date()
    });

    // Aggiorna prospect se fornito
    if (prospect) {
      prospect.status = 'analyzing';
      prospect.lastAnalyzed = new Date();
      prospect.analysisCount += 1;
      await prospect.save();
    }

    try {
      // Esegui analisi Apify
      console.log(`🔍 Inizio analisi Apify per ${url}`);
      const apifyData = await apifyService.runAnalysis(url);

      // Aggiorna il record con i dati ricevuti
      Object.assign(analysisRecord, apifyData);
      await analysisRecord.save();

      // Aggiorna prospect con risultati
      if (prospect) {
        prospect.status = 'completed';
        prospect.name = apifyData.name || prospect.name;
        
        // Estrai industry dalla category se non già impostata
        if (!prospect.industry && apifyData.category) {
          const categoryMapping = {
            'lifestyle/jewelry_and_luxury_products': 'jewelry_luxury',
            'lifestyle/fashion': 'fashion',
            'ecommerce_and_shopping/electronics': 'electronics',
            'lifestyle/beauty_and_cosmetics': 'health_beauty'
          };
          prospect.industry = categoryMapping[apifyData.category.toLowerCase()] || 'other';
        }
        
        await prospect.save();
      }

      console.log(`✅ Analisi completata per ${url}`);

      res.json({
        success: true,
        message: 'Analisi completata con successo',
        data: analysisRecord.getSummary(),
        analysisId: analysisRecord._id
      });

    } catch (apifyError) {
      console.error(`❌ Errore analisi Apify per ${url}:`, apifyError.message);

      // Aggiorna record con errore
      analysisRecord.status = 'failed';
      analysisRecord.errorLogs.push({
        message: apifyError.message,
        timestamp: new Date()
      });
      await analysisRecord.save();

      // Aggiorna prospect se presente
      if (prospect) {
        prospect.status = 'failed';
        await prospect.save();
      }

      res.status(500).json({
        success: false,
        message: 'Errore durante l\'analisi',
        error: apifyError.message,
        analysisId: analysisRecord._id
      });
    }

  } catch (error) {
    console.error('Errore controller analyzeEcommerce:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Analizza batch di ecommerce
exports.analyzeBatch = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dati non validi',
        errors: errors.array()
      });
    }

    const { urls } = req.body;
    const userId = req.user._id;

    // Controlla limite batch (max 10 per richiesta)
    if (urls.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Massimo 10 URL per batch'
      });
    }

    const results = [];
    
    for (const url of urls) {
      try {
        apifyService.validateUrl(url);
        
        // Avvia analisi asincrona
        const runInfo = await apifyService.runAsyncAnalysis(url);
        
        // Crea record in processing
        const analysisRecord = new EcommerceAnalysis({
          analyzedBy: userId,
          url: url.toLowerCase(),
          status: 'processing',
          apifyData: {
            runId: runInfo.runId
          }
        });
        
        await analysisRecord.save();
        
        results.push({
          url,
          status: 'started',
          analysisId: analysisRecord._id,
          runId: runInfo.runId
        });
        
      } catch (error) {
        results.push({
          url,
          status: 'error',
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Avviate ${results.filter(r => r.status === 'started').length} analisi`,
      results
    });

  } catch (error) {
    console.error('Errore controller analyzeBatch:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Ottieni analisi più recente per dominio
exports.getAnalysisByDomain = async (req, res) => {
  try {
    const { domain } = req.params;
    
    if (!domain) {
      return res.status(400).json({
        success: false,
        message: 'Dominio richiesto'
      });
    }

    // Normalizza il dominio (rimuovi www, protocollo, etc.)
    const normalizedDomain = domain.toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '');

    console.log(`🔍 Cerca analisi per dominio: ${normalizedDomain}`);

    // Cerca l'analisi più recente per questo dominio
    const analysis = await EcommerceAnalysis.findOne({
      $or: [
        { url: { $regex: normalizedDomain, $options: 'i' } },
        { url: { $regex: `www.${normalizedDomain}`, $options: 'i' } }
      ],
      status: 'completed'
    })
    .sort({ createdAt: -1 })
    .populate('prospect', 'name url company industry')
    .populate('analyzedBy', 'firstName lastName username');

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Nessuna analisi trovata per questo dominio'
      });
    }

    // Controlla permessi (solo il creatore o admin/manager)
    if (analysis.analyzedBy._id.toString() !== req.user._id.toString() && 
        !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    console.log(`✅ Analisi trovata per ${normalizedDomain}: ${analysis._id}`);

    res.json({
      success: true,
      data: analysis,
      fromCache: true,
      message: 'Analisi esistente trovata'
    });

  } catch (error) {
    console.error('Errore getAnalysisByDomain:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Ottieni risultati analisi per ID
exports.getAnalysisById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const analysis = await EcommerceAnalysis.findById(id)
      .populate('prospect', 'name url company industry')
      .populate('analyzedBy', 'firstName lastName username');

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Analisi non trovata'
      });
    }

    // Controlla permessi (solo il creatore o admin/manager)
    if (analysis.analyzedBy._id.toString() !== req.user._id.toString() && 
        !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('Errore getAnalysisById:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Lista analisi con filtri e paginazione
exports.getAnalysisList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      dateFrom,
      dateTo
    } = req.query;

    const query = {};
    
    // Filtro per ruolo utente
    if (req.user.role === 'bdr') {
      query.analyzedBy = req.user._id;
    }

    // Filtri
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { url: { $regex: search, $options: 'i' } }
      ];
    }
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [analyses, total] = await Promise.all([
      EcommerceAnalysis.find(query)
        .populate('prospect', 'name company industry')
        .populate('analyzedBy', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      EcommerceAnalysis.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: analyses.map(analysis => analysis.getSummary()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Errore getAnalysisList:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Statistiche dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    
    // Query base per analisi
    const analysisQuery = userRole === 'bdr' ? { analyzedBy: userId } : {};
    const prospectQuery = userRole === 'bdr' ? { addedBy: userId } : {};

    // Date per filtri temporali
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));

    const [
      totalAnalyses,
      completedAnalyses,
      thisMonthAnalyses,
      thisWeekAnalyses,
      totalProspects,
      recentAnalyses,
      topCategories
    ] = await Promise.all([
      EcommerceAnalysis.countDocuments(analysisQuery),
      EcommerceAnalysis.countDocuments({ ...analysisQuery, status: 'completed' }),
      EcommerceAnalysis.countDocuments({ 
        ...analysisQuery, 
        createdAt: { $gte: startOfMonth } 
      }),
      EcommerceAnalysis.countDocuments({ 
        ...analysisQuery, 
        createdAt: { $gte: startOfWeek } 
      }),
      Prospect.countDocuments(prospectQuery),
      EcommerceAnalysis.find(analysisQuery)
        .populate('prospect', 'name company')
        .sort({ createdAt: -1 })
        .limit(5),
      EcommerceAnalysis.aggregate([
        { $match: { ...analysisQuery, status: 'completed' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalAnalyses,
          completedAnalyses,
          thisMonthAnalyses,
          thisWeekAnalyses,
          totalProspects,
          successRate: totalAnalyses > 0 ? 
            Math.round((completedAnalyses / totalAnalyses) * 100) : 0
        },
        recentAnalyses: recentAnalyses.map(a => a.getSummary()),
        topCategories
      }
    });

  } catch (error) {
    console.error('Errore getDashboardStats:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Esporta dati analisi
exports.exportAnalysis = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    const analysis = await EcommerceAnalysis.findById(id)
      .populate('prospect', 'name company industry tags')
      .populate('analyzedBy', 'firstName lastName username company');

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Analisi non trovata'
      });
    }

    // Controlla permessi
    if (analysis.analyzedBy._id.toString() !== req.user._id.toString() && 
        !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    if (format === 'json') {
      res.json({
        success: true,
        data: analysis
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Formato non supportato. Usa: json'
      });
    }

  } catch (error) {
    console.error('Errore exportAnalysis:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Genera analisi Perplexity e raccomandazioni corrieri
exports.generatePerplexityAnalysis = async (req, res) => {
  console.log('🤖 [PERPLEXITY] Richiesta ricevuta - ID:', req.params.analysisId);
  console.log('🤖 [PERPLEXITY] User ID:', req.user?._id);
  console.log('🤖 [PERPLEXITY] Headers:', req.headers.authorization ? 'Token presente' : 'Token mancante');
  
  try {
    const { analysisId } = req.params;
    const userId = req.user._id;

    // Trova l'analisi esistente
    const analysis = await EcommerceAnalysis.findById(analysisId)
      .populate('analyzedBy', 'firstName lastName email')
      .populate('prospect', 'companyName website');

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Analisi non trovata'
      });
    }

    // Controlla permessi
    if (analysis.analyzedBy._id.toString() !== userId.toString() && 
        !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    // Controlla se esiste già un'analisi Perplexity recente (ultime 24 ore)
    if (analysis.perplexityAnalysis && 
        analysis.perplexityAnalysis.analysisMetadata && 
        analysis.perplexityAnalysis.analysisMetadata.analyzedAt) {
      
      const lastAnalysis = new Date(analysis.perplexityAnalysis.analysisMetadata.analyzedAt);
      const now = new Date();
      const hoursDiff = (now - lastAnalysis) / (1000 * 60 * 60);
      
      if (hoursDiff < 24) {
        console.log(`📋 Analisi Perplexity esistente per ${analysis.url} (${hoursDiff.toFixed(1)}h fa)`);
        return res.json({
          success: true,
          message: 'Analisi Perplexity esistente trovata',
          data: {
            analysis: analysis.getSummary(),
            perplexityData: analysis.perplexityAnalysis,
            fromCache: true
          }
        });
      }
    }

    console.log(`🤖 Inizio analisi Perplexity per ${analysis.url}`);
    console.log('🤖 [PERPLEXITY] PerplexityService disponibile:', !!perplexityService);
    console.log('🤖 [PERPLEXITY] Metodo analyzeEcommerce disponibile:', typeof perplexityService.analyzeEcommerce);

    try {
      // Esegui analisi Perplexity
      const perplexityData = await perplexityService.analyzeEcommerce(
        analysis.url, 
        analysis.name || analysis.url
      );

      // Genera raccomandazioni corrieri basate sui paesi e peso stimato
      const averageWeight = perplexityData.averagePackageWeight?.value || 2; // Default 2kg
      const countries = analysis.topCountries || [];
      
      if (countries.length > 0) {
        const courierRecommendations = perplexityService.generateCourierRecommendations(
          countries, 
          averageWeight
        );
        perplexityData.recommendedCouriers = courierRecommendations;
      }

      // Salva i dati nell'analisi
      analysis.perplexityAnalysis = perplexityData;
      await analysis.save();

      console.log(`✅ Analisi Perplexity completata per ${analysis.url}`);

      res.json({
        success: true,
        message: 'Analisi Perplexity completata con successo',
        data: {
          analysis: analysis.getSummary(),
          perplexityData: perplexityData,
          fromCache: false
        }
      });

    } catch (perplexityError) {
      console.error('❌ Errore analisi Perplexity:', perplexityError.message);
      
      // Salva errore nell'analisi
      if (!analysis.errorLogs) analysis.errorLogs = [];
      analysis.errorLogs.push({
        message: `Errore Perplexity: ${perplexityError.message}`,
        timestamp: new Date()
      });
      await analysis.save();

      res.status(500).json({
        success: false,
        message: 'Errore nell\'analisi Perplexity',
        error: perplexityError.message
      });
    }

  } catch (error) {
    console.error('❌ [PERPLEXITY] Errore generatePerplexityAnalysis:', error);
    console.error('❌ [PERPLEXITY] Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      error: error.message
    });
  }
}; 