const axios = require('axios');

class ApifyService {
  constructor() {
    this.apiToken = process.env.APIFY_TOKEN;
    this.actorId = 'curious_coder~similarweb-scraper';
    this.googleSearchActorId = 'apify~google-search-scraper';
    this.baseUrl = 'https://api.apify.com/v2';
  }

  // Mapping country code ISO 3166-1 numeric → Country Name
  getCountryName(countryCode) {
    const countryMap = {
      4: 'Afghanistan', 8: 'Albania', 12: 'Algeria', 20: 'Andorra', 24: 'Angola',
      28: 'Antigua and Barbuda', 31: 'Azerbaijan', 32: 'Argentina', 36: 'Australia',
      40: 'Austria', 44: 'Bahamas', 48: 'Bahrain', 50: 'Bangladesh', 51: 'Armenia',
      52: 'Barbados', 56: 'Belgium', 60: 'Bermuda', 64: 'Bhutan', 68: 'Bolivia',
      70: 'Bosnia and Herzegovina', 72: 'Botswana', 76: 'Brazil', 84: 'Belize',
      86: 'British Indian Ocean Territory', 90: 'Solomon Islands', 92: 'British Virgin Islands',
      96: 'Brunei', 100: 'Bulgaria', 104: 'Myanmar', 108: 'Burundi', 112: 'Belarus',
      116: 'Cambodia', 120: 'Cameroon', 124: 'Canada', 132: 'Cape Verde', 136: 'Cayman Islands',
      140: 'Central African Republic', 144: 'Sri Lanka', 148: 'Chad', 152: 'Chile',
      156: 'China', 158: 'Taiwan', 170: 'Colombia', 174: 'Comoros', 175: 'Mayotte',
      178: 'Congo', 180: 'Democratic Republic of the Congo', 184: 'Cook Islands',
      188: 'Costa Rica', 191: 'Croatia', 192: 'Cuba', 196: 'Cyprus', 203: 'Czech Republic',
      204: 'Benin', 208: 'Denmark', 212: 'Dominica', 214: 'Dominican Republic',
      218: 'Ecuador', 222: 'El Salvador', 226: 'Equatorial Guinea', 231: 'Ethiopia',
      232: 'Eritrea', 233: 'Estonia', 234: 'Faroe Islands', 238: 'Falkland Islands',
      242: 'Fiji', 246: 'Finland', 250: 'France', 254: 'French Guiana', 258: 'French Polynesia',
      262: 'Djibouti', 266: 'Gabon', 268: 'Georgia', 270: 'Gambia', 275: 'Palestine',
      276: 'Germany', 288: 'Ghana', 292: 'Gibraltar', 296: 'Kiribati', 300: 'Greece',
      304: 'Greenland', 308: 'Grenada', 312: 'Guadeloupe', 316: 'Guam', 320: 'Guatemala',
      324: 'Guinea', 328: 'Guyana', 332: 'Haiti', 336: 'Vatican City', 340: 'Honduras',
      344: 'Hong Kong', 348: 'Hungary', 352: 'Iceland', 356: 'India', 360: 'Indonesia',
      364: 'Iran', 368: 'Iraq', 372: 'Ireland', 376: 'Israel', 380: 'Italy',
      384: 'Ivory Coast', 388: 'Jamaica', 392: 'Japan', 398: 'Kazakhstan', 400: 'Jordan',
      404: 'Kenya', 408: 'North Korea', 410: 'South Korea', 414: 'Kuwait', 417: 'Kyrgyzstan',
      418: 'Laos', 422: 'Lebanon', 426: 'Lesotho', 428: 'Latvia', 430: 'Liberia',
      434: 'Libya', 438: 'Liechtenstein', 440: 'Lithuania', 442: 'Luxembourg', 446: 'Macau',
      450: 'Madagascar', 454: 'Malawi', 458: 'Malaysia', 462: 'Maldives', 466: 'Mali',
      470: 'Malta', 474: 'Martinique', 478: 'Mauritania', 480: 'Mauritius', 484: 'Mexico',
      492: 'Monaco', 496: 'Mongolia', 498: 'Moldova', 499: 'Montenegro', 500: 'Montserrat',
      504: 'Morocco', 508: 'Mozambique', 512: 'Oman', 516: 'Namibia', 520: 'Nauru',
      524: 'Nepal', 528: 'Netherlands', 531: 'Curaçao', 533: 'Aruba', 534: 'Sint Maarten',
      540: 'New Caledonia', 548: 'Vanuatu', 554: 'New Zealand', 558: 'Nicaragua',
      562: 'Niger', 566: 'Nigeria', 570: 'Niue', 574: 'Norfolk Island', 578: 'Norway',
      580: 'Northern Mariana Islands', 583: 'Micronesia', 584: 'Marshall Islands',
      585: 'Palau', 586: 'Pakistan', 591: 'Panama', 598: 'Papua New Guinea',
      600: 'Paraguay', 604: 'Peru', 608: 'Philippines', 612: 'Pitcairn Islands',
      616: 'Poland', 620: 'Portugal', 624: 'Guinea-Bissau', 626: 'Timor-Leste',
      630: 'Puerto Rico', 634: 'Qatar', 638: 'Réunion', 642: 'Romania', 643: 'Russia',
      646: 'Rwanda', 652: 'Saint Barthélemy', 654: 'Saint Helena', 659: 'Saint Kitts and Nevis',
      660: 'Anguilla', 662: 'Saint Lucia', 663: 'Saint Martin', 666: 'Saint Pierre and Miquelon',
      670: 'Saint Vincent and the Grenadines', 674: 'San Marino', 678: 'São Tomé and Príncipe',
      682: 'Saudi Arabia', 686: 'Senegal', 688: 'Serbia', 690: 'Seychelles', 694: 'Sierra Leone',
      702: 'Singapore', 703: 'Slovakia', 704: 'Vietnam', 705: 'Slovenia', 706: 'Somalia',
      710: 'South Africa', 716: 'Zimbabwe', 724: 'Spain', 728: 'South Sudan', 729: 'Sudan',
      732: 'Western Sahara', 740: 'Suriname', 744: 'Svalbard and Jan Mayen', 748: 'Eswatini',
      752: 'Sweden', 756: 'Switzerland', 760: 'Syria', 762: 'Tajikistan', 764: 'Thailand',
      768: 'Togo', 772: 'Tokelau', 776: 'Tonga', 780: 'Trinidad and Tobago', 784: 'United Arab Emirates',
      788: 'Tunisia', 792: 'Turkey', 795: 'Turkmenistan', 796: 'Turks and Caicos Islands',
      798: 'Tuvalu', 800: 'Uganda', 804: 'Ukraine', 807: 'North Macedonia', 818: 'Egypt',
      826: 'United Kingdom', 831: 'Guernsey', 832: 'Jersey', 833: 'Isle of Man',
      834: 'Tanzania', 840: 'United States', 850: 'U.S. Virgin Islands', 854: 'Burkina Faso',
      858: 'Uruguay', 860: 'Uzbekistan', 862: 'Venezuela', 876: 'Wallis and Futuna',
      882: 'Samoa', 887: 'Yemen', 894: 'Zambia'
    };
    return countryMap[countryCode] || `Country ${countryCode}`;
  }

