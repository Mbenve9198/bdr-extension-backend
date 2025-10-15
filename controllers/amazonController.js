const AmazonSellers = require('../models/AmazonSellers');
const User = require('../models/User');
const apifyService = require('../services/apifyService');
const geminiService = require('../services/geminiService');

/**
 * Avvia ricerca venditori Amazon da una pagina Amazon
 * POST /api/amazon/find-sellers
 */
exports.findAmazonSellers = async (req, res) => {
  console.log('🛒 [AMAZON] Richiesta ricerca venditori Amazon');
  
  try {
    const { amazonUrl } = req.body;
    const userId = req.user._id;

    if (!amazonUrl) {
      return res.status(400).json({
        success: false,
        message: 'URL Amazon richiesto'
      });
    }

    // Verifica che sia un URL Amazon valido
    const amazonDomains = ['amazon.it', 'amazon.fr', 'amazon.de', 'amazon.es', 'amazon.co.uk', 'amazon.com'];
    const urlObj = new URL(amazonUrl);
    const marketplace = amazonDomains.find(domain => urlObj.hostname.includes(domain));

    if (!marketplace) {
      return res.status(400).json({
        success: false,
        message: 'URL non valido. Deve essere un link Amazon (amazon.it, amazon.fr, etc.)'
      });
    }

    console.log(`🌍 Marketplace rilevato: ${marketplace}`);
    console.log(`📝 URL richiesta: ${amazonUrl}`);

    // Crea record AmazonSellers
    const amazonSellers = new AmazonSellers({
      generatedBy: userId,
      sourceUrl: amazonUrl,
      marketplace: marketplace,
      searchQuery: urlObj.searchParams.get('k') || '', // Estrai query di ricerca se presente
      status: 'processing',
      processingTime: {
        startedAt: new Date()
      }
    });
    await amazonSellers.save();

    // Risposta immediata al client
    res.json({
      success: true,
      message: 'Ricerca venditori avviata. Il processo continuerà in background.',
      data: {
        sellersId: amazonSellers._id,
        status: 'processing',
        marketplace: marketplace
      }
    });

    // Processo asincrono in background
    processSellersSearch(amazonSellers._id, amazonUrl, marketplace, userId).catch(err => {
      console.error('❌ Errore processo venditori:', err);
    });

  } catch (error) {
    console.error('❌ [AMAZON] Errore findAmazonSellers:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      error: error.message
    });
  }
};

/**
 * Processo asincrono per ricercare e analizzare venditori Amazon
 */
async function processSellersSearch(sellersId, amazonUrl, marketplace, userId) {
  const amazonSellers = await AmazonSellers.findById(sellersId);
  
  try {
    console.log(`🚀 Inizio processo venditori per ${amazonUrl}`);

    // 1. Scrapa prodotti Amazon
    console.log('🛒 Step 1: Scraping prodotti Amazon...');
    const products = await apifyService.scrapeAmazonProducts(amazonUrl, {
      maxItems: 50 // Max 50 prodotti
    });
    console.log(`✅ Trovati ${products.length} prodotti`);
    
    amazonSellers.searchStats.totalProductsScraped = products.length;
    await amazonSellers.save();

    if (products.length === 0) {
      throw new Error('Nessun prodotto trovato su Amazon');
    }

    // 2. Estrai venditori unici
    console.log('📊 Step 2: Estrazione venditori unici...');
    const sellersMap = new Map();
    
    for (const product of products) {
      const sellerId = product.seller.id;
      
      if (!sellersMap.has(sellerId)) {
        // Nuovo venditore
        sellersMap.set(sellerId, {
          sellerName: product.seller.name,
          sellerId: sellerId,
          sellerUrl: product.seller.url,
          productAsin: product.asin,
          productTitle: product.title,
          productUrl: product.url,
          analysisStatus: 'pending'
        });
      }
    }

    console.log(`📦 Trovati ${sellersMap.size} venditori unici`);
    
    amazonSellers.searchStats.totalSellersFound = products.length;
    amazonSellers.searchStats.totalSellersUnique = sellersMap.size;
    
    // Aggiungi venditori al documento
    for (const seller of sellersMap.values()) {
      amazonSellers.sellers.push(seller);
    }
    await amazonSellers.save();

    // 3. Analizza ogni venditore
    console.log('🔍 Step 3: Analisi dettagliata venditori...');
    let sellerIndex = 0;
    
    for (const seller of amazonSellers.sellers) {
      await processSellerAnalysis(sellersId, sellerIndex, seller.sellerUrl, marketplace);
      sellerIndex++;
    }

    // 4. Completa la ricerca
    const updatedSellers = await AmazonSellers.findById(sellersId);
    updatedSellers.status = 'completed';
    updatedSellers.processingTime.completedAt = new Date();
    updatedSellers.processingTime.durationMs = 
      updatedSellers.processingTime.completedAt - updatedSellers.processingTime.startedAt;
    
    await updatedSellers.save();
    
    console.log(`✅ Processo completato: ${updatedSellers.searchStats.totalSellersQualified} venditori qualificati su ${updatedSellers.searchStats.totalSellersAnalyzed} analizzati`);

  } catch (error) {
    console.error('❌ Errore processo venditori:', error);
    
    amazonSellers.status = 'failed';
    amazonSellers.errorLogs.push({
      message: error.message,
      timestamp: new Date()
    });
    amazonSellers.processingTime.completedAt = new Date();
    await amazonSellers.save();
  }
}

