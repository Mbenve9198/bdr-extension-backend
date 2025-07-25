const EcommerceAnalysis = require('../models/EcommerceAnalysis');
const Prospect = require('../models/Prospect');
const User = require('../models/User');
const apifyService = require('../services/apifyService');
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

    const { url, prospectId } = req.body;
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

    // Controlla se esiste già un'analisi recente per questo URL
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