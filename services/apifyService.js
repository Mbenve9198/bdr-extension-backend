const axios = require('axios');

class ApifyService {
  constructor() {
    this.apiToken = process.env.APIFY_TOKEN;
    this.actorId = 'tri_angle~fast-similarweb-scraper';
    this.googleSearchActorId = 'apify~google-search-scraper';
    this.baseUrl = 'https://api.apify.com/v2';
  }

  // Metodo per avviare l'analisi di un URL
  async runAnalysis(url, options = {}) {
    try {
      console.log(`🚀 Avvio analisi per URL: ${url}`);
      
      const input = {
        websites: [url],
        maxRequestRetries: 3,
        requestTimeoutSecs: 30,
        ...options
      };

      const response = await axios.post(
        `${this.baseUrl}/acts/${this.actorId}/run-sync-get-dataset-items`,
        input,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            token: this.apiToken
          },
          timeout: 120000 // 2 minuti timeout
        }
      );

      if (response.data && response.data.length > 0) {
        console.log(`✅ Analisi completata per ${url}`);
        return this.processApifyData(response.data[0]);
      } else {
        throw new Error('Nessun dato ricevuto da Apify');
      }

    } catch (error) {
      console.error(`❌ Errore analisi Apify per ${url}:`, error.message);
      throw this.handleApifyError(error);
    }
  }

  // Metodo per avviare analisi asincrona (non aspetta il completamento)
  async runAsyncAnalysis(url, options = {}) {
    try {
      console.log(`🚀 Avvio analisi asincrona per URL: ${url}`);
      
      const input = {
        websites: [url],
        maxRequestRetries: 3,
        requestTimeoutSecs: 30,
        ...options
      };

      const response = await axios.post(
        `${this.baseUrl}/acts/${this.actorId}/runs`,
        input,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            token: this.apiToken
          }
        }
      );

      return {
        runId: response.data.id,
        status: response.data.status,
        startedAt: response.data.startedAt
      };

    } catch (error) {
      console.error(`❌ Errore avvio analisi asincrona per ${url}:`, error.message);
      throw this.handleApifyError(error);
    }
  }

  // Metodo per ottenere i risultati di un run asincrono
  async getRunResults(runId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/actor-runs/${runId}/dataset/items`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`
          },
          params: {
            token: this.apiToken
          }
        }
      );

      if (response.data && response.data.length > 0) {
        return this.processApifyData(response.data[0]);
      }

      return null;
    } catch (error) {
      console.error(`❌ Errore recupero risultati run ${runId}:`, error.message);
      throw this.handleApifyError(error);
    }
  }

  // Metodo per processare i dati grezzi di Apify
  processApifyData(rawData) {
    try {
      // Processa le visite mensili
      const monthlyVisits = new Map();
      if (rawData.estimatedMonthlyVisits) {
        Object.entries(rawData.estimatedMonthlyVisits).forEach(([date, visits]) => {
          monthlyVisits.set(date, visits);
        });
      }

      // Calcola le metriche medie mensili
      const totalVisits = Array.from(monthlyVisits.values()).reduce((sum, visits) => sum + visits, 0);
      const averageMonthlyVisits = monthlyVisits.size > 0 ? Math.round(totalVisits / monthlyVisits.size) : 0;
      const estimatedMonthlyShipments = Math.round(averageMonthlyVisits * 0.02); // 2% conversion rate mensile

      // DEBUG: Log dati raw
      console.log(`🔍 [APIFY] Raw SimilarWeb data for ${rawData.url}:`);
      console.log(`   - estimatedMonthlyVisits entries: ${monthlyVisits.size}`);
      console.log(`   - averageMonthlyVisits: ${averageMonthlyVisits}`);
      console.log(`   - topCountries: ${rawData.topCountries?.length || 0} paesi`);
      if (rawData.topCountries && rawData.topCountries.length > 0) {
        console.log(`   - Top 3 countries:`, rawData.topCountries.slice(0, 3).map(c => 
          `${c.countryCode}: ${(c.visitsShare * 100).toFixed(1)}%`
        ).join(', '));
      }

      // Processa i paesi con calcoli di spedizioni mensili
      const topCountries = rawData.topCountries?.map(country => ({
        ...country,
        estimatedVisits: Math.round(averageMonthlyVisits * country.visitsShare),
        estimatedShipments: Math.round(averageMonthlyVisits * country.visitsShare * 0.02)
      })) || [];

      // Estrai vertical dalla category
      let vertical = '';
      if (rawData.category) {
        const categoryParts = rawData.category.toLowerCase().split('/');
        vertical = categoryParts[categoryParts.length - 1].replace(/_/g, ' ');
      }

      return {
        // Dati base
        url: rawData.url,
        name: rawData.name,
        title: rawData.title,
        description: rawData.description,
        category: rawData.category,
        vertical: vertical,
        
        // Immagini
        icon: rawData.icon,
        previewDesktop: rawData.previewDesktop,
        previewMobile: rawData.previewMobile,
        
        // Rankings
        globalRank: rawData.globalRank,
        countryRank: rawData.countryRank,
        categoryRank: rawData.categoryRank,
        globalCategoryRank: rawData.globalCategoryRank,
        
        // Engagement
        engagements: rawData.engagements,
        
        // Traffic sources
        trafficSources: rawData.trafficSources,
        
        // Keywords
        topKeywords: rawData.topKeywords || [],
        
        // Paesi con calcoli
        topCountries: topCountries,
        
        // Visite mensili
        estimatedMonthlyVisits: monthlyVisits,
        
        // Metriche calcolate
        calculatedMetrics: {
          totalVisitsLast3Months: totalVisits,
          averageMonthlyVisits: averageMonthlyVisits,
          estimatedMonthlyShipments: estimatedMonthlyShipments,
          estimatedShipmentsLast3Months: estimatedMonthlyShipments, // Manteniamo per compatibilità ma ora è mensile
          conversionRate: 0.02,
          topCountryByVisits: topCountries[0]?.countryName || '',
          topCountryByShipments: topCountries[0]?.countryName || ''
        },
        
        // Metadati Apify
        apifyData: {
          scrapedAt: new Date(rawData.scrapedAt),
          snapshotDate: new Date(rawData.snapshotDate),
          processingTime: Date.now()
        },
        
        // Status
        status: 'completed'
      };

    } catch (error) {
      console.error('❌ Errore processamento dati Apify:', error);
      throw new Error('Errore nel processamento dei dati ricevuti');
    }
  }

  // Gestione errori Apify
  handleApifyError(error) {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.response.statusText;
      
      switch (status) {
        case 401:
          return new Error('Token Apify non valido o scaduto');
        case 402:
          return new Error('Credito Apify insufficiente');
        case 429:
          return new Error('Limite di rate Apify superato. Riprova tra qualche minuto');
        case 500:
          return new Error('Errore interno di Apify');
        default:
          return new Error(`Errore Apify (${status}): ${message}`);
      }
    } else if (error.code === 'ECONNABORTED') {
      return new Error('Timeout: Analisi Apify ha impiegato troppo tempo');
    } else {
      return new Error(`Errore di connessione ad Apify: ${error.message}`);
    }
  }

  // Metodo per validare un URL prima dell'analisi
  validateUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Controlla che sia http o https
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('URL deve utilizzare protocollo HTTP o HTTPS');
      }
      
      // Controlla che abbia un hostname valido
      if (!urlObj.hostname || urlObj.hostname.length < 3) {
        throw new Error('Hostname URL non valido');
      }
      
      return true;
    } catch (error) {
      throw new Error(`URL non valido: ${error.message}`);
    }
  }

  // Metodo per Google Search con Apify
  async googleSearch(query, options = {}) {
    try {
      const maxPages = options.maxPagesPerQuery || 5;
      console.log(`🔍 Google Search con Apify per query: "${query}" (max ${maxPages} pagine)`);
      
      const input = {
        queries: query,
        maxPagesPerQuery: maxPages, // Default: 5 pagine (~50 risultati)
        resultsPerPage: 10,
        countryCode: 'it',
        languageCode: 'it',
        mobileResults: false,
        includeUnfilteredResults: false,
        saveHtml: false,
        saveHtmlToKeyValueStore: false,
        ...options
      };

      const response = await axios.post(
        `${this.baseUrl}/acts/${this.googleSearchActorId}/run-sync-get-dataset-items`,
        input,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            token: this.apiToken
          },
          timeout: 180000 // 3 minuti timeout per Google Search
        }
      );

      if (response.data && response.data.length > 0) {
        console.log(`✅ Google Search completata: ${response.data.length} risultati`);
        return this.processGoogleSearchResults(response.data);
      } else {
        console.log('⚠️  Nessun risultato dalla Google Search');
        return [];
      }

    } catch (error) {
      console.error(`❌ Errore Google Search Apify:`, error.message);
      throw this.handleApifyError(error);
    }
  }

  // Processa i risultati di Google Search
  processGoogleSearchResults(rawResults) {
    const processedResults = [];
    
    for (const result of rawResults) {
      if (result.organicResults && Array.isArray(result.organicResults)) {
        for (const organic of result.organicResults) {
          if (organic.url) {
            processedResults.push({
              title: organic.title || '',
              url: organic.url,
              displayedUrl: organic.displayedUrl || '',
              description: organic.description || '',
              position: organic.position || 0,
              emphasizedKeywords: organic.emphasizedKeywords || []
            });
          }
        }
      }
    }
    
    console.log(`✅ Processati ${processedResults.length} URL organici da Google Search`);
    return processedResults;
  }

  /**
   * Crawl website per estrarre contenuto testuale (per enrichment contatti)
   * Usa Website Content Crawler di Apify
   * @param {string} url - URL del sito da crawlare
   * @param {object} options - Opzioni crawler
   * @returns {Promise<Array>} - Array di pagine con testo estratto
   */
  async crawlWebsite(url, options = {}) {
    try {
      console.log(`🕷️  Website Crawler per: ${url}`);
      
      // Estrai dominio
      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      
      const input = {
        startUrls: [{ url: baseUrl }],
        crawlerType: 'playwright:firefox', // Browser per siti dinamici
        maxCrawlPages: 10, // Aumentato a 10 per trovare pagina contatti
        // RIMUOVO includeUrlGlobs - troppo restrittivo!
        // Uso solo excludeUrlGlobs per evitare pagine inutili
        excludeUrlGlobs: [
          '**/*privacy*',
          '**/*cookie*',
          '**/*termini*',
          '**/*terms*',
          '**/*conditions*',
          '**/*product/*', // Evita pagine prodotto singolo
          '**/*prodotto/*',
          '**/*p/*',
          '**/*shop/*',
          '**/*cart*',
          '**/*checkout*',
          '**/*login*',
          '**/*register*',
          '**/*account*',
          '**/*wishlist*',
          '**/*blog/*', // Evita articoli blog
          '**/*news/*',
          '**/*category/*',
          '**/*categoria/*'
        ],
        htmlTransformer: 'readableText', // Estrai solo testo leggibile
        readableTextCharThreshold: 100,
        saveHtml: false,
        saveMarkdown: false,
        saveFiles: false,
        removeElementsCssSelector: 'nav, footer, script, style, [class*="cookie"], [class*="popup"], [role="navigation"]',
        clickElementsCssSelector: '', // Non cliccare elementi
        maxCrawlDepth: 2, // Massimo 2 livelli di profondità
        maxConcurrency: 2, // Aumentato per velocità
        maxRequestRetries: 2,
        requestTimeoutSecs: 30,
        ...options
      };

      console.log(`🔎 Crawl impostato: max ${input.maxCrawlPages} pagine, depth ${input.maxCrawlDepth}`);

      const response = await axios.post(
        `${this.baseUrl}/acts/apify~website-content-crawler/run-sync-get-dataset-items`,
        input,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            token: this.apiToken
          },
          timeout: 180000 // 3 minuti timeout (crawler è più lento)
        }
      );

      if (response.data && response.data.length > 0) {
        console.log(`✅ Website crawl completato: ${response.data.length} pagine estratte`);
        
        // Log pagine trovate
        response.data.forEach((page, idx) => {
          console.log(`  📄 Pagina ${idx + 1}: ${page.url} (${page.text?.length || 0} caratteri)`);
        });
        
        return response.data;
      } else {
        console.log('⚠️  Nessuna pagina crawlata');
        return [];
      }

    } catch (error) {
      console.error(`❌ Errore Website Crawler:`, error.message);
      throw this.handleApifyError(error);
    }
  }

  /**
   * Controlla la piattaforma ecommerce di un sito usando BuiltWith
   * @param {string} url - URL del sito da controllare
   * @returns {Promise<{platform: string|null, isSupported: boolean, allTechnologies: array}>}
   */
  async checkEcommercePlatform(url) {
    console.log(`\n🏗️  [BUILTWITH] checkEcommercePlatform chiamata`);
    console.log(`🏗️  [BUILTWITH] URL input: ${url}`);
    
    try {
      // Estrai solo il dominio (builtwith vuole formato "example.com" senza http)
      console.log(`🏗️  [BUILTWITH] Estrazione dominio...`);
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      const domain = urlObj.hostname.replace(/^www\./i, '');
      
      console.log(`🏗️  [BUILTWITH] Dominio estratto: ${domain}`);
      
      const input = {
        url: domain,
        process: 'gt', // Get Technology Profile
        cache: '1', // Use cache
        retries: 1,
        timeout: 60
      };
      
      console.log(`🏗️  [BUILTWITH] Input preparato:`, JSON.stringify(input, null, 2));
      console.log(`🏗️  [BUILTWITH] Invio richiesta Apify...`);

      const response = await axios.post(
        `${this.baseUrl}/acts/canadesk~builtwith/run-sync-get-dataset-items`,
        input,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            token: this.apiToken
          },
          timeout: 60000 // 60 secondi timeout
        }
      );

      console.log(`🏗️  [BUILTWITH] Risposta ricevuta!`);
      console.log(`🏗️  [BUILTWITH] Status: ${response.status}`);
      console.log(`🏗️  [BUILTWITH] Data type: ${typeof response.data}`);
      console.log(`🏗️  [BUILTWITH] Data length: ${response.data?.length || 0}`);
      
      if (!response.data || response.data.length === 0) {
        console.log(`⚠️  [BUILTWITH] Nessuna tecnologia trovata per ${domain}`);
        return {
          platform: null,
          isSupported: false,
          allTechnologies: []
        };
      }

      // Piattaforme ecommerce supportate (case-insensitive)
      const supportedPlatforms = [
        'woocommerce',
        'wordpress', 
        'prestashop',
        'shopify',
        'storeden',
        'magento',
        'wix',
        'opencart',
        'teamsystem',
        'teamsystem commerce'
      ];

      // Estrai tutte le tecnologie (response.data è già l'array)
      const technologies = response.data;
      const techNames = technologies.map(t => t.name?.toLowerCase() || '');
      
      console.log(`📦 [BUILTWITH] Tecnologie trovate (${techNames.length}):`, techNames.slice(0, 10));

      // Cerca piattaforma ecommerce
      let detectedPlatform = null;
      let isSupported = false;

      for (const tech of technologies) {
        const techName = (tech.name || '').toLowerCase();
        const category = (tech.category || '').toLowerCase();
        
        // Controlla se è una piattaforma supportata
        for (const platform of supportedPlatforms) {
          if (techName.includes(platform) || 
              (category.includes('ecommerce') && techName.includes(platform))) {
            detectedPlatform = platform;
            isSupported = true;
            break;
          }
        }
        
        if (isSupported) break;
      }

      if (detectedPlatform) {
        console.log(`✅ [BUILTWITH] Piattaforma supportata: ${detectedPlatform}`);
      } else {
        console.log(`❌ [BUILTWITH] Piattaforma non supportata o non rilevata`);
      }
      
      const result = {
        platform: detectedPlatform,
        isSupported,
        allTechnologies: technologies.map(t => ({
          name: t.name,
          category: t.category
        }))
      };
      
      console.log(`🏗️  [BUILTWITH] Risultato finale:`, JSON.stringify(result, null, 2));
      console.log(`🏗️  [BUILTWITH] checkEcommercePlatform completato\n`);

      return result;

    } catch (error) {
      console.error(`❌ Errore BuiltWith check:`, error.message);
      console.error(`🔍 Stack trace:`, error.stack);
      console.error(`📡 Response:`, error.response?.data);
      console.error(`📊 Status:`, error.response?.status);
      
      // In caso di errore, assumiamo che sia supportato (per non bloccare tutto)
      console.log(`⚠️  FALLBACK: Accetto lead nonostante errore BuiltWith`);
      return {
        platform: null,
        isSupported: true, // Default: non blocchiamo se BuiltWith fallisce
        allTechnologies: [],
        error: error.message
      };
    }
  }

  // Metodo per ottenere statistiche sull'uso dell'API Apify
  async getApiStats() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/users/me`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`
          },
          params: {
            token: this.apiToken
          }
        }
      );

      return {
        username: response.data.username,
        plan: response.data.plan,
        usageThisMonth: response.data.usageThisMonth
      };
    } catch (error) {
      console.error('Errore recupero statistiche Apify:', error);
      return null;
    }
  }

  /**
   * Pulisce un URL Amazon rimuovendo parametri di tracking non necessari
   * @param {string} amazonUrl - URL Amazon originale
   * @returns {string} - URL pulito
   */
  cleanAmazonUrl(amazonUrl) {
    try {
      const url = new URL(amazonUrl);
      
      // Parametri essenziali da mantenere
      const essentialParams = ['k', 'node', 'i', 'rh', 's', 'page'];
      
      // Crea nuova URLSearchParams solo con parametri essenziali
      const cleanParams = new URLSearchParams();
      essentialParams.forEach(param => {
        if (url.searchParams.has(param)) {
          cleanParams.set(param, url.searchParams.get(param));
        }
      });
      
      // Ricostruisci l'URL
      const cleanUrl = `${url.origin}${url.pathname}${cleanParams.toString() ? '?' + cleanParams.toString() : ''}`;
      return cleanUrl;
      
    } catch (error) {
      console.warn('⚠️  Errore pulizia URL, uso originale:', error.message);
      return amazonUrl;
    }
  }

  /**
   * Scrapa prodotti Amazon usando Free Amazon Product Scraper
   * @param {string} amazonUrl - URL Amazon (categoria, ricerca, etc)
   * @param {object} options - Opzioni scraper
   * @returns {Promise<Array>} - Array di prodotti con dati venditori
   */
  async scrapeAmazonProducts(amazonUrl, options = {}) {
    try {
      console.log(`🛒 Amazon Product Scraper per: ${amazonUrl}`);
      
      // Pulisci l'URL rimuovendo parametri di tracking non necessari
      const cleanedUrl = this.cleanAmazonUrl(amazonUrl);
      console.log(`🧹 URL pulito: ${cleanedUrl}`);
      
      // L'actor "Free Amazon Product Scraper" accetta categoryUrls come array di oggetti
      const input = {
        categoryUrls: [{
          url: cleanedUrl,
          method: 'GET'
        }],
        maxItems: options.maxItems || 50,
        ...options
      };

      console.log(`📦 Scraping Amazon: max ${input.maxItems} prodotti`);
      console.log(`📋 Input Apify:`, JSON.stringify(input, null, 2));
      console.log(`⏳ Chiamata Apify in corso... (timeout: 5 minuti)`);

      const response = await axios.post(
        `${this.baseUrl}/acts/junglee~free-amazon-product-scraper/run-sync-get-dataset-items`,
        input,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            token: this.apiToken
          },
          timeout: 300000 // 5 minuti timeout (Amazon è lento)
        }
      );

      console.log(`📡 Risposta ricevuta da Apify`);
      console.log(`📊 Numero risultati: ${response.data?.length || 0}`);

      if (response.data && response.data.length > 0) {
        console.log(`✅ Amazon scraping completato: ${response.data.length} prodotti`);
        
        // Filtra e processa i risultati
        const products = response.data
          .filter(p => p.seller && p.seller.id && p.seller.url) // Solo prodotti con venditore
          .map(p => ({
            asin: p.asin,
            title: p.title,
            url: p.url,
            price: p.price,
            seller: {
              name: p.seller.name,
              id: p.seller.id,
              url: p.seller.url
            }
          }));
        
        console.log(`📊 Prodotti con venditori: ${products.length}`);
        return products;
      } else {
        console.log('⚠️  Nessun prodotto trovato');
        return [];
      }

    } catch (error) {
      console.error(`❌ Errore Amazon Product Scraper:`, error.message);
      throw this.handleApifyError(error);
    }
  }

  /**
   * Crawla una seller page Amazon per estrarre il testo
   * @param {string} sellerUrl - URL seller page Amazon
   * @param {string} marketplace - Marketplace (amazon.it, amazon.fr, etc)
   * @returns {Promise<string>} - Testo estratto dalla pagina
   */
  async crawlAmazonSellerPage(sellerUrl, marketplace = 'amazon.it') {
    try {
      console.log(`📄 Crawl seller page: ${sellerUrl}`);
      
      // Assicurati che l'URL sia completo
      let fullUrl = sellerUrl;
      if (!sellerUrl.startsWith('http')) {
        fullUrl = `https://www.${marketplace}${sellerUrl.startsWith('/') ? '' : '/'}${sellerUrl}`;
      }
      
      console.log(`🔗 URL completo: ${fullUrl}`);
      
      const input = {
        startUrls: [{ url: fullUrl }],
        crawlerType: 'playwright:firefox', // Browser per siti dinamici
        maxCrawlPages: 1, // Solo questa pagina
        maxCrawlDepth: 0, // Nessun link interno
        htmlTransformer: 'readableText',
        readableTextCharThreshold: 50,
        saveHtml: false,
        saveMarkdown: false,
        saveFiles: false,
        removeElementsCssSelector: 'nav, footer, script, style, [class*="cookie"], header, [role="navigation"]',
        maxConcurrency: 1,
        maxRequestRetries: 2,
        requestTimeoutSecs: 30,
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL']
        }
      };

      console.log(`🕷️  Crawl avviato...`);

      const response = await axios.post(
        `${this.baseUrl}/acts/apify~website-content-crawler/run-sync-get-dataset-items`,
        input,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            token: this.apiToken
          },
          timeout: 120000 // 2 minuti timeout
        }
      );

      if (response.data && response.data.length > 0) {
        const pageText = response.data[0].text || '';
        console.log(`✅ Seller page crawlata: ${pageText.length} caratteri`);
        
        if (pageText.length < 100) {
          throw new Error('Pagina troppo corta o vuota');
        }
        
        return pageText;
      } else {
        throw new Error('Nessun contenuto estratto dalla seller page');
      }

    } catch (error) {
      console.error(`❌ Errore crawl seller page:`, error.message);
      throw this.handleApifyError(error);
    }
  }
}

module.exports = new ApifyService(); 