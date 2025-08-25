const axios = require('axios');

class ApifyService {
  constructor() {
    this.apiToken = process.env.APIFY_TOKEN;
    this.actorId = 'tri_angle~fast-similarweb-scraper';
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
}

module.exports = new ApifyService(); 