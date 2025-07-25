const fetch = require('node-fetch');

// Dati corrieri e prezzi
const COURIER_PRICING = {
  "courierServices": {
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
    }
  }
};

// Info assicurazioni XCover
const INSURANCE_INFO = {
  "product": "Sendcloud Spedizioni Sicure",
  "provider": "XCover (integrazione diretta con Sendcloud)",
  "pricing": {
    "currency": "EUR",
    "national": "Valore pacco × 0,6 %",
    "international": "Valore pacco × 1,5 %",
    "note": "Prezzo minimo indicativo a partire da €0,38 per collo"
  },
  "coverage_limits": {
    "max_value_per_parcel": "€5.000",
    "protected_events": [
      "Smarrimento o furto dei pacchi",
      "Danneggiamenti (inclusi macchie, rotture, danni da liquidi, danni strutturali)",
      "Spese per il reso di articoli danneggiati",
      "Costi per rispedire articoli sottratti o smarriti"
    ]
  }
};

class ScriptGeneratorService {
  constructor() {
    this.perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    this.claudeApiKey = process.env.CLAUDE_API_KEY;
  }

  // Analizza il sito con Perplexity
  async analyzeWithPerplexity(siteUrl, siteName) {
    try {
      const prompt = `Analizza l'ecommerce ${siteName} (${siteUrl}) e cerca informazioni specifiche su:

1. CORRIERI UTILIZZATI: Quali corrieri/spedizionieri usa per le consegne? (es. DHL, UPS, Poste Italiane, GLS, BRT, etc.)

2. VALORE MEDIO CARRELLO: Qual è il prezzo medio dei prodotti o range di prezzi? Che tipo di prodotti vende?

3. PESO MEDIO PACCHI: Che tipo di prodotti vende? Sono pesanti o leggeri? Stimare peso medio dei pacchi spediti.

4. ASSICURAZIONE: Offre assicurazione sui pacchi? Menziona protezione delle spedizioni?

5. RECENSIONI E REPUTAZIONE:
   - Quante recensioni ha su Google Maps/Google Business?
   - Quante recensioni ha su Trustpilot?
   - Qual è il rating medio?
   - Ha altre recensioni significative?

6. MERCATI DI SPEDIZIONE: Spedisce solo in Italia o anche all'estero? Quali paesi menziona?

7. INFORMAZIONI AGGIUNTIVE: Qualsiasi altro dettaglio rilevante per le spedizioni, logistica, customer service.

Rispondi in formato strutturato con dati specifici e numerici quando possibile. Se non trovi un'informazione, specifica "Non trovato" per quella sezione.`;

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.perplexityApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: 2000,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;

    } catch (error) {
      console.error('Errore analisi Perplexity:', error);
      throw error;
    }
  }

