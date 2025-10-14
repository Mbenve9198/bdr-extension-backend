const EcommerceAnalysis = require('../models/EcommerceAnalysis');
const Prospect = require('../models/Prospect');
const User = require('../models/User');
const SimilarLeads = require('../models/SimilarLeads');
const apifyService = require('../services/apifyService');
const perplexityService = require('../services/perplexityService');
const { validationResult } = require('express-validator');

// Marketplace da escludere
const MARKETPLACE_BLACKLIST = [
  'amazon', 'ebay', 'etsy', 'zalando', 'asos', 'wish', 'aliexpress',
  'subito', 'vinted', 'wallapop', 'shein', 'temu', 'privalia',
  'yoox', 'farfetch', 'spartoo', 'eprice', 'trovaprezzi'
];

// Helper: Pulisce la query Google dalle spiegazioni
function cleanGoogleQuery(rawQuery) {
  if (!rawQuery) return '';
  
  // Rimuovi virgolette multiple
  let cleaned = rawQuery.replace(/^["']+|["']+$/g, '');
  
  // Cerca pattern tipo: "testo esplicativo: "query vera""
  const match = cleaned.match(/["']([^"']+)["']\s*$/);
  if (match) {
    cleaned = match[1];
  }
  
  // Se contiene "non essendo disponibili" o frasi simili, estrai solo la query tra virgolette
  if (cleaned.toLowerCase().includes('non essendo') || 
      cleaned.toLowerCase().includes('potrebb') ||
      cleaned.toLowerCase().includes('generica')) {
    const queryMatch = cleaned.match(/["']([^"']+)["']/g);
    if (queryMatch && queryMatch.length > 0) {
      // Prendi l'ultima query tra virgolette
      cleaned = queryMatch[queryMatch.length - 1].replace(/["']/g, '');
    }
  }
  
  // Rimuovi eventuali spiegazioni finali
  cleaned = cleaned.split(/\n/)[0].trim();
  cleaned = cleaned.replace(/^["']+|["']+$/g, '');
  
  return cleaned;
}

// Helper: Estrae dominio pulito da URL
function extractCleanDomain(url) {
  try {
    // Se l'URL contiene similarweb, estrai il vero dominio
    if (url.includes('similarweb.com/website/')) {
      const match = url.match(/similarweb\.com\/website\/([^\/\?]+)/i);
      if (match) {
        return match[1].toLowerCase();
      }
    }
    
    // Altrimenti estrai normalmente
    // Aggiungi protocollo se manca
    const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
    const urlObj = new URL(urlWithProtocol);
    return urlObj.hostname.replace(/^www\./i, '').toLowerCase();
  } catch (error) {
    console.error('Errore estrazione dominio:', error);
    // Fallback: rimuovi www. e protocollo manualmente
    return url.replace(/^(https?:\/\/)?(www\.)?/i, '').split('/')[0].toLowerCase();
  }
}

// Helper: Controlla se è un marketplace
function isMarketplace(url) {
  const domain = extractCleanDomain(url);
  return MARKETPLACE_BLACKLIST.some(marketplace => domain.includes(marketplace));
}

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
      originalUrl: url.toLowerCase(), // Salva URL originale prima che Apify lo sovrascriva
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
  console.log('🤖 [PERPLEXITY] Richiesta ricevuta - ID:', req.params.id);
  console.log('🤖 [PERPLEXITY] User ID:', req.user?._id);
  console.log('🤖 [PERPLEXITY] Headers:', req.headers.authorization ? 'Token presente' : 'Token mancante');
  
  try {
    const analysisId = req.params.id; // 🔥 CORRETTO: legge :id dal route
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
        
        const cacheResponseData = {
          analysis: analysis.getSummary(),
          perplexityData: analysis.perplexityAnalysis,
          fromCache: true
        };

        console.log('📤 [PERPLEXITY CACHE] Risposta da cache inviata al frontend:');
        console.log('=' * 50);
        console.log(JSON.stringify(cacheResponseData, null, 2));
        console.log('=' * 50);

        return res.json({
          success: true,
          message: 'Analisi Perplexity esistente trovata',
          data: cacheResponseData
        });
      }
    }

    console.log(`🤖 Inizio analisi Perplexity per ${analysis.url}`);
    console.log('🤖 [PERPLEXITY] PerplexityService disponibile:', !!perplexityService);
    console.log('🤖 [PERPLEXITY] Metodo analyzeEcommerce disponibile:', typeof perplexityService.analyzeEcommerce);

    try {
      // Esegui analisi Perplexity
      console.log('🔄 [PERPLEXITY] Inizio chiamata a perplexityService.analyzeEcommerce...');
      const perplexityData = await perplexityService.analyzeEcommerce(
        analysis.url, 
        analysis.name || analysis.url
      );
      console.log('✅ [PERPLEXITY] Analisi completata, dati ricevuti:', JSON.stringify(perplexityData, null, 2));

      // Genera raccomandazioni corrieri basate sui paesi e peso stimato
      const averageWeight = perplexityData.averagePackageWeight?.value || 2; // Default 2kg
      const countries = analysis.topCountries || [];
      
      console.log('🌍 [PERPLEXITY] Paesi per raccomandazioni corrieri:', countries.map(c => c.countryName));
      console.log('⚖️ [PERPLEXITY] Peso medio stimato:', averageWeight, 'kg');
      
      if (countries.length > 0) {
        console.log('🚚 [PERPLEXITY] Generazione raccomandazioni corrieri...');
        const courierRecommendations = perplexityService.generateCourierRecommendations(
          countries, 
          averageWeight
        );
        perplexityData.recommendedCouriers = courierRecommendations;
        console.log('📦 [PERPLEXITY] Corrieri raccomandati generati:', courierRecommendations.length, 'raccomandazioni');
        console.log('📦 [PERPLEXITY] Dettagli corrieri:', JSON.stringify(courierRecommendations, null, 2));
      } else {
        console.log('⚠️ [PERPLEXITY] Nessun paese disponibile per raccomandazioni corrieri');
      }

      // Salva i dati nell'analisi
      analysis.perplexityAnalysis = perplexityData;
      await analysis.save();

      console.log(`✅ Analisi Perplexity completata per ${analysis.url}`);

      const responseData = {
        analysis: analysis.getSummary(),
        perplexityData: perplexityData,
        fromCache: false
      };

      console.log('📤 [PERPLEXITY] Risposta finale inviata al frontend:');
      console.log('=' * 50);
      console.log(JSON.stringify(responseData, null, 2));
      console.log('=' * 50);

      res.json({
        success: true,
        message: 'Analisi Perplexity completata con successo',
        data: responseData
      });

    } catch (perplexityError) {
      console.error('❌ [PERPLEXITY ERROR] Errore analisi Perplexity:', perplexityError.message);
      console.error('❌ [PERPLEXITY ERROR] Stack completo:', perplexityError.stack);
      console.error('❌ [PERPLEXITY ERROR] Tipo errore:', perplexityError.constructor.name);
      if (perplexityError.response) {
        console.error('❌ [PERPLEXITY ERROR] Response status:', perplexityError.response.status);
        console.error('❌ [PERPLEXITY ERROR] Response data:', JSON.stringify(perplexityError.response.data, null, 2));
      }
      
      // Salva errore nell'analisi
      if (!analysis.errorLogs) analysis.errorLogs = [];
      analysis.errorLogs.push({
        message: `Errore Perplexity: ${perplexityError.message}`,
        timestamp: new Date()
      });
      await analysis.save();

      console.error('📤 [PERPLEXITY ERROR] Risposta di errore inviata al frontend:', {
        success: false,
        message: 'Errore nell\'analisi Perplexity',
        error: perplexityError.message
      });

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

// Trova ecommerce italiani simili usando Google Search + Filtri
exports.findSimilarEcommerce = async (req, res) => {
  console.log('🔍 [SIMILAR] Richiesta ricerca ecommerce simili - ID:', req.params.id);
  
  try {
    const analysisId = req.params.id;
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

    // Controlla se esiste già una ricerca recente (ultime 24 ore)
    const existingLeads = await SimilarLeads.findOne({
      originalAnalysis: analysisId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).sort({ createdAt: -1 });

    if (existingLeads && existingLeads.status === 'completed') {
      const hoursDiff = (new Date() - existingLeads.createdAt) / (1000 * 60 * 60);
      console.log(`📋 Leads esistenti per ${analysis.url} (${hoursDiff.toFixed(1)}h fa)`);
        
        return res.json({
          success: true,
        message: 'Leads già generati',
          data: {
          leads: existingLeads,
            fromCache: true
          }
        });
    }

    // Usa URL originale (quello rilevato dall'estensione)
    const urlForQuery = analysis.originalUrl || analysis.url;
    console.log(`🔍 Inizio ricerca ecommerce simili per ${urlForQuery}`);

    // Genera query Google PRIMA di creare il record
    console.log('📝 Generazione query Google...');
    let googleQuery;
    try {
      googleQuery = await perplexityService.generateGoogleQuery(
        urlForQuery,
        analysis.name,
        analysis.vertical || analysis.category
      );
      console.log(`✅ Query raw generata: "${googleQuery}"`);
      
      // Pulisci la query dalle spiegazioni
      googleQuery = cleanGoogleQuery(googleQuery);
      console.log(`✅ Query pulita: "${googleQuery}"`);
      
      if (!googleQuery || googleQuery.length < 3) {
        throw new Error('Query Google non valida o troppo corta');
      }
    } catch (queryError) {
      console.error('❌ Errore generazione query:', queryError);
      return res.status(500).json({
        success: false,
        message: 'Errore nella generazione della query Google',
        error: queryError.message
      });
    }

    // Crea record SimilarLeads con la query già popolata
    const similarLeads = new SimilarLeads({
      originalAnalysis: analysisId,
      generatedBy: userId,
      searchQuery: googleQuery,
      status: 'processing',
      processingTime: {
        startedAt: new Date()
      }
    });
    await similarLeads.save();

    // Risposta immediata al client
      res.json({
        success: true,
      message: 'Ricerca avviata. Il processo continuerà in background.',
        data: {
        leadsId: similarLeads._id,
        status: 'processing',
        searchQuery: googleQuery // Includi la query nella risposta
      }
    });

    // Processo asincrono in background
    processLeadsSearch(similarLeads._id, analysis, userId, googleQuery).catch(err => {
      console.error('❌ Errore processo leads:', err);
    });

  } catch (error) {
    console.error('❌ [SIMILAR] Errore findSimilarEcommerce:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      error: error.message
    });
  }
};

// Processo asincrono per la ricerca dei leads
async function processLeadsSearch(leadsId, analysis, userId, googleQuery) {
  const similarLeads = await SimilarLeads.findById(leadsId);
  
  try {
    console.log(`🚀 Inizio processo leads per ${analysis.url}`);
    console.log(`📝 Query Google: "${googleQuery}"`);

    // 1. Esegui Google Search con Apify
    console.log('🔍 Step 1: Google Search...');
    const searchResults = await apifyService.googleSearch(googleQuery);
    console.log(`✅ Trovati ${searchResults.length} risultati da Google`);
    
    similarLeads.searchStats.totalUrlsFound = searchResults.length;
    await similarLeads.save();

    // 2. Analizza ogni URL e filtra
    console.log('📊 Step 2: Analisi e filtraggio URLs...');
    const leads = [];
    const analyzedDomains = new Set(); // Track domini già analizzati
    
    for (const result of searchResults) {
      try {
        // Estrai dominio pulito
        const domain = extractCleanDomain(result.url);
        
        // Skip marketplace
        if (isMarketplace(result.url)) {
          console.log(`  ⛔ Saltato marketplace: ${domain}`);
          continue;
        }
        
        // Skip se dominio già analizzato in questa ricerca
        if (analyzedDomains.has(domain)) {
          console.log(`  ⏭️ Dominio già analizzato: ${domain}`);
          continue;
        }
        
        console.log(`  🔍 Analizzo: ${result.url} (dominio: ${domain})`);
        
        // Cerca analisi esistente nel database per questo dominio
        const existingAnalysis = await EcommerceAnalysis.findOne({
          $or: [
            { url: { $regex: domain.replace(/\./g, '\\.'), $options: 'i' } }
          ],
          status: 'completed'
        }).sort({ createdAt: -1 });
        
        let apifyData;
        let fromExistingAnalysis = false;
        
        if (existingAnalysis) {
          console.log(`  📋 Trovata analisi esistente per ${domain}`);
          apifyData = existingAnalysis.toObject();
          fromExistingAnalysis = true;
        } else {
          // Analizza con SimilarWeb tramite Apify
          apifyData = await apifyService.runAnalysis(result.url);
        }
        
        // Aggiungi dominio ai già analizzati
        analyzedDomains.add(domain);
        
        // Calcola spedizioni per paese
        const shipmentsByCountry = [];
        let monthlyShipmentsItaly = 0;
        let monthlyShipmentsAbroad = 0;
        
        for (const country of apifyData.topCountries || []) {
          const countryShipments = country.estimatedShipments || 0;
          
          shipmentsByCountry.push({
            countryName: country.countryName,
            countryCode: country.countryCode,
            monthlyShipments: countryShipments,
            monthlyVisits: country.estimatedVisits || 0,
            visitsShare: country.visitsShare || 0
          });
          
          // Distingui Italia vs Estero
          if (country.countryCode === 'IT' || country.countryName.toLowerCase().includes('ital')) {
            monthlyShipmentsItaly += countryShipments;
          } else {
            monthlyShipmentsAbroad += countryShipments;
          }
        }
        
        const totalMonthlyShipments = monthlyShipmentsItaly + monthlyShipmentsAbroad;
        
        // Applica filtri
        const qualifies = (
          (monthlyShipmentsItaly >= 100 || monthlyShipmentsAbroad >= 30) &&
          monthlyShipmentsItaly <= 10000
        );
        
        if (qualifies) {
          // Verifica se il lead esiste già in altri record (anche di altri utenti)
          const existingLead = await SimilarLeads.findOne({
            'leads.url': result.url,
            status: 'completed'
          }).populate('generatedBy', 'firstName lastName username');
          
          const leadData = {
            url: result.url, // Usa URL originale Google Search, non quello di SimilarWeb
            name: apifyData.name,
            title: result.title,
            description: result.description,
            category: apifyData.category,
            averageMonthlyVisits: apifyData.calculatedMetrics?.averageMonthlyVisits || 0,
            shipmentsByCountry: shipmentsByCountry,
            totalMonthlyShipments: totalMonthlyShipments,
            monthlyShipmentsItaly: monthlyShipmentsItaly,
            monthlyShipmentsAbroad: monthlyShipmentsAbroad,
            googleSearchPosition: result.position,
            googleSearchDescription: result.description,
            analysisStatus: 'analyzed',
            analyzedAt: new Date()
          };
          
          // Aggiungi nota se già presente in altri lead
          if (existingLead && fromExistingAnalysis) {
            leadData.notes = `Lead già presente in ricerca di ${existingLead.generatedBy?.firstName || 'altro utente'}`;
          } else if (fromExistingAnalysis) {
            leadData.notes = 'Analisi riutilizzata dal database';
          }
          
          leads.push(leadData);
          
          console.log(`  ✅ Lead qualificato: ${apifyData.name} (IT: ${monthlyShipmentsItaly}, Estero: ${monthlyShipmentsAbroad})${fromExistingAnalysis ? ' [RIUSATO]' : ''}`);
        } else {
          console.log(`  ❌ Non qualificato: IT: ${monthlyShipmentsItaly}, Estero: ${monthlyShipmentsAbroad}`);
        }
        
        similarLeads.searchStats.totalUrlsAnalyzed++;
        if (qualifies) {
          similarLeads.searchStats.totalUrlsQualified++;
        }
        
      } catch (urlError) {
        console.error(`  ❌ Errore analisi ${result.url}:`, urlError.message);
        
        // Aggiungi lead con errore
        leads.push({
          url: result.url,
          title: result.title,
          description: result.description,
          googleSearchPosition: result.position,
          analysisStatus: 'failed',
          error: urlError.message
        });
        
        similarLeads.searchStats.totalUrlsFailed++;
      }
      
      // Salva progress ogni 5 URLs
      if (leads.length % 5 === 0) {
        similarLeads.leads = leads;
        await similarLeads.save();
      }
    }

    // 3. Salva risultati finali
    similarLeads.leads = leads;
    similarLeads.status = 'completed';
    similarLeads.processingTime.completedAt = new Date();
    similarLeads.processingTime.durationMs = 
      similarLeads.processingTime.completedAt - similarLeads.processingTime.startedAt;
    
    await similarLeads.save();
    
    console.log(`✅ Processo completato: ${similarLeads.searchStats.totalUrlsQualified} leads qualificati`);

  } catch (error) {
    console.error('❌ Errore processo leads:', error);
    
    similarLeads.status = 'failed';
    similarLeads.errorLogs.push({
      message: error.message,
        timestamp: new Date()
      });
    similarLeads.processingTime.completedAt = new Date();
    await similarLeads.save();
  }
}

// Ottieni risultati ricerca leads
exports.getSimilarLeads = async (req, res) => {
  try {
    const { leadsId } = req.params;
    const userId = req.user._id;

    const leads = await SimilarLeads.findById(leadsId)
      .populate('originalAnalysis', 'url name')
      .populate('generatedBy', 'firstName lastName username');

    if (!leads) {
      return res.status(404).json({
        success: false,
        message: 'Leads non trovati'
      });
    }

    // Controlla permessi
    if (leads.generatedBy._id.toString() !== userId.toString() && 
        !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    res.json({
      success: true,
      data: leads
    });

  } catch (error) {
    console.error('❌ Errore getSimilarLeads:', error);
      res.status(500).json({
        success: false,
      message: 'Errore interno del server'
    });
  }
};

// Lista tutti i leads dell'utente
exports.getMyLeadsList = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      page = 1,
      limit = 10,
      status
    } = req.query;

    const query = {};
    
    // Filtro per ruolo utente
    if (req.user.role === 'bdr') {
      query.generatedBy = userId;
    }

    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const [leadsList, total] = await Promise.all([
      SimilarLeads.find(query)
        .populate('originalAnalysis', 'url name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      SimilarLeads.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: leadsList.map(l => l.getSummary()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Errore getMyLeadsList:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
}; 

/**
 * Cancella una ricerca di leads simili
 * DELETE /api/analysis/leads/:leadsId
 */
exports.deleteSimilarLeads = async (req, res) => {
  try {
    const { leadsId } = req.params;
    const userId = req.user._id;

    console.log(`🗑️ Richiesta cancellazione leads: ${leadsId} da utente ${userId}`);

    // Trova la ricerca
    const similarLeads = await SimilarLeads.findById(leadsId);

    if (!similarLeads) {
      return res.status(404).json({
        success: false,
        message: 'Ricerca non trovata'
      });
    }

    // Verifica che l'utente sia il proprietario
    if (similarLeads.generatedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Non hai i permessi per cancellare questa ricerca'
      });
    }

    // Cancella la ricerca
    await SimilarLeads.findByIdAndDelete(leadsId);

    console.log(`✅ Ricerca ${leadsId} cancellata con successo`);

    res.json({
      success: true,
      message: 'Ricerca cancellata con successo',
      data: {
        deletedId: leadsId,
        searchQuery: similarLeads.searchQuery
      }
    });

  } catch (error) {
    console.error('❌ Errore deleteSimilarLeads:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella cancellazione della ricerca'
    });
  }
};

/**
 * Espandi una ricerca esistente con altri 50 risultati Google
 * POST /api/analysis/leads/:leadsId/expand
 */
exports.expandSimilarLeads = async (req, res) => {
  try {
    const { leadsId } = req.params;
    const userId = req.user._id;

    console.log(`🔄 Richiesta espansione ricerca ${leadsId}`);

    // Trova la ricerca esistente
    const similarLeads = await SimilarLeads.findById(leadsId);

    if (!similarLeads) {
      return res.status(404).json({
        success: false,
        message: 'Ricerca non trovata'
      });
    }

    // Verifica proprietà
    if (similarLeads.generatedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Non hai i permessi per espandere questa ricerca'
      });
    }

    // Verifica che non sia già in processing
    if (similarLeads.status === 'processing') {
      return res.status(400).json({
        success: false,
        message: 'La ricerca è già in elaborazione'
      });
    }

    // Aggiorna stato a processing
    similarLeads.status = 'processing';
    await similarLeads.save();

    // Risposta immediata
    res.json({
      success: true,
      message: 'Espansione avviata. Il processo continuerà in background.',
      data: {
        leadsId: similarLeads._id,
        status: 'processing',
        currentResults: similarLeads.leads.length,
        lastPageSearched: similarLeads.searchStats.lastGooglePageSearched
      }
    });

    // Processo asincrono in background
    const analysisId = similarLeads.originalAnalysis;
    const analysis = await EcommerceAnalysis.findById(analysisId);
    
    if (!analysis) {
      console.error('❌ Analisi originale non trovata');
      similarLeads.status = 'failed';
      await similarLeads.save();
      return;
    }

    expandLeadsSearch(similarLeads, analysis, userId).catch(err => {
      console.error('❌ Errore processo espansione:', err);
    });

  } catch (error) {
    console.error('❌ Errore expandSimilarLeads:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'avvio dell\'espansione'
    });
  }
};

// Processo asincrono per analizzare un singolo lead
async function processLeadAnalysis(leadsId, leadIndex, url) {
  try {
    console.log(`🔄 Analisi lead ${leadIndex}: ${url}`);

    // Trova la ricerca
    const similarLeads = await SimilarLeads.findById(leadsId);
    if (!similarLeads) {
      console.error('❌ SimilarLeads non trovato');
      return;
    }

    const lead = similarLeads.leads[leadIndex];
    if (!lead) {
      console.error('❌ Lead non trovato all\'indice', leadIndex);
      return;
    }

    // Estrai dominio pulito
    const domain = extractCleanDomain(url);
    
    // NUOVO: Controlla se lo stesso dominio è già stato analizzato in QUESTA ricerca
    const previousLeadSameDomain = similarLeads.leads.find((l, idx) => {
      if (idx >= leadIndex) return false; // Solo lead precedenti
      const leadDomain = extractCleanDomain(l.url);
      return leadDomain === domain;
    });

    if (previousLeadSameDomain) {
      console.log(`🔄 Dominio ${domain} già analizzato in questa ricerca (indice ${similarLeads.leads.indexOf(previousLeadSameDomain)})`);
      
      // Se il lead precedente è stato scartato, scarta anche questo
      if (previousLeadSameDomain.analysisStatus === 'failed') {
        console.log(`❌ SCARTO automatico: dominio già scartato in precedenza`);
        lead.analysisStatus = 'failed';
        lead.error = `Dominio già scartato: ${previousLeadSameDomain.error || 'criteri non soddisfatti'}`;
        lead.notes = `Stesso dominio di ${previousLeadSameDomain.url}`;
        similarLeads.searchStats.totalUrlsFailed += 1;
        await similarLeads.save();
        return; // Esci senza chiamare SimilarWeb
      }
      
      // Se il lead precedente era qualificato, riusa i dati
      if (previousLeadSameDomain.analysisStatus === 'analyzed') {
        console.log(`♻️  RIUSO dati dal lead precedente qualificato`);
        lead.name = previousLeadSameDomain.name;
        lead.category = previousLeadSameDomain.category;
        lead.averageMonthlyVisits = previousLeadSameDomain.averageMonthlyVisits;
        lead.shipmentsByCountry = previousLeadSameDomain.shipmentsByCountry;
        lead.monthlyShipmentsItaly = previousLeadSameDomain.monthlyShipmentsItaly;
        lead.monthlyShipmentsAbroad = previousLeadSameDomain.monthlyShipmentsAbroad;
        lead.totalMonthlyShipments = previousLeadSameDomain.totalMonthlyShipments;
        lead.ecommercePlatform = previousLeadSameDomain.ecommercePlatform;
        lead.contacts = previousLeadSameDomain.contacts;
        lead.analysisStatus = 'analyzed';
        lead.analyzedAt = new Date();
        lead.notes = `Dati riutilizzati da ${previousLeadSameDomain.url}`;
        
        // Se era qualificato, qualifica anche questo
        similarLeads.searchStats.totalUrlsAnalyzed += 1;
        similarLeads.searchStats.totalUrlsQualified += 1;
        await similarLeads.save();
        console.log(`✅ Lead qualificato (riuso): ${url}`);
        return; // Esci senza chiamare SimilarWeb
      }
    }

    // Controlla se esiste già un'analisi nel DATABASE GLOBALE
    const existingAnalysis = await EcommerceAnalysis.findOne({
      url: new RegExp(domain.replace(/\./g, '\\.'), 'i')
    });

    let analysisData;

    if (existingAnalysis) {
      console.log(`♻️  Riuso analisi esistente dal database per ${domain}`);
      analysisData = existingAnalysis;
      lead.notes = (lead.notes ? lead.notes + ' · ' : '') + 'Analisi riutilizzata dal database';
    } else {
      // Nuova analisi con Apify (con retry automatico)
      console.log(`🆕 Nuova analisi SimilarWeb per ${url}`);
      
      const maxRetries = 3;
      let lastError;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`📡 Tentativo ${attempt}/${maxRetries} - Chiamata Apify...`);
          analysisData = await apifyService.runAnalysis(url);
          console.log(`✅ Analisi completata al tentativo ${attempt}`);
          break; // Successo, esci dal loop
        } catch (error) {
          lastError = error;
          console.error(`❌ Tentativo ${attempt}/${maxRetries} fallito: ${error.message}`);
          
          if (attempt < maxRetries) {
            // Attendi 3 secondi prima del prossimo tentativo
            console.log(`⏳ Attendo 3 secondi prima del prossimo tentativo...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            // Ultimo tentativo fallito, rilancia l'errore
            console.error(`❌ Tutti i ${maxRetries} tentativi falliti per ${url}`);
            throw lastError;
          }
        }
      }
    }

    // Controlla piattaforma ecommerce con BuiltWith
    console.log(`🔍 Controllo piattaforma ecommerce per ${url}...`);
    const platformCheck = await apifyService.checkEcommercePlatform(url);
    
    // Salva info piattaforma
    lead.ecommercePlatform = {
      platform: platformCheck.platform,
      isSupported: platformCheck.isSupported,
      checkedAt: new Date()
    };
    
    // Se la piattaforma NON è supportata, scarta il lead
    if (!platformCheck.isSupported) {
      console.log(`❌ Lead SCARTATO: piattaforma non supportata (${platformCheck.platform || 'sconosciuta'})`);
      lead.analysisStatus = 'failed';
      lead.error = `Piattaforma non supportata: ${platformCheck.platform || 'sconosciuta'}`;
      lead.notes = (lead.notes ? lead.notes + ' · ' : '') + `Piattaforma: ${platformCheck.platform || 'non rilevata'}`;
      similarLeads.searchStats.totalUrlsFailed += 1;
      await similarLeads.save();
      return; // Esci dalla funzione, non continuare l'analisi
    }
    
    console.log(`✅ Piattaforma supportata: ${platformCheck.platform || 'rilevata'}`);
    if (platformCheck.platform) {
      lead.notes = (lead.notes ? lead.notes + ' · ' : '') + `Piattaforma: ${platformCheck.platform}`;
    }

    // Calcola spedizioni per paese
    const shipmentsByCountry = analysisData.trafficByCountry?.map(country => ({
      countryName: country.countryName,
      countryCode: country.countryCode,
      monthlyVisits: country.monthlyVisits,
      visitsShare: country.visitsShare,
      monthlyShipments: country.estimatedShipments || 0
    })) || [];

    const monthlyShipmentsItaly = shipmentsByCountry
      .filter(c => c.countryCode === 'IT')
      .reduce((sum, c) => sum + c.monthlyShipments, 0);

    const monthlyShipmentsAbroad = shipmentsByCountry
      .filter(c => c.countryCode !== 'IT')
      .reduce((sum, c) => sum + c.monthlyShipments, 0);

    const totalMonthlyShipments = monthlyShipmentsItaly + monthlyShipmentsAbroad;

    // Aggiorna il lead
    lead.name = analysisData.name || '';
    lead.category = analysisData.vertical || analysisData.category || '';
    lead.averageMonthlyVisits = analysisData.averageMonthlyVisits || 0;
    lead.shipmentsByCountry = shipmentsByCountry;
    lead.monthlyShipmentsItaly = monthlyShipmentsItaly;
    lead.monthlyShipmentsAbroad = monthlyShipmentsAbroad;
    lead.totalMonthlyShipments = totalMonthlyShipments;
    lead.analysisStatus = 'analyzed';
    lead.analyzedAt = new Date();

    await similarLeads.save();

    // Controlla se qualifica
    const minItaly = similarLeads.filters?.minShipmentsItaly || 100;
    const minAbroad = similarLeads.filters?.minShipmentsAbroad || 30;
    const maxItaly = similarLeads.filters?.maxShipmentsItaly || 10000;

    const qualifies = (monthlyShipmentsItaly >= minItaly || monthlyShipmentsAbroad >= minAbroad) &&
                     monthlyShipmentsItaly <= maxItaly;

    if (qualifies) {
      similarLeads.searchStats.totalUrlsQualified += 1;
      console.log(`✅ Lead qualificato: ${url} (ITA: ${monthlyShipmentsItaly}, EST: ${monthlyShipmentsAbroad})`);
      
      // NUOVO: Estrai automaticamente email e telefono con Gemini
      console.log(`📞 Estrazione automatica contatti per lead qualificato...`);
      try {
        const geminiService = require('../services/geminiService');
        const contacts = await geminiService.extractMainContact(url, lead.name);
        
        if (contacts.email || contacts.phone) {
          lead.contacts = {
            email: contacts.email,
            phone: contacts.phone,
            extractedAt: new Date(),
            source: 'gemini_auto'
          };
          console.log(`✅ Contatti salvati: ${contacts.email || 'N/A'} | ${contacts.phone || 'N/A'}`);
        } else {
          console.log(`⚠️  Nessun contatto trovato per ${url}`);
        }
      } catch (contactError) {
        console.error(`❌ Errore estrazione contatti: ${contactError.message}`);
        // Non bloccare il processo se l'estrazione fallisce
      }
    } else {
      console.log(`❌ Lead NON qualificato: ${url} (ITA: ${monthlyShipmentsItaly}, EST: ${monthlyShipmentsAbroad})`);
    }

    similarLeads.searchStats.totalUrlsAnalyzed += 1;
    await similarLeads.save();

  } catch (error) {
    console.error(`❌ Errore analisi lead ${url}:`, error.message);

    // Aggiorna lo stato a failed
    try {
      const similarLeads = await SimilarLeads.findById(leadsId);
      if (similarLeads && similarLeads.leads[leadIndex]) {
        similarLeads.leads[leadIndex].analysisStatus = 'failed';
        similarLeads.leads[leadIndex].error = error.message;
        similarLeads.searchStats.totalUrlsFailed += 1;
        await similarLeads.save();
      }
    } catch (updateError) {
      console.error('❌ Errore aggiornamento failed:', updateError);
    }
  }
}

// Processo asincrono per espandere la ricerca
async function expandLeadsSearch(similarLeads, analysis, userId) {
  try {
    console.log(`🚀 Inizio espansione ricerca ${similarLeads._id}`);

    const lastPage = similarLeads.searchStats.lastGooglePageSearched || 5;
    const newMaxPages = lastPage + 5; // Cerca altre 5 pagine (~50 risultati)

    console.log(`📊 Ricerca: pagine ${lastPage + 1}-${newMaxPages} (erano già cercate 1-${lastPage})`);

    // Fai Google Search con più pagine
    const allGoogleResults = await apifyService.googleSearch(
      similarLeads.searchQuery,
      { maxPagesPerQuery: newMaxPages }
    );

    console.log(`✅ Google Search espansa: ${allGoogleResults.length} risultati totali`);

    // Filtra solo i nuovi URL (che non abbiamo già)
    const existingDomains = new Set();
    similarLeads.leads.forEach(lead => {
      const domain = extractCleanDomain(lead.url);
      if (domain) existingDomains.add(domain);
    });

    const newResults = allGoogleResults.filter(result => {
      const domain = extractCleanDomain(result.url);
      if (!domain || existingDomains.has(domain)) {
        return false;
      }
      // Aggiungi ai domini visti
      existingDomains.add(domain);
      return true;
    });

    console.log(`🆕 Nuovi URL da analizzare: ${newResults.length} (erano già ${similarLeads.leads.length})`);

    if (newResults.length === 0) {
      console.log('⚠️  Nessun nuovo URL trovato (tutti duplicati)');
      similarLeads.status = 'completed';
      similarLeads.searchStats.lastGooglePageSearched = newMaxPages;
      await similarLeads.save();
      return;
    }

    // Aggiorna stats
    similarLeads.searchStats.totalUrlsFound += newResults.length;

    // Processa nuovi URL (usa la stessa logica della ricerca originale)
    for (const result of newResults) {
      const domain = extractCleanDomain(result.url);
      
      // Skip marketplace
      if (isMarketplace(domain)) {
        console.log(`⏭️  Skip marketplace: ${domain}`);
        continue;
      }

      // Crea lead placeholder
      const newLead = {
        url: result.url,
        title: result.title,
        description: result.description,
        googleSearchPosition: result.position,
        googleSearchDescription: result.description,
        analysisStatus: 'pending'
      };

      similarLeads.leads.push(newLead);
      await similarLeads.save();

      const leadIndex = similarLeads.leads.length - 1;

      // Analizza asincrono
      processLeadAnalysis(similarLeads._id, leadIndex, result.url).catch(err => {
        console.error(`❌ Errore analisi ${result.url}:`, err);
      });
    }

    // Aggiorna lastGooglePageSearched
    similarLeads.searchStats.lastGooglePageSearched = newMaxPages;
    similarLeads.status = 'completed';
    await similarLeads.save();

    console.log(`✅ Espansione completata: +${newResults.length} nuovi URL in coda di analisi`);

  } catch (error) {
    console.error('❌ Errore expandLeadsSearch:', error);
    similarLeads.status = 'failed';
    await similarLeads.save();
  }
}

/**
 * Arricchisci un singolo lead con business contacts e reviews
 * POST /api/analysis/leads/:leadsId/enrich/:leadIndex
 */
exports.enrichSingleLead = async (req, res) => {
  try {
    const { leadsId, leadIndex } = req.params;
    const userId = req.user._id;

    console.log(`🔍 Richiesta enrichment per lead ${leadIndex} nella ricerca ${leadsId}`);

    // Trova la ricerca
    const similarLeads = await SimilarLeads.findById(leadsId);

    if (!similarLeads) {
      return res.status(404).json({
        success: false,
        message: 'Ricerca non trovata'
      });
    }

    // Verifica che l'utente sia il proprietario
    if (similarLeads.generatedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Non hai i permessi per arricchire questo lead'
      });
    }

    // Verifica che l'indice del lead sia valido
    const index = parseInt(leadIndex);
    if (isNaN(index) || index < 0 || index >= similarLeads.leads.length) {
      return res.status(400).json({
        success: false,
        message: 'Indice lead non valido'
      });
    }

    const lead = similarLeads.leads[index];

    // Permetti di rifare l'enrichment anche se già fatto
    // (utile per testare o aggiornare i dati)
    console.log(`📊 Stato enrichment attuale: ${lead.enrichment?.status || 'not_enriched'}`);

    // Imposta stato enriching
    lead.enrichment = lead.enrichment || {};
    lead.enrichment.status = 'enriching';
    await similarLeads.save();

    // Risposta immediata
    res.json({
      success: true,
      message: 'Enrichment avviato',
      data: {
        leadIndex: index,
        url: lead.url,
        status: 'enriching'
      }
    });

    // Processo in background
    enrichLeadProcess(leadsId, index, lead.url).catch(err => {
      console.error('❌ Errore processo enrichment:', err);
    });

  } catch (error) {
    console.error('❌ Errore enrichSingleLead:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'avvio dell\'enrichment'
    });
  }
};

// Processo asincrono di enrichment
async function enrichLeadProcess(leadsId, leadIndex, url) {
  const geminiService = require('../services/geminiService');
  
  try {
    console.log(`🔄 Inizio processo enrichment per ${url}`);

    // Step 1: Crawl website con Apify (home + pagina contatti)
    console.log(`🕷️  Step 1: Crawl sito web...`);
    const pages = await apifyService.crawlWebsite(url);

    if (!pages || pages.length === 0) {
      throw new Error('Nessuna pagina crawlata dal sito');
    }

    // Step 2: Prioritizza pagine contatti (ordina per rilevanza)
    const sortedPages = pages.sort((a, b) => {
      const urlA = (a.url || '').toLowerCase();
      const urlB = (b.url || '').toLowerCase();
      const titleA = (a.metadata?.title || '').toLowerCase();
      const titleB = (b.metadata?.title || '').toLowerCase();
      
      // Parole chiave per pagine contatti
      const contactKeywords = ['contatt', 'contact', 'chi-siamo', 'about', 'info'];
      
      const scoreA = contactKeywords.some(kw => urlA.includes(kw) || titleA.includes(kw)) ? 10 : 0;
      const scoreB = contactKeywords.some(kw => urlB.includes(kw) || titleB.includes(kw)) ? 10 : 0;
      
      return scoreB - scoreA; // Ordine decrescente
    });

    // Log pagine per rilevanza
    console.log(`📄 Pagine ordinate per rilevanza:`);
    sortedPages.forEach((page, idx) => {
      console.log(`  ${idx + 1}. ${page.url} - ${page.text?.length || 0} caratteri`);
    });

    // Step 3: Combina il testo (priorità a pagine contatti)
    const combinedText = sortedPages
      .map(page => {
        const pageTitle = page.metadata?.title || '';
        const pageUrl = page.url || '';
        const pageText = page.text || '';
        return `\n=== ${pageTitle} (${pageUrl}) ===\n${pageText}`;
      })
      .join('\n\n');

    console.log(`📄 Testo totale estratto: ${combinedText.length} caratteri da ${pages.length} pagine`);

    // Step 4: Estrai nome azienda dall'URL
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const companyName = domain.split('.')[0].replace(/-/g, ' ');

    // Step 5: Usa Gemini per estrarre email e telefoni
    console.log(`🤖 Step 3: Estrazione contatti con Gemini...`);
    const contacts = await geminiService.extractContacts(combinedText, companyName);

    // Step 6: Aggiorna il lead con i dati enrichment
    const similarLeads = await SimilarLeads.findById(leadsId);
    
    if (!similarLeads) {
      console.error('❌ Ricerca non trovata durante enrichment');
      return;
    }

    const lead = similarLeads.leads[leadIndex];
    
    if (!lead) {
      console.error('❌ Lead non trovato durante enrichment');
      return;
    }

    // Aggiorna enrichment con nuovo formato (emails + phones)
    lead.enrichment = {
      status: 'enriched',
      enrichedAt: new Date(),
      emails: contacts.emails || [],
      phones: contacts.phones || [],
      pagesCrawled: pages.length,
      error: null
    };

    await similarLeads.save();

    console.log(`✅ Enrichment completato per ${url}`);
    console.log(`📧 Email trovate: ${lead.enrichment.emails.length}`);
    console.log(`📞 Telefoni trovati: ${lead.enrichment.phones.length}`);
    console.log(`📄 Pagine analizzate: ${pages.length}`);

    if (lead.enrichment.emails.length > 0) {
      console.log(`  → Email:`, lead.enrichment.emails);
    }
    if (lead.enrichment.phones.length > 0) {
      console.log(`  → Telefoni:`, lead.enrichment.phones);
    }

  } catch (error) {
    console.error('❌ Errore processo enrichment:', error);

    // Aggiorna lo stato a failed
    try {
      const similarLeads = await SimilarLeads.findById(leadsId);
      if (similarLeads && similarLeads.leads[leadIndex]) {
        similarLeads.leads[leadIndex].enrichment = {
          status: 'failed',
          error: error.message,
          emails: [],
          phones: []
        };
        await similarLeads.save();
      }
    } catch (updateError) {
      console.error('❌ Errore aggiornamento stato failed:', updateError);
    }
  }
} 