/**
 * Processo asincrono per analizzare un singolo venditore
 */
async function processSellerAnalysis(sellersId, sellerIndex, sellerUrl, marketplace) {
  try {
    console.log(`🔄 Analisi venditore ${sellerIndex}: ${sellerUrl}`);

    const amazonSellers = await AmazonSellers.findById(sellersId);
    if (!amazonSellers) {
      console.error('❌ AmazonSellers non trovato');
      return;
    }

    const seller = amazonSellers.sellers[sellerIndex];
    if (!seller) {
      console.error('❌ Seller non trovato all\'indice', sellerIndex);
      return;
    }

    // CONTROLLO DUPLICATI: Verifica se questo seller è già stato analizzato
    const previousSellerSameId = amazonSellers.sellers.find((s, idx) => {
      if (idx >= sellerIndex) return false; // Solo seller precedenti
      return s.sellerId === seller.sellerId;
    });

    if (previousSellerSameId) {
      console.log(`🔄 Seller ${seller.sellerId} già analizzato in precedenza (indice ${amazonSellers.sellers.indexOf(previousSellerSameId)})`);
      
      // Se il seller precedente è stato rifiutato, rifiuta anche questo
      if (previousSellerSameId.analysisStatus === 'rejected') {
        console.log(`❌ SCARTO automatico: seller già rifiutato in precedenza`);
        seller.analysisStatus = 'rejected';
        seller.error = `Seller già rifiutato: ${previousSellerSameId.error || 'criteri non soddisfatti'}`;
        seller.notes = `Stesso seller di ${previousSellerSameId.productTitle}`;
        seller.isDuplicate = true;
        amazonSellers.searchStats.totalSellersRejected += 1;
        await amazonSellers.save();
        return;
      }
      
      // Se il seller precedente era completato, riusa i dati
      if (previousSellerSameId.analysisStatus === 'completed') {
        console.log(`♻️  RIUSO dati dal seller precedente`);
        seller.compliance = previousSellerSameId.compliance;
        seller.analysisStatus = 'completed';
        seller.analyzedAt = new Date();
        seller.notes = `Dati riutilizzati da ${previousSellerSameId.productTitle}`;
        seller.isDuplicate = true;
        
        amazonSellers.searchStats.totalSellersAnalyzed += 1;
        
        // Verifica se qualifica (telefono italiano)
        const phone = seller.compliance?.phoneNumber || '';
        const hasItalianPhone = phone.includes('+39') || phone.startsWith('39') || phone.match(/^0\d{1,3}\s?\d+/);
        
        if (hasItalianPhone) {
          amazonSellers.searchStats.totalSellersQualified += 1;
          console.log(`✅ Seller qualificato (riuso): ${seller.sellerName} (Tel: ${phone})`);
        } else {
          console.log(`❌ Seller NON qualificato (riuso): ${seller.sellerName} (Tel: ${phone || 'N/A'})`);
        }
        
        await amazonSellers.save();
        return;
      }
    }

    // Aggiorna status a crawling
    seller.analysisStatus = 'crawling';
    await amazonSellers.save();

    // Step 1: Crawl seller page
    console.log(`📄 [1/2] Crawl seller page...`);
    const pageText = await apifyService.crawlAmazonSellerPage(sellerUrl, marketplace);
    console.log(`✅ Testo estratto: ${pageText.length} caratteri`);

    // Aggiorna status a analyzing
    seller.analysisStatus = 'analyzing';
    await amazonSellers.save();

    // Step 2: Estrai compliance con Gemini
    console.log(`🤖 [2/2] Estrazione compliance con Gemini...`);
    const compliance = await geminiService.extractAmazonSellerCompliance(pageText, sellerUrl, marketplace);
    console.log(`✅ Compliance estratta:`, compliance);

    // Salva compliance e testo raw
    seller.compliance = {
      ...compliance,
      rawText: pageText.slice(0, 10000) // Max 10k caratteri per debug
    };
    seller.analysisStatus = 'completed';
    seller.analyzedAt = new Date();

    amazonSellers.searchStats.totalSellersAnalyzed += 1;

    // Verifica se qualifica (telefono italiano)
    const phone = compliance.phoneNumber || '';
    const hasItalianPhone = phone.includes('+39') || phone.startsWith('39') || phone.match(/^0\d{1,3}\s?\d+/);

    if (hasItalianPhone) {
      amazonSellers.searchStats.totalSellersQualified += 1;
      console.log(`✅ Seller QUALIFICATO: ${seller.sellerName}`);
      console.log(`   - Telefono: ${phone}`);
      console.log(`   - Email: ${compliance.emailAddress || 'N/A'}`);
      console.log(`   - VAT: ${compliance.vatNumber || 'N/A'}`);
    } else {
      amazonSellers.searchStats.totalSellersRejected += 1;
      seller.analysisStatus = 'rejected';
      seller.notes = `Telefono non italiano: ${phone || 'non trovato'}`;
      console.log(`❌ Seller RIFIUTATO: ${seller.sellerName} (Tel: ${phone || 'N/A'})`);
    }

    await amazonSellers.save();

  } catch (error) {
    console.error(`❌ Errore analisi seller:`, error.message);

    // Aggiorna lo stato a failed
    try {
      const amazonSellers = await AmazonSellers.findById(sellersId);
      if (amazonSellers && amazonSellers.sellers[sellerIndex]) {
        amazonSellers.sellers[sellerIndex].analysisStatus = 'failed';
        amazonSellers.sellers[sellerIndex].error = error.message;
        amazonSellers.searchStats.totalSellersRejected += 1;
        await amazonSellers.save();
      }
    } catch (updateError) {
      console.error('❌ Errore aggiornamento failed:', updateError);
    }
  }
}