  // Genera script con Claude
  async generateScriptWithClaude(analysisData, perplexityReport, language = 'it') {
    try {
      const isInternational = this.checkIfInternational(analysisData);
      
      const prompt = `Sei un esperto sales per Sendcloud, la piattaforma di spedizioni #1 in Europa per e-commerce. 

DATI SIMILARWEB:
- Sito: ${analysisData.name} (${analysisData.url})
- Spedizioni stimate mensili: ${analysisData.calculatedMetrics?.estimatedMonthlyShipments || 'N/A'}
- Visite mensili: ${analysisData.calculatedMetrics?.averageMonthlyVisits || 'N/A'}
- Paesi principali: ${analysisData.topCountries?.map(c => `${c.countryName} (${(c.visitsShare * 100).toFixed(1)}%)`).join(', ') || 'N/A'}

ANALISI PERPLEXITY:
${perplexityReport}

CONTESTO SENDCLOUD:
Sendcloud è la piattaforma di spedizioni #1 in Europa, aiuta 25.000+ e-commerce a risparmiare tempo e denaro. Offre:
- Ottimizzazione checkout (riduce abbandono carrello del 44%)
- Automazione etichette e tracking
- 160+ corrieri con tariffe competitive
- Spedizioni internazionali semplificate
- Gestione resi automatizzata
- Tracking personalizzato con il brand del cliente
- Assicurazioni integrate (XCover)

TARIFFE CORRIERI DISPONIBILI:
${JSON.stringify(COURIER_PRICING, null, 2)}

ASSICURAZIONI:
${JSON.stringify(INSURANCE_INFO, null, 2)}

GENERA UN SCRIPT DI VENDITA IN ${language.toUpperCase()} CHE INCLUDA:

1. HOOK DI APERTURA (differenziato):
${isInternational ? 
  'Se spediscono all\'estero >10%: "Salve, chiamo da Sendcloud, sono [nome], ci siamo già sentiti in passato, non so se si ricorda. Vi richiamo perché ho visto che in media spedite X spedizioni verso [paese principale] e dato che siamo la più grande piattaforma in Europa di spedizioni possiamo darvi accesso a tariffe molto buone per quel paese, posso parlare con lei?"' :
  'Se spediscono solo/principalmente in Italia: hook focalizzato su automazione, risparmio tempo, ottimizzazione checkout per aumentare conversioni.'
}

2. DOMANDE DI QUALIFICAZIONE (5-7 domande):
- Basate sui dati trovati
- Per capire volume, problemi attuali, corrieri usati, obiettivi

3. SUGGERIMENTI PRICING:
- Corrieri raccomandati basati su tipo prodotti/peso
- Range prezzi (standard vs. scontato) 
- Info assicurazione se rilevante

4. CHIUSURA con next step

Lo script deve essere:
- Conversazionale e naturale
- Basato sui dati specifici del cliente
- Focalizzato sui benefici Sendcloud più rilevanti
- Professionale ma friendly

Struttura la risposta in sezioni chiare.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.claudeApiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 3000,
          messages: [
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      return data.content[0].text;

    } catch (error) {
      console.error('Errore generazione script Claude:', error);
      throw error;
    }
  }

  // Controlla se spedisce internazionale (>10%)
  checkIfInternational(analysisData) {
    if (!analysisData.topCountries || analysisData.topCountries.length === 0) {
      return false;
    }

    // Trova la percentuale non-italiana
    let italyShare = 0;
    const italyCountry = analysisData.topCountries.find(c => 
      c.countryCode === 'IT' || c.countryName === 'Italy'
    );
    
    if (italyCountry) {
      italyShare = italyCountry.visitsShare;
    }

    const internationalShare = 1 - italyShare;
    return internationalShare > 0.1; // >10% internazionale
  }

  // Estrae dati strutturati dal report Perplexity
  parsePerplexityReport(report) {
    // Parsing intelligente del report per estrarre dati strutturati
    const data = {
      couriers: [],
      averageOrderValue: null,
      averagePackageWeight: null,
      usesInsurance: false,
      reviews: {
        googleMaps: null,
        trustpilot: null,
        averageRating: null
      },
      additionalInfo: report,
      rawResponse: report
    };

    // Estrai corrieri comuni
    const courierKeywords = ['DHL', 'UPS', 'Poste Italiane', 'GLS', 'BRT', 'SDA', 'TNT', 'FedEx'];
    courierKeywords.forEach(courier => {
      if (report.toLowerCase().includes(courier.toLowerCase())) {
        data.couriers.push(courier);
      }
    });

    // Estrai numeri per recensioni (pattern matching)
    const reviewMatches = report.match(/(\d+)\s*(recensioni|reviews)/gi);
    if (reviewMatches) {
      // Logica per estrarre numeri recensioni
    }

    // Estrai info assicurazione
    if (report.toLowerCase().includes('assicura') || 
        report.toLowerCase().includes('protez') ||
        report.toLowerCase().includes('insurance')) {
      data.usesInsurance = true;
    }

    return data;
  }

  // Raccomanda corrieri basati sui dati
  recommendCouriers(perplexityData, isInternational) {
    const recommendations = [];

    if (isInternational) {
      // Aggiungi servizi internazionali
      recommendations.push({
        name: "POSTE DELIVERY BUSINESS PLUS",
        service: "International Standard",
        standardPrice: "€9.83-€54.20",
        discountedPrice: "€7.53-€49.69",
        countries: ["Germania", "Francia", "Spagna", "USA", "etc."]
      });
    } else {
      // Servizi nazionali
      recommendations.push({
        name: "INPOST ITALIA",
        service: "Locker to Locker",
        standardPrice: "€3.61-€3.99",
        discountedPrice: "€2.96-€3.27",
        countries: ["Italia"]
      });
      
      recommendations.push({
        name: "POSTE ITALIANE",
        service: "PDB Standard",
        standardPrice: "€5.67-€12.27",
        discountedPrice: "€5.20-€11.29",
        countries: ["Italia"]
      });
    }

    return recommendations;
  }
}

module.exports = new ScriptGeneratorService(); 