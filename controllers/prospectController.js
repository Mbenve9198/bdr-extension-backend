const Prospect = require('../models/Prospect');
const EcommerceAnalysis = require('../models/EcommerceAnalysis');
const { validationResult } = require('express-validator');

// Crea nuovo prospect
exports.createProspect = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dati non validi',
        errors: errors.array()
      });
    }

    const { url, name, company, industry, priority, tags, notes, contactInfo } = req.body;

    // Controlla se esiste già un prospect con lo stesso URL
    const existingProspect = await Prospect.findOne({ 
      url: url.toLowerCase(),
      addedBy: req.user._id 
    });

    if (existingProspect) {
      return res.status(400).json({
        success: false,
        message: 'Prospect con questo URL già esistente'
      });
    }

    const prospect = new Prospect({
      url: url.toLowerCase(),
      name,
      company,
      industry,
      priority: priority || 'medium',
      tags: tags || [],
      notes,
      contactInfo: contactInfo || {},
      addedBy: req.user._id
    });

    await prospect.save();

    res.status(201).json({
      success: true,
      message: 'Prospect creato con successo',
      data: prospect
    });

  } catch (error) {
    console.error('Errore createProspect:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Lista prospects con filtri e paginazione
exports.getProspects = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      industry,
      priority,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      assignedTo
    } = req.query;

    const query = {};
    
    // Filtro per ruolo utente - BDR vedono solo i loro prospect
    if (req.user.role === 'bdr') {
      query.addedBy = req.user._id;
    }

    // Filtri
    if (status) query.status = status;
    if (industry) query.industry = industry;
    if (priority) query.priority = priority;
    if (assignedTo) query.assignedTo = assignedTo;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { url: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [prospects, total] = await Promise.all([
      Prospect.find(query)
        .populate('addedBy', 'firstName lastName username')
        .populate('assignedTo', 'firstName lastName username')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Prospect.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: prospects,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Errore getProspects:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Ottieni singolo prospect per ID
exports.getProspectById = async (req, res) => {
  try {
    const { id } = req.params;

    const prospect = await Prospect.findById(id)
      .populate('addedBy', 'firstName lastName username company')
      .populate('assignedTo', 'firstName lastName username');

    if (!prospect) {
      return res.status(404).json({
        success: false,
        message: 'Prospect non trovato'
      });
    }

    // Controlla permessi
    if (req.user.role === 'bdr' && 
        prospect.addedBy._id.toString() !== req.user._id.toString() &&
        (!prospect.assignedTo || prospect.assignedTo._id.toString() !== req.user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    // Ottieni anche le analisi associate
    const analyses = await EcommerceAnalysis.find({ prospect: id })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('analyzedBy', 'firstName lastName');

    res.json({
      success: true,
      data: {
        prospect,
        recentAnalyses: analyses
      }
    });

  } catch (error) {
    console.error('Errore getProspectById:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Aggiorna prospect
exports.updateProspect = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dati non validi',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { name, company, industry, priority, tags, notes, contactInfo, status } = req.body;

    const prospect = await Prospect.findById(id);

    if (!prospect) {
      return res.status(404).json({
        success: false,
        message: 'Prospect non trovato'
      });
    }

    // Controlla permessi
    if (req.user.role === 'bdr' && 
        prospect.addedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    // Aggiorna i campi forniti
    if (name !== undefined) prospect.name = name;
    if (company !== undefined) prospect.company = company;
    if (industry !== undefined) prospect.industry = industry;
    if (priority !== undefined) prospect.priority = priority;
    if (tags !== undefined) prospect.tags = tags;
    if (notes !== undefined) prospect.notes = notes;
    if (contactInfo !== undefined) {
      prospect.contactInfo = { ...prospect.contactInfo, ...contactInfo };
    }
    if (status !== undefined && ['admin', 'manager'].includes(req.user.role)) {
      prospect.status = status;
    }

    await prospect.save();

    res.json({
      success: true,
      message: 'Prospect aggiornato con successo',
      data: prospect
    });

  } catch (error) {
    console.error('Errore updateProspect:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Assegna prospect a un BDR (solo admin/manager)
exports.assignProspect = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    const prospect = await Prospect.findById(id);

    if (!prospect) {
      return res.status(404).json({
        success: false,
        message: 'Prospect non trovato'
      });
    }

    // Verifica che l'utente da assegnare esista
    const User = require('../models/User');
    const assignee = await User.findById(assignedTo);
    
    if (!assignee) {
      return res.status(404).json({
        success: false,
        message: 'Utente da assegnare non trovato'
      });
    }

    prospect.assignedTo = assignedTo;
    await prospect.save();

    await prospect.populate('assignedTo', 'firstName lastName username');

    res.json({
      success: true,
      message: 'Prospect assegnato con successo',
      data: prospect
    });

  } catch (error) {
    console.error('Errore assignProspect:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Elimina prospect
exports.deleteProspect = async (req, res) => {
  try {
    const { id } = req.params;

    const prospect = await Prospect.findById(id);

    if (!prospect) {
      return res.status(404).json({
        success: false,
        message: 'Prospect non trovato'
      });
    }

    // Controlla permessi
    if (req.user.role === 'bdr' && 
        prospect.addedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    // Elimina soft (disattiva invece di cancellare)
    prospect.isActive = false;
    await prospect.save();

    res.json({
      success: true,
      message: 'Prospect eliminato con successo'
    });

  } catch (error) {
    console.error('Errore deleteProspect:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Statistiche prospects
exports.getProspectStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    
    const query = userRole === 'bdr' ? { addedBy: userId } : {};

    const [
      totalProspects,
      pendingProspects,
      analyzingProspects,
      completedProspects,
      failedProspects,
      qualifiedProspects,
      contactedProspects,
      industryStats
    ] = await Promise.all([
      Prospect.countDocuments({ ...query, isActive: true }),
      Prospect.countDocuments({ ...query, status: 'pending', isActive: true }),
      Prospect.countDocuments({ ...query, status: 'analyzing', isActive: true }),
      Prospect.countDocuments({ ...query, status: 'completed', isActive: true }),
      Prospect.countDocuments({ ...query, status: 'failed', isActive: true }),
      Prospect.countDocuments({ ...query, status: 'qualified', isActive: true }),
      Prospect.countDocuments({ ...query, status: 'contacted', isActive: true }),
      Prospect.aggregate([
        { $match: { ...query, isActive: true } },
        { $group: { _id: '$industry', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        total: totalProspects,
        byStatus: {
          pending: pendingProspects,
          analyzing: analyzingProspects,
          completed: completedProspects,
          failed: failedProspects,
          qualified: qualifiedProspects,
          contacted: contactedProspects
        },
        byIndustry: industryStats
      }
    });

  } catch (error) {
    console.error('Errore getProspectStats:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Importa prospects da CSV/JSON
exports.importProspects = async (req, res) => {
  try {
    const { prospects } = req.body;

    if (!Array.isArray(prospects) || prospects.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array di prospect richiesto'
      });
    }

    if (prospects.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Massimo 100 prospect per importazione'
      });
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    for (const prospectData of prospects) {
      try {
        if (!prospectData.url) {
          results.errors.push({ data: prospectData, error: 'URL richiesto' });
          continue;
        }

        // Controlla se esiste già
        const existing = await Prospect.findOne({ 
          url: prospectData.url.toLowerCase(),
          addedBy: req.user._id 
        });

        if (existing) {
          results.skipped++;
          continue;
        }

        const prospect = new Prospect({
          ...prospectData,
          url: prospectData.url.toLowerCase(),
          addedBy: req.user._id
        });

        await prospect.save();
        results.imported++;

      } catch (error) {
        results.errors.push({ 
          data: prospectData, 
          error: error.message 
        });
      }
    }

    res.json({
      success: true,
      message: `Importazione completata: ${results.imported} importati, ${results.skipped} saltati`,
      data: results
    });

  } catch (error) {
    console.error('Errore importProspects:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
}; 