  // Metodo per avviare l'analisi di un URL
  async runAnalysis(url, options = {}) {
    try {
      console.log(`🚀 Avvio analisi per URL: ${url}`);
      
      // 🆕 Il nuovo actor curious_coder~similarweb-scraper usa "domains" invece di "websites"
      const input = {
        domains: [url],
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
      
      // 🆕 Il nuovo actor curious_coder~similarweb-scraper usa "domains" invece di "websites"
      const input = {
        domains: [url],
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
      console.log('📊 Processamento dati SimilarWeb...');
      
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

      console.log(`📈 Visite medie mensili: ${averageMonthlyVisits}`);
      console.log(`📦 Spedizioni stimate mensili: ${estimatedMonthlyShipments}`);

      // 🆕 Processa i paesi (nuovo actor usa topCountryShares invece di topCountries)
      const rawCountries = rawData.topCountryShares || rawData.topCountries || [];
      const topCountries = rawCountries.map(country => {
        // Supporta sia il nuovo formato (topCountryShares) che il vecchio (topCountries)
        const countryCode = country.CountryCode || country.countryCode;
        const countryName = country.countryName || this.getCountryName(country.Country || countryCode);
        const visitsShare = country.Value !== undefined ? country.Value : country.visitsShare;
        
        return {
          countryCode: countryCode,
          countryName: countryName,
          countryUrlCode: country.countryUrlCode || countryCode?.toLowerCase(),
          visitsShare: visitsShare,
          estimatedVisits: Math.round(averageMonthlyVisits * visitsShare),
          estimatedShipments: Math.round(averageMonthlyVisits * visitsShare * 0.02)
        };
      });

      console.log(`🌍 Paesi processati: ${topCountries.length}`);
      if (topCountries.length > 0) {
        console.log(`   Top paese: ${topCountries[0].countryName} (${(topCountries[0].visitsShare * 100).toFixed(1)}% visite)`);
      }

      // Estrai vertical dalla category
      let vertical = '';
      if (rawData.category) {
        const categoryParts = rawData.category.toLowerCase().split('/');
        vertical = categoryParts[categoryParts.length - 1].replace(/_/g, ' ');
      }

      // 🆕 Gestisci rankings (nuovo actor ha formato diverso dal modello)
      // Il modello si aspetta oggetti, il nuovo actor restituisce valori semplici
      
      // globalRank: numero → { rank: Number }
      let globalRank = null;
      if (rawData.globalRank) {
        globalRank = typeof rawData.globalRank === 'object' 
          ? rawData.globalRank 
          : { rank: Number(rawData.globalRank) };
      }

      // countryRank: oggetto con Country, CountryCode, Rank
      let countryRank = null;
      if (rawData.countryRank && typeof rawData.countryRank === 'object') {
        countryRank = {
          countryCode: rawData.countryRank.CountryCode || rawData.countryRank.countryCode,
          rank: Number(rawData.countryRank.Rank || rawData.countryRank.rank)
        };
      }

      // categoryRank: stringa/numero → { category: String, rank: Number }
      let categoryRank = null;
      if (rawData.categoryRank) {
        categoryRank = typeof rawData.categoryRank === 'object'
          ? rawData.categoryRank
          : { 
              category: rawData.category || 'unknown',
              rank: Number(rawData.categoryRank)
            };
      }

      return {
        // Dati base
        url: rawData.domain || rawData.url,
        name: rawData.name || rawData.domain || rawData.url,
        title: rawData.title,
        description: rawData.description,
        category: rawData.category,
        vertical: vertical,
        
        // Immagini
        icon: rawData.icon,
        previewDesktop: rawData.previewDesktop,
        previewMobile: rawData.previewMobile,
        screenshot: rawData.screenshot,
        
        // Rankings (formato adattato al modello)
        globalRank: globalRank,
        countryRank: countryRank,
        categoryRank: categoryRank,
        globalCategoryRank: rawData.globalCategoryRank,
        
        // Engagement
        engagements: rawData.engagements || {
          bounceRate: rawData.bounceRate,
          pagesPerVisit: rawData.pagesPerVisit,
          timeOnSite: rawData.timeOnSite,
          visits: rawData.visits
        },
        
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
          scrapedAt: rawData.scrapedAt ? new Date(rawData.scrapedAt) : new Date(),
          snapshotDate: rawData.snapshotDate ? new Date(rawData.snapshotDate) : new Date(),
          processingTime: Date.now()
        },
        
        // Status
        status: 'completed'
      };

    } catch (error) {
      console.error('❌ Errore processamento dati Apify:', error);
      console.error('📊 Raw data:', JSON.stringify(rawData, null, 2));
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
      console.log(`🔍 Google Search con Apify per query: "${query}"`);
      
      const input = {
        queries: query,
        maxPagesPerQuery: 5, // ~10 risultati per pagina = ~50 risultati totali
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