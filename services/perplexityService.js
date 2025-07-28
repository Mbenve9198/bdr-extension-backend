const axios = require('axios');

class PerplexityService {
  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY;
    this.baseUrl = 'https://api.perplexity.ai/chat/completions';
    
    if (!this.apiKey) {
      console.warn('⚠️ PERPLEXITY_API_KEY non configurata');
    }
  }

  // Analizza l'ecommerce con Perplexity
  async analyzeEcommerce(websiteUrl, websiteName = '') {
    if (!this.apiKey) {
      throw new Error('Perplexity API key non configurata');
    }

    const prompt = this.createAnalysisPrompt(websiteUrl, websiteName);
    
    try {
      console.log(`🤖 Chiamata Perplexity per analisi di ${websiteUrl}`);
      console.log('📝 PROMPT INVIATO A PERPLEXITY:');
      console.log('=' * 50);
      console.log(prompt);
      console.log('=' * 50);
      
      const response = await axios.post(this.baseUrl, {
        model: 'sonar-pro',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 secondi timeout
      });

      console.log('📡 RISPOSTA COMPLETA DA PERPLEXITY:');
      console.log('=' * 50);
      console.log('Status:', response.status);
      console.log('Headers:', JSON.stringify(response.headers, null, 2));
      console.log('Data completa:', JSON.stringify(response.data, null, 2));
      console.log('=' * 50);

      const analysisText = response.data.choices[0].message.content;
      
      console.log('📄 TESTO ANALISI ESTRATTO:');
      console.log('=' * 50);
      console.log(analysisText);
      console.log('=' * 50);
      
      // Parsing della risposta
      const parsedData = this.parsePerplexityResponse(analysisText);
      
      console.log('🔧 DATI PARSATI:');
      console.log('=' * 50);
      console.log(JSON.stringify(parsedData, null, 2));
      console.log('=' * 50);
      
      return {
        ...parsedData,
        analysisMetadata: {
          analyzedAt: new Date(),
          confidence: this.calculateConfidence(parsedData),
          dataQuality: this.calculateDataQuality(parsedData),
          perplexityPrompt: prompt,
          perplexityResponse: analysisText
        }
      };

    } catch (error) {
      console.error('❌ Errore chiamata Perplexity:', error.response?.data || error.message);
      throw new Error(`Errore nell'analisi Perplexity: ${error.message}`);
    }
  }

  // Crea il prompt per Perplexity
  createAnalysisPrompt(websiteUrl, websiteName) {
    return `Analizza il sito ecommerce ${websiteUrl} ${websiteName ? `(${websiteName})` : ''} e fornisci le seguenti informazioni specifiche:

1. CORRIERI UTILIZZATI: Quali corrieri/servizi di spedizione utilizza questo ecommerce? (es. BRT, GLS, DHL, Poste Italiane, UPS, FedEx, etc.)

2. PUNTI DI RITIRO: Offre punti di ritiro al checkout? (Locker, punti di ritiro partner, etc.)

3. ASSICURAZIONE PACCHI: Assicura i pacchi che spedisce? Offre questa opzione ai clienti?

4. PESO MEDIO PACCO: Quanto potrebbero pesare in media i pacchi che spedisce? (basati sui prodotti venduti)

5. CARRELLO MEDIO: Qual è il valore medio stimato del carrello di questo ecommerce?

6. RECENSIONI GOOGLE: Quante recensioni ha su Google Maps e qual è il rating medio?

7. RECENSIONI TRUSTPILOT: Quante recensioni ha su Trustpilot e qual è il rating medio?

Fornisci SOLO le informazioni che riesci a trovare effettivamente online. Per ogni punto che non riesci a determinare, rispondi esplicitamente "Sconosciuto" o "Non disponibile".

Formato della risposta:
CORRIERI: [lista corrieri o "Sconosciuto"]
PUNTI_RITIRO: [Sì/No - dettagli o "Sconosciuto"]
ASSICURAZIONE: [Sì/No - dettagli o "Sconosciuto"]
PESO_PACCO: [X kg o "Sconosciuto"]
CARRELLO_MEDIO: [€X o "Sconosciuto"]
GOOGLE_RECENSIONI: [numero recensioni - rating o "Sconosciuto"]
TRUSTPILOT_RECENSIONI: [numero recensioni - rating o "Sconosciuto"]`;
  }

  // Parsing della risposta di Perplexity
  parsePerplexityResponse(responseText) {
    const result = {
      currentCouriers: [],
      pickupPoints: { available: false, details: 'Sconosciuto' },
      insurance: { available: false, details: 'Sconosciuto' },
      averagePackageWeight: { value: null, details: 'Sconosciuto', confidence: 'low' },
      averageCartValue: { value: null, currency: '€', details: 'Sconosciuto', confidence: 'low' },
      googleReviews: { count: null, averageRating: null, details: 'Sconosciuto' },
      trustpilotReviews: { count: null, averageRating: null, details: 'Sconosciuto' }
    };

    try {
      // Parse CORRIERI
      const courierMatch = responseText.match(/CORRIERI:\s*(.+)/i);
      if (courierMatch && !courierMatch[1].toLowerCase().includes('sconosciuto')) {
        result.currentCouriers = courierMatch[1]
          .split(/[,;]/)
          .map(c => c.trim())
          .filter(c => c && c.length > 0);
      }

      // Parse PUNTI_RITIRO
      const pickupMatch = responseText.match(/PUNTI_RITIRO:\s*(.+)/i);
      if (pickupMatch && !pickupMatch[1].toLowerCase().includes('sconosciuto')) {
        result.pickupPoints.details = pickupMatch[1].trim();
        result.pickupPoints.available = pickupMatch[1].toLowerCase().includes('sì');
      }

      // Parse ASSICURAZIONE
      const insuranceMatch = responseText.match(/ASSICURAZIONE:\s*(.+)/i);
      if (insuranceMatch && !insuranceMatch[1].toLowerCase().includes('sconosciuto')) {
        result.insurance.details = insuranceMatch[1].trim();
        result.insurance.available = insuranceMatch[1].toLowerCase().includes('sì');
      }

      // Parse PESO_PACCO
      const weightMatch = responseText.match(/PESO_PACCO:\s*(.+)/i);
      if (weightMatch && !weightMatch[1].toLowerCase().includes('sconosciuto')) {
        const weightText = weightMatch[1];
        const numMatch = weightText.match(/(\d+(?:\.\d+)?)/);
        if (numMatch) {
          result.averagePackageWeight.value = parseFloat(numMatch[1]);
          result.averagePackageWeight.details = weightText;
          result.averagePackageWeight.confidence = 'medium';
        }
      }

      // Parse CARRELLO_MEDIO
      const cartMatch = responseText.match(/CARRELLO_MEDIO:\s*(.+)/i);
      if (cartMatch && !cartMatch[1].toLowerCase().includes('sconosciuto')) {
        const cartText = cartMatch[1];
        const numMatch = cartText.match(/(\d+(?:\.\d+)?)/);
        if (numMatch) {
          result.averageCartValue.value = parseFloat(numMatch[1]);
          result.averageCartValue.details = cartText;
          result.averageCartValue.confidence = 'medium';
        }
      }

      // Parse GOOGLE_RECENSIONI
      const googleMatch = responseText.match(/GOOGLE_RECENSIONI:\s*(.+)/i);
      if (googleMatch && !googleMatch[1].toLowerCase().includes('sconosciuto')) {
        const googleText = googleMatch[1];
        const countMatch = googleText.match(/(\d+)\s*recensioni?/i);
        const ratingMatch = googleText.match(/(\d+(?:\.\d+)?)\s*(?:stelle?|\/5|rating)/i);
        
        if (countMatch) result.googleReviews.count = parseInt(countMatch[1]);
        if (ratingMatch) result.googleReviews.averageRating = parseFloat(ratingMatch[1]);
        result.googleReviews.details = googleText;
      }

      // Parse TRUSTPILOT_RECENSIONI
      const trustpilotMatch = responseText.match(/TRUSTPILOT_RECENSIONI:\s*(.+)/i);
      if (trustpilotMatch && !trustpilotMatch[1].toLowerCase().includes('sconosciuto')) {
        const trustpilotText = trustpilotMatch[1];
        const countMatch = trustpilotText.match(/(\d+)\s*recensioni?/i);
        const ratingMatch = trustpilotText.match(/(\d+(?:\.\d+)?)\s*(?:stelle?|\/5|rating)/i);
        
        if (countMatch) result.trustpilotReviews.count = parseInt(countMatch[1]);
        if (ratingMatch) result.trustpilotReviews.averageRating = parseFloat(ratingMatch[1]);
        result.trustpilotReviews.details = trustpilotText;
      }

    } catch (error) {
      console.error('❌ Errore parsing risposta Perplexity:', error);
    }

    return result;
  }

  // Calcola confidence score
  calculateConfidence(data) {
    let foundData = 0;
    let totalFields = 7;

    if (data.currentCouriers.length > 0) foundData++;
    if (data.pickupPoints.details !== 'Sconosciuto') foundData++;
    if (data.insurance.details !== 'Sconosciuto') foundData++;
    if (data.averagePackageWeight.value !== null) foundData++;
    if (data.averageCartValue.value !== null) foundData++;
    if (data.googleReviews.count !== null) foundData++;
    if (data.trustpilotReviews.count !== null) foundData++;

    const percentage = (foundData / totalFields) * 100;
    
    if (percentage >= 70) return 'high';
    if (percentage >= 40) return 'medium';
    return 'low';
  }

  // Calcola data quality
  calculateDataQuality(data) {
    let foundData = 0;
    let totalFields = 7;

    if (data.currentCouriers.length > 0) foundData++;
    if (data.pickupPoints.details !== 'Sconosciuto') foundData++;
    if (data.insurance.details !== 'Sconosciuto') foundData++;
    if (data.averagePackageWeight.value !== null) foundData++;
    if (data.averageCartValue.value !== null) foundData++;
    if (data.googleReviews.count !== null) foundData++;
    if (data.trustpilotReviews.count !== null) foundData++;

    return Math.round((foundData / totalFields) * 100);
  }

  // Genera raccomandazioni corrieri basate su peso e paesi
  generateCourierRecommendations(countries, averageWeight = 2) {
    const recommendations = [];
    const courierData = this.getCourierData();

    for (const country of countries) {
      const countryRecommendations = this.getRecommendationsForCountry(
        country.countryName, 
        averageWeight, 
        courierData
      );
      recommendations.push(...countryRecommendations);
    }

    return recommendations;
  }

  // Ottieni raccomandazioni per un singolo paese
  getRecommendationsForCountry(countryName, weight, courierData) {
    const recommendations = [];
    const packageSize = this.determinePackageSize(weight);

    // Controlla se il paese è l'Italia
    if (countryName.toLowerCase().includes('ital')) {
      // Raccomandazioni per l'Italia
      recommendations.push(...this.getItalyRecommendations(weight, packageSize, courierData));
    } else {
      // Raccomandazioni internazionali
      recommendations.push(...this.getInternationalRecommendations(countryName, packageSize, courierData));
    }

    return recommendations;
  }

  // Ottieni raccomandazioni per l'Italia
  getItalyRecommendations(weight, packageSize, courierData) {
    const recommendations = [];

    // InPost Italia
    if (weight <= 25 && courierData.INPOST_ITALIA.domesticServices.lockerToLocker[packageSize]) {
      const service = courierData.INPOST_ITALIA.domesticServices.lockerToLocker[packageSize];
      recommendations.push({
        country: 'Italia',
        courierName: 'INPOST ITALIA',
        service: `Locker to Locker ${packageSize}`,
        packageSize: packageSize,
        listPrice: service.listPrice,
        discountedPrice: service.discountedPrice,
        currency: service.currency,
        weightLimit: service.weightLimit
      });
    }

    // Poste Italiane
    const weightRange = this.getPosteWeightRange(weight);
    if (courierData.POSTE_ITALIANE_ITALIA.domesticServices.PDBStandard.pricingByWeight[weightRange]) {
      const service = courierData.POSTE_ITALIANE_ITALIA.domesticServices.PDBStandard.pricingByWeight[weightRange];
      recommendations.push({
        country: 'Italia',
        courierName: 'POSTE ITALIANE',
        service: `PDB Standard ${weightRange}kg`,
        packageSize: 'STANDARD',
        listPrice: service.listPrice,
        discountedPrice: service.discountedPrice,
        currency: service.currency,
        weightLimit: `${weightRange}kg`
      });
    }

    // GLS Express
    const glsWeightRange = this.getGLSWeightRange(weight);
    if (courierData.GLS_EXPRESS.domesticServices.pricingByUnit[glsWeightRange]) {
      const service = courierData.GLS_EXPRESS.domesticServices.pricingByUnit[glsWeightRange];
      recommendations.push({
        country: 'Italia',
        courierName: 'GLS EXPRESS',
        service: `GLS Express ${glsWeightRange}kg`,
        packageSize: 'STANDARD',
        listPrice: service.listPrice,
        discountedPrice: service.discountedPrice,
        currency: service.currency,
        weightLimit: `${glsWeightRange}kg`
      });
    }

    // BRT Express
    const brtWeightRange = this.getBRTWeightRange(weight);
    if (courierData.BRT_EXPRESS.domesticServices.pricingByUnit[brtWeightRange]) {
      const service = courierData.BRT_EXPRESS.domesticServices.pricingByUnit[brtWeightRange];
      recommendations.push({
        country: 'Italia',
        courierName: 'BRT EXPRESS',
        service: `BRT Express ${brtWeightRange}kg`,
        packageSize: 'STANDARD',
        listPrice: service.listPrice,
        discountedPrice: service.discountedPrice,
        currency: service.currency,
        weightLimit: `${brtWeightRange}kg`
      });
    }

    return recommendations;
  }

  // Ottieni raccomandazioni internazionali
  getInternationalRecommendations(countryName, packageSize, courierData) {
    const recommendations = [];

    // InPost internazionale
    const inpostCountries = courierData.INPOST_VERSO_ESTERO.general.countries;
    const normalizedCountry = this.normalizeCountryName(countryName);
    
    if (inpostCountries.some(c => this.normalizeCountryName(c).includes(normalizedCountry))) {
      const inpostCountryKey = this.getInPostCountryKey(countryName);
      if (courierData.INPOST_VERSO_ESTERO.internationalServices[packageSize] && 
          courierData.INPOST_VERSO_ESTERO.internationalServices[packageSize][inpostCountryKey]) {
        const service = courierData.INPOST_VERSO_ESTERO.internationalServices[packageSize][inpostCountryKey];
        recommendations.push({
          country: countryName,
          courierName: 'INPOST INTERNAZIONALE',
          service: service.service,
          packageSize: packageSize,
          listPrice: service.listPrice,
          discountedPrice: service.discountedPrice,
          currency: service.currency,
          weightLimit: '0-25kg'
        });
      }
    }

    // Poste Delivery Business Plus
    const posteGroup = this.getPosteCountryGroup(countryName);
    if (posteGroup && courierData.POSTE_DELIVERY_BUSINESS_PLUS.internationalServices[posteGroup]) {
      const weightRange = '0-1kg'; // Default per esempio
      const service = courierData.POSTE_DELIVERY_BUSINESS_PLUS.internationalServices[posteGroup].pricingByWeight[weightRange];
      if (service) {
        recommendations.push({
          country: countryName,
          courierName: 'POSTE DELIVERY BUSINESS PLUS',
          service: `International Standard ${weightRange}`,
          packageSize: 'STANDARD',
          listPrice: service.listPrice,
          discountedPrice: service.discountedPrice,
          currency: service.currency,
          weightLimit: weightRange
        });
      }
    }

    return recommendations;
  }

  // Determina la taglia del pacco in base al peso
  determinePackageSize(weight) {
    if (weight <= 1) return 'SMALL';
    if (weight <= 5) return 'MEDIUM';
    return 'LARGE';
  }

  // Utility functions per mapping paesi e pesi
  normalizeCountryName(country) {
    return country.toLowerCase()
      .replace(/à|á|ã|â/g, 'a')
      .replace(/è|é|ê/g, 'e')
      .replace(/ì|í|î/g, 'i')
      .replace(/ò|ó|ô|õ/g, 'o')
      .replace(/ù|ú|û/g, 'u');
  }

  getInPostCountryKey(countryName) {
    const normalized = this.normalizeCountryName(countryName);
    
    if (normalized.includes('belg')) return 'Belgio';
    if (normalized.includes('spag')) return 'Spagna';
    if (normalized.includes('fran')) return 'Francia';
    if (normalized.includes('luss') || normalized.includes('paesi') || normalized.includes('oland')) return 'Lussemburgo_Paesi_Bassi';
    if (normalized.includes('polon') || normalized.includes('portog')) return 'Polonia_Portogallo';
    
    return 'Francia'; // Default
  }

  getPosteCountryGroup(countryName) {
    const normalized = this.normalizeCountryName(countryName);
    
    const group1 = ['germania', 'olanda', 'danimarca', 'polonia'];
    const group2 = ['francia', 'spagna', 'repubblica ceca', 'ungheria', 'romania', 'slovacchia'];
    const group3 = ['svezia', 'finlandia', 'bulgaria'];
    
    if (group1.some(c => normalized.includes(c))) return 'Group1';
    if (group2.some(c => normalized.includes(c))) return 'Group2';
    if (group3.some(c => normalized.includes(c))) return 'Group3';
    if (normalized.includes('stati uniti') || normalized.includes('usa')) return 'United_States';
    
    return 'Group2'; // Default
  }

  getPosteWeightRange(weight) {
    if (weight <= 2) return '0-2';
    if (weight <= 5) return '2-5';
    if (weight <= 10) return '5-10';
    if (weight <= 20) return '10-20';
    return '20-30';
  }

  getGLSWeightRange(weight) {
    if (weight <= 2) return '0-2';
    if (weight <= 5) return '2-5';
    if (weight <= 10) return '5-10';
    if (weight <= 30) return '10-30';
    return '30-50';
  }

  getBRTWeightRange(weight) {
    if (weight <= 2) return '0-2';
    if (weight <= 5) return '2-5';
    if (weight <= 10) return '5-10';
    if (weight <= 25) return '10-25';
    if (weight <= 50) return '25-50';
    if (weight <= 100) return '50-100';
    if (weight <= 200) return '100-200';
    if (weight <= 300) return '200-300';
    if (weight <= 400) return '300-400';
    return '400-500';
  }

  // Dati dei corrieri (dal listino fornito)
  getCourierData() {
    return {
      "INPOST_ITALIA": {
        "name": "INPOST ITALIA",
        "general": {
          "fuelIncluded": true,
          "weightType": "peso reale",
          "additionalFees": {
            "sicilySardinia": "+5%"
          },
          "specialConditions": "RITIRO CON MINIMO 10 pacchi (flessibile)"
        },
        "packageSizes": {
          "SMALL": {
            "dimensions": {
              "length": 64,
              "width": 38,
              "height": 8,
              "unit": "cm"
            }
          },
          "MEDIUM": {
            "dimensions": {
              "length": 64,
              "width": 38,
              "height": 19,
              "unit": "cm"
            }
          },
          "LARGE": {
            "dimensions": {
              "length": 64,
              "width": 38,
              "height": 41,
              "unit": "cm"
            }
          }
        },
        "domesticServices": {
          "lockerToLocker": {
            "SMALL": {
              "weightLimit": "0-25kg",
              "listPrice": 3.61,
              "discountedPrice": 2.96,
              "currency": "€"
            },
            "MEDIUM": {
              "weightLimit": "0-25kg",
              "listPrice": 3.74,
              "discountedPrice": 3.07,
              "currency": "€"
            },
            "LARGE": {
              "weightLimit": "0-25kg",
              "listPrice": 3.99,
              "discountedPrice": 3.27,
              "currency": "€"
            }
          }
        }
      },
      "INPOST_VERSO_ESTERO": {
        "name": "INPOST VERSO ESTERO",
        "general": {
          "fuelIncluded": true,
          "weightType": "peso reale",
          "additionalFees": {
            "balearicIslandsCorsica": "€3.20",
            "sicilySardinia": "+5%"
          },
          "specialConditions": "NO RITIRO SOLO DROP OFF",
          "countries": ["Belgio", "Spagna", "Francia", "Lussemburgo", "Paesi Bassi", "Polonia", "Portogallo"]
        },
        "packageSizes": {
          "SMALL": {
            "dimensions": {
              "length": 64,
              "width": 38,
              "height": 8,
              "unit": "cm"
            }
          },
          "MEDIUM": {
            "dimensions": {
              "length": 64,
              "width": 38,
              "height": 19,
              "unit": "cm"
            }
          },
          "LARGE": {
            "dimensions": {
              "length": 64,
              "width": 38,
              "height": 41,
              "unit": "cm"
            }
          }
        },
        "internationalServices": {
          "SMALL": {
            "Belgio": {
              "service": "InPost Internazionale Locker to Locker Small 0-25kg",
              "listPrice": 7.13,
              "discountedPrice": 6.18,
              "currency": "€"
            },
            "Spagna": {
              "service": "InPost Internazionale Locker to Locker Small 0-25kg",
              "listPrice": 8.27,
              "discountedPrice": 7.17,
              "currency": "€"
            },
            "Francia": {
              "service": "InPost Internazionale Locker to Locker Small 0-25kg",
              "listPrice": 6.58,
              "discountedPrice": 5.70,
              "currency": "€"
            },
            "Lussemburgo_Paesi_Bassi": {
              "service": "InPost Internazionale Locker to Locker Small 0-25kg",
              "listPrice": 7.13,
              "discountedPrice": 6.18,
              "currency": "€"
            },
            "Polonia_Portogallo": {
              "service": "InPost Internazionale Locker to Locker Small 0-25kg",
              "listPrice": 8.24,
              "discountedPrice": 7.15,
              "currency": "€"
            }
          },
          "MEDIUM": {
            "Belgio": {
              "service": "InPost Internazionale Locker to Locker Medium 0-25kg",
              "listPrice": 7.67,
              "discountedPrice": 6.65,
              "currency": "€"
            },
            "Spagna": {
              "service": "InPost Internazionale Locker to Locker Medium 0-25kg",
              "listPrice": 7.69,
              "discountedPrice": 6.67,
              "currency": "€"
            },
            "Francia": {
              "service": "InPost Internazionale Locker to Locker Medium 0-25kg",
              "listPrice": 7.07,
              "discountedPrice": 6.13,
              "currency": "€"
            },
            "Lussemburgo_Paesi_Bassi": {
              "service": "InPost Internazionale Locker to Locker Medium 0-25kg",
              "listPrice": 7.67,
              "discountedPrice": 6.65,
              "currency": "€"
            },
            "Polonia_Portogallo": {
              "service": "InPost Internazionale Locker to Locker Medium 0-25kg",
              "listPrice": 8.87,
              "discountedPrice": 7.69,
              "currency": "€"
            }
          },
          "LARGE": {
            "Belgio": {
              "service": "InPost Internazionale Locker to Locker Large 0-25kg",
              "listPrice": 11.15,
              "discountedPrice": 9.67,
              "currency": "€"
            },
            "Spagna": {
              "service": "InPost Internazionale Locker to Locker Large 0-25kg",
              "listPrice": 11.75,
              "discountedPrice": 10.19,
              "currency": "€"
            },
            "Francia": {
              "service": "InPost Internazionale Locker to Locker Large 0-25kg",
              "listPrice": 10.55,
              "discountedPrice": 9.15,
              "currency": "€"
            },
            "Lussemburgo_Paesi_Bassi": {
              "service": "InPost Internazionale Locker to Locker Large 0-25kg",
              "listPrice": 11.15,
              "discountedPrice": 9.67,
              "currency": "€"
            },
            "Polonia_Portogallo": {
              "service": "InPost Internazionale Locker to Locker Large 0-25kg",
              "listPrice": 12.47,
              "discountedPrice": 10.81,
              "currency": "€"
            }
          }
        }
      },
      "POSTE_ITALIANE_ITALIA": {
        "name": "POSTE ITALIANE ITALIA",
        "general": {
          "fuelIncluded": true,
          "weightType": "peso reale",
          "maxDimensions": {
            "length": 280,
            "height": 170,
            "totalDimensions": 450,
            "unit": "cm",
            "note": "Dimensioni totali massime (L + l + A)"
          }
        },
        "domesticServices": {
          "PDBStandard": {
            "pricingByWeight": {
              "0-2": {
                "listPrice": 5.67,
                "discountedPrice": 5.20,
                "currency": "€"
              },
              "2-5": {
                "listPrice": 6.50,
                "discountedPrice": 5.99,
                "currency": "€"
              },
              "5-10": {
                "listPrice": 8.36,
                "discountedPrice": 7.76,
                "currency": "€"
              },
              "10-20": {
                "listPrice": 9.94,
                "discountedPrice": 9.14,
                "currency": "€"
              },
              "20-30": {
                "listPrice": 12.27,
                "discountedPrice": 11.29,
                "currency": "€"
              }
            }
          }
        }
      },
      "GLS_EXPRESS": {
        "name": "GLS EXPRESS",
        "general": {
          "weightType": "peso volumetrico",
          "weightCalculation": "lunghezza x larghezza x altezza (in cm)/3333",
          "includedFees": ["fuel", "toll"],
          "maxDimensions": {
            "length": 200,
            "width": 150,
            "height": 130,
            "unit": "cm"
          }
        },
        "domesticServices": {
          "pricingByUnit": {
            "0-2": {
              "listPrice": 5.10,
              "discountedPrice": 4.65,
              "currency": "€"
            },
            "2-5": {
              "listPrice": 5.56,
              "discountedPrice": 5.07,
              "currency": "€"
            },
            "5-10": {
              "listPrice": 7.78,
              "discountedPrice": 7.12,
              "currency": "€"
            },
            "10-30": {
              "listPrice": 16.11,
              "discountedPrice": 13.37,
              "currency": "€"
            },
            "30-50": {
              "listPrice": 22.78,
              "discountedPrice": 18.90,
              "currency": "€"
            }
          }
        }
      },
      "BRT_EXPRESS": {
        "name": "BRT EXPRESS",
        "general": {
          "fuelIncluded": true,
          "weightType": "peso reale"
        },
        "packageSpecs": {
          "colli": {
            "maxDimensions": {
              "width": 150,
              "height": 75,
              "length": 75,
              "unit": "cm"
            },
            "restrictions": "La somma di due lati non deve superare i 180 cm."
          },
          "bancali": {
            "basePallet": "120x120cm",
            "maxHeight": 180,
            "unit": "cm"
          }
        },
        "domesticServices": {
          "pricingByUnit": {
            "0-2": {
              "listPrice": 5.51,
              "discountedPrice": 4.98,
              "currency": "€"
            },
            "2-5": {
              "listPrice": 5.84,
              "discountedPrice": 5.30,
              "currency": "€"
            },
            "5-10": {
              "listPrice": 8.48,
              "discountedPrice": 7.89,
              "currency": "€"
            },
            "10-25": {
              "listPrice": 11.97,
              "discountedPrice": 11.34,
              "currency": "€"
            },
            "25-50": {
              "listPrice": 18.93,
              "discountedPrice": 17.74,
              "currency": "€"
            },
            "50-100": {
              "listPrice": 33.83,
              "discountedPrice": 30.30,
              "currency": "€"
            },
            "100-200": {
              "listPrice": 67.65,
              "discountedPrice": 60.61,
              "currency": "€"
            },
            "200-300": {
              "listPrice": 101.47,
              "discountedPrice": 90.91,
              "currency": "€"
            },
            "300-400": {
              "listPrice": 135.28,
              "discountedPrice": 121.22,
              "currency": "€"
            },
            "400-500": {
              "listPrice": 169.11,
              "discountedPrice": 151.52,
              "currency": "€"
            }
          }
        }
      },
      "POSTE_DELIVERY_BUSINESS_PLUS": {
        "name": "POSTE DELIVERY BUSINESS PLUS",
        "general": {
          "serviceType": "International standard",
          "notes": "Il servizio international standard ha dimensioni massime più ampie",
          "fuelIncluded": true,
          "weightType": "peso reale",
          "maxDimensions": {
            "length": 120,
            "width": 55,
            "height": 50,
            "totalDimensions": 225,
            "unit": "cm",
            "note": "Dimensione totale massima (L + W + H)"
          }
        },
        "internationalServices": {
          "Group1": {
            "countries": ["Germania", "Olanda", "Danimarca", "Polonia"],
            "pricingByWeight": {
              "0-1kg": {
                "listPrice": 9.83,
                "discountedPrice": 7.53,
                "currency": "€"
              },
              "1-2kg": {
                "listPrice": 10.21,
                "discountedPrice": 7.83,
                "currency": "€"
              },
              "2-3kg": {
                "listPrice": 11.19,
                "discountedPrice": 8.57,
                "currency": "€"
              },
              "3-4kg": {
                "listPrice": 11.66,
                "discountedPrice": 8.93,
                "currency": "€"
              },
              "4-5kg": {
                "listPrice": 12.03,
                "discountedPrice": 9.22,
                "currency": "€"
              }
            }
          },
          "Group2": {
            "countries": ["Francia", "Spagna", "Repubblica Ceca", "Ungheria", "Romania", "Slovacchia"],
            "pricingByWeight": {
              "0-1kg": {
                "listPrice": 12.35,
                "discountedPrice": 9.46,
                "currency": "€"
              },
              "1-2kg": {
                "listPrice": 13.38,
                "discountedPrice": 10.26,
                "currency": "€"
              },
              "2-3kg": {
                "listPrice": 14.76,
                "discountedPrice": 11.32,
                "currency": "€"
              },
              "3-4kg": {
                "listPrice": 16.09,
                "discountedPrice": 12.34,
                "currency": "€"
              },
              "4-5kg": {
                "listPrice": 16.60,
                "discountedPrice": 12.72,
                "currency": "€"
              }
            }
          },
          "Group3": {
            "countries": ["Svezia", "Finlandia", "Bulgaria"],
            "pricingByWeight": {
              "0-1kg": {
                "listPrice": 17.71,
                "discountedPrice": 13.58,
                "currency": "€"
              },
              "1-2kg": {
                "listPrice": 19.34,
                "discountedPrice": 14.82,
                "currency": "€"
              },
              "2-3kg": {
                "listPrice": 20.73,
                "discountedPrice": 15.89,
                "currency": "€"
              },
              "3-4kg": {
                "listPrice": 21.87,
                "discountedPrice": 16.76,
                "currency": "€"
              },
              "4-5kg": {
                "listPrice": 24.05,
                "discountedPrice": 18.44,
                "currency": "€"
              }
            }
          },
          "United_States": {
            "countries": ["Stati Uniti"],
            "pricingByWeight": {
              "0-1kg": {
                "listPrice": 36.09,
                "discountedPrice": 30.00,
                "currency": "€"
              },
              "1-2kg": {
                "listPrice": 40.03,
                "discountedPrice": 35.88,
                "currency": "€"
              },
              "2-3kg": {
                "listPrice": 45.03,
                "discountedPrice": 38.87,
                "currency": "€"
              },
              "3-4kg": {
                "listPrice": 50.93,
                "discountedPrice": 46.77,
                "currency": "€"
              },
              "4-5kg": {
                "listPrice": 54.20,
                "discountedPrice": 49.69,
                "currency": "€"
              }
            }
          }
        }
      }
    };
  }
}

module.exports = new PerplexityService(); 