/**
 * Ottieni risultati ricerca venditori
 * GET /api/amazon/sellers/:sellersId
 */
exports.getAmazonSellers = async (req, res) => {
  try {
    const { sellersId } = req.params;
    const userId = req.user._id;

    const sellers = await AmazonSellers.findById(sellersId)
      .populate('generatedBy', 'firstName lastName username');

    if (!sellers) {
      return res.status(404).json({
        success: false,
        message: 'Ricerca venditori non trovata'
      });
    }

    // Controlla permessi
    if (sellers.generatedBy._id.toString() !== userId.toString() && 
        !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato'
      });
    }

    // Filtra solo i venditori qualificati (con telefono italiano)
    const sellersData = sellers.toObject();
    sellersData.qualifiedSellers = sellers.getQualifiedSellers();

    res.json({
      success: true,
      data: sellersData
    });

  } catch (error) {
    console.error('❌ Errore getAmazonSellers:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

/**
 * Lista tutte le ricerche venditori dell'utente
 * GET /api/amazon/my-searches
 */
exports.getMySearchesList = async (req, res) => {
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

    const [searchesList, total] = await Promise.all([
      AmazonSellers.find(query)
        .populate('generatedBy', 'firstName lastName username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AmazonSellers.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: searchesList.map(s => s.getSummary()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Errore getMySearchesList:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

/**
 * Cancella una ricerca venditori
 * DELETE /api/amazon/sellers/:sellersId
 */
exports.deleteAmazonSellers = async (req, res) => {
  try {
    const { sellersId } = req.params;
    const userId = req.user._id;

    console.log(`🗑️ Richiesta cancellazione ricerca: ${sellersId} da utente ${userId}`);

    const amazonSellers = await AmazonSellers.findById(sellersId);

    if (!amazonSellers) {
      return res.status(404).json({
        success: false,
        message: 'Ricerca non trovata'
      });
    }

    // Verifica che l'utente sia il proprietario
    if (amazonSellers.generatedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Non hai i permessi per cancellare questa ricerca'
      });
    }

    await AmazonSellers.findByIdAndDelete(sellersId);

    console.log(`✅ Ricerca ${sellersId} cancellata con successo`);

    res.json({
      success: true,
      message: 'Ricerca cancellata con successo',
      data: {
        deletedId: sellersId,
        marketplace: amazonSellers.marketplace
      }
    });

  } catch (error) {
    console.error('❌ Errore deleteAmazonSellers:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella cancellazione della ricerca'
    });
  }
};

