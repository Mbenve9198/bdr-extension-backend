const CallScript = require('../models/CallScript');
const EcommerceAnalysis = require('../models/EcommerceAnalysis');
const User = require('../models/User');
const scriptGeneratorService = require('../services/scriptGeneratorService');
const { validationResult } = require('express-validator');

// Genera script di vendita
const generateScript = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dati non validi',
        errors: errors.array()
      });
    }

    const { analysisId, language = 'it' } = req.body;
    const userId = req.user._id;

    // Verifica che l'analisi esista
    const analysis = await EcommerceAnalysis.findById(analysisId)
      .populate('analyzedBy', 'firstName lastName username');

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Analisi non trovata'
      });
    }

    // Verifica permessi
    if (analysis.analyzedBy._id.toString() !== userId.toString() && 
        !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    // Controlla se esiste già uno script per questa analisi
    const existingScript = await CallScript.findOne({
      analysis: analysisId,
      'script.language': language
    }).sort({ createdAt: -1 });

    if (existingScript && existingScript.status === 'completed') {
      console.log(`📋 Script esistente trovato per analisi ${analysisId}`);
      return res.json({
        success: true,
        message: 'Script esistente trovato',
        data: existingScript,
        fromCache: true
      });
    }

    // Crea nuovo record script in stato 'generating'
    const scriptRecord = new CallScript({
      analysis: analysisId,
      generatedBy: userId,
      siteName: analysis.name || 'Sito sconosciuto',
      siteUrl: analysis.url,
      status: 'generating',
      script: {
        language: language
      }
    });

    await scriptRecord.save();

    // Aggiorna contatore utente
    await User.findByIdAndUpdate(userId, {
      $inc: { analysisCount: 1 },
      lastLogin: new Date()
    });

    try {
      console.log(`🤖 Inizio generazione script per ${analysis.name}`);

      // Step 1: Analisi con Perplexity
      console.log('🔍 Analisi Perplexity...');
      const perplexityReport = await scriptGeneratorService.analyzeWithPerplexity(
        analysis.url, 
        analysis.name
      );

      // Parsing del report Perplexity
      const perplexityData = scriptGeneratorService.parsePerplexityReport(perplexityReport);

      // Step 2: Generazione script con Claude
      console.log('✍️ Generazione script Claude...');
      const claudeScript = await scriptGeneratorService.generateScriptWithClaude(
        analysis,
        perplexityReport,
        language
      );

      // Determina se è internazionale
      const isInternational = scriptGeneratorService.checkIfInternational(analysis);

      // Estrai componenti dello script (parsing intelligente)
      const scriptComponents = parseScriptComponents(claudeScript);

      // Raccomandazioni corrieri
      const courierRecommendations = scriptGeneratorService.recommendCouriers(
        perplexityData, 
        isInternational
      );

      // Aggiorna il record con tutti i dati
      scriptRecord.perplexityReport = perplexityData;
      scriptRecord.script = {
        language: language,
        hook: scriptComponents.hook || claudeScript.substring(0, 500),
        qualificationQuestions: scriptComponents.qualificationQuestions || [],
        pricingSuggestions: {
          recommendedCouriers: courierRecommendations,
          insuranceInfo: {
            national: "Valore pacco × 0,6%",
            international: "Valore pacco × 1,5%"
          }
        },
        closingNotes: scriptComponents.closing || "Proporre demo e prossimi step",
        fullScript: claudeScript
      };
      scriptRecord.isInternational = isInternational;
      scriptRecord.topCountries = analysis.topCountries?.map(c => c.countryName) || [];
      scriptRecord.estimatedShipments = analysis.calculatedMetrics?.estimatedMonthlyShipments || 0;
      scriptRecord.status = 'completed';

      await scriptRecord.save();

      console.log(`✅ Script generato con successo per ${analysis.name}`);

      res.json({
        success: true,
        message: 'Script generato con successo',
        data: scriptRecord,
        scriptId: scriptRecord._id
      });

    } catch (scriptError) {
      console.error(`❌ Errore generazione script per ${analysis.name}:`, scriptError.message);

      // Aggiorna record con errore
      scriptRecord.status = 'failed';
      scriptRecord.errorLogs.push({
        message: scriptError.message,
        timestamp: new Date()
      });
      await scriptRecord.save();

      res.status(500).json({
        success: false,
        message: 'Errore durante la generazione dello script',
        error: scriptError.message,
        scriptId: scriptRecord._id
      });
    }

  } catch (error) {
    console.error('Errore controller generateScript:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Ottieni script per ID
const getScriptById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const script = await CallScript.findById(id)
      .populate('analysis', 'name url calculatedMetrics topCountries')
      .populate('generatedBy', 'firstName lastName username');

    if (!script) {
      return res.status(404).json({
        success: false,
        message: 'Script non trovato'
      });
    }

    // Controlla permessi
    if (script.generatedBy._id.toString() !== req.user._id.toString() && 
        !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    res.json({
      success: true,
      data: script
    });

  } catch (error) {
    console.error('Errore getScriptById:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Lista script con filtri
const getScriptsList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      language,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    
    // Filtro per ruolo utente
    if (req.user.role === 'bdr') {
      query.generatedBy = req.user._id;
    }

    // Filtri
    if (language) query['script.language'] = language;
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [scripts, total] = await Promise.all([
      CallScript.find(query)
        .populate('analysis', 'name url')
        .populate('generatedBy', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      CallScript.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: scripts.map(script => script.getSummary()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Errore getScriptsList:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Ottieni script per analisi
const getScriptByAnalysis = async (req, res) => {
  try {
    const { analysisId } = req.params;
    const { language = 'it' } = req.query;
    
    const script = await CallScript.findOne({
      analysis: analysisId,
      'script.language': language,
      status: 'completed'
    })
    .populate('analysis', 'name url calculatedMetrics topCountries')
    .populate('generatedBy', 'firstName lastName username')
    .sort({ createdAt: -1 });

    if (!script) {
      return res.status(404).json({
        success: false,
        message: 'Nessuno script trovato per questa analisi'
      });
    }

    // Controlla permessi
    if (script.generatedBy._id.toString() !== req.user._id.toString() && 
        !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    res.json({
      success: true,
      data: script
    });

  } catch (error) {
    console.error('Errore getScriptByAnalysis:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Funzione helper per parsing componenti script
function parseScriptComponents(scriptText) {
  const components = {
    hook: '',
    qualificationQuestions: [],
    closing: ''
  };

  try {
    // Estrai hook (primo paragrafo o sezione HOOK)
    const hookMatch = scriptText.match(/(?:HOOK|Apertura|Hook)[\s\S]*?["']([^"']+)["']/i);
    if (hookMatch) {
      components.hook = hookMatch[1];
    } else {
      // Prendi il primo paragrafo significativo
      const paragraphs = scriptText.split('\n\n');
      components.hook = paragraphs.find(p => p.length > 50)?.substring(0, 300) || '';
    }

    // Estrai domande di qualificazione
    const questionsSection = scriptText.match(/(?:DOMANDE|Qualificazione|QUESTIONS)[\s\S]*?(?=\n\n|\d+\.|SUGGERIMENTI|CHIUSURA|$)/i);
    if (questionsSection) {
      const questions = questionsSection[0].match(/[-•]\s*([^-•\n]+)/g);
      if (questions) {
        components.qualificationQuestions = questions.map(q => q.replace(/^[-•]\s*/, '').trim());
      }
    }

    // Estrai chiusura
    const closingMatch = scriptText.match(/(?:CHIUSURA|Closing|Next step)[\s\S]*$/i);
    if (closingMatch) {
      components.closing = closingMatch[0].substring(0, 200);
    }

  } catch (parseError) {
    console.error('Errore parsing script:', parseError);
  }

  return components;
}

module.exports = {
  generateScript,
  getScriptById,
  getScriptsList,
  getScriptByAnalysis
}; 