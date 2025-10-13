# Nuovo Flusso: Trova Ecommerce Simili con Filtri Automatici

## Panoramica

Il nuovo flusso "Trova ecommerce simili" utilizza Google Search per trovare ecommerce italiani simili a quello analizzato, analizza automaticamente tutti i risultati, calcola le spedizioni per paese e filtra solo i leads qualificati.

## Flusso Completo

### 1. Generazione Query Google
- **API**: Perplexity AI
- **Modello**: `llama-3.1-sonar-small-128k-online` (modello semplice, veloce)
- **Input**: URL, nome e categoria dell'ecommerce originale
- **Output**: Query Google specifica e ottimizzata (es: "scarpe artigianali italiane")

### 2. Google Search
- **API**: Apify Google Search Scraper
- **Parametri**:
  - `maxPagesPerQuery`: 5 (~50 risultati totali)
  - `resultsPerPage`: 10
  - `countryCode`: "it"
  - `languageCode`: "it"
- **Output**: Lista di URL organici da Google

### 3. Analisi Automatica
Per ogni URL trovato:
- Analisi con SimilarWeb tramite Apify
- Calcolo visite mensili per paese
- **Calcolo spedizioni**: `visite mensili paese * 0.02` (2% conversion rate)
- Distinzione tra spedizioni Italia e Estero

### 4. Filtri Qualificazione
Un lead è qualificato se:
- **(≥100 spedizioni/mese in Italia) OPPURE (≥30 spedizioni/mese all'estero)**
- **E**
- **≤10.000 spedizioni/mese in Italia**

### 5. Salvataggio
- Tutti i leads (qualificati e non) vengono salvati nel database
- Collection: `SimilarLeads`
- Include: query Google, spedizioni per paese, stato analisi

## Endpoints API

### POST /api/analysis/:id/similar
Avvia la ricerca di ecommerce simili.

**Request:**
```
POST /api/analysis/507f1f77bcf86cd799439011/similar
Authorization: Bearer <token>
```

**Response immediata:**
```json
{
  "success": true,
  "message": "Ricerca avviata. Il processo continuerà in background.",
  "data": {
    "leadsId": "507f191e810c19729de860ea",
    "status": "processing"
  }
}
```

**Note**: Il processo continua in background. Usare l'endpoint GET per verificare lo stato.

### GET /api/analysis/leads/:leadsId
Ottiene i risultati della ricerca leads.

**Request:**
```
GET /api/analysis/leads/507f191e810c19729de860ea
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f191e810c19729de860ea",
    "originalAnalysis": {
      "_id": "507f1f77bcf86cd799439011",
      "url": "https://example.com",
      "name": "Example Shop"
    },
    "searchQuery": "scarpe artigianali italiane",
    "status": "completed",
    "leads": [
      {
        "url": "https://competitor1.com",
        "name": "Competitor 1",
        "title": "Scarpe Artigianali Made in Italy",
        "category": "fashion/shoes",
        "averageMonthlyVisits": 15000,
        "shipmentsByCountry": [
          {
            "countryName": "Italy",
            "countryCode": "IT",
            "monthlyShipments": 250,
            "monthlyVisits": 12500,
            "visitsShare": 0.833
          },
          {
            "countryName": "France",
            "countryCode": "FR",
            "monthlyShipments": 35,
            "monthlyVisits": 1750,
            "visitsShare": 0.117
          }
        ],
        "totalMonthlyShipments": 285,
        "monthlyShipmentsItaly": 250,
        "monthlyShipmentsAbroad": 35,
        "googleSearchPosition": 1,
        "analysisStatus": "analyzed",
        "analyzedAt": "2025-10-13T10:30:00.000Z"
      }
    ],
    "searchStats": {
      "totalUrlsFound": 48,
      "totalUrlsAnalyzed": 45,
      "totalUrlsQualified": 12,
      "totalUrlsFailed": 3
    },
    "filters": {
      "minShipmentsItaly": 100,
      "minShipmentsAbroad": 30,
      "maxShipmentsItaly": 10000
    },
    "processingTime": {
      "startedAt": "2025-10-13T10:25:00.000Z",
      "completedAt": "2025-10-13T10:32:15.000Z",
      "durationMs": 435000
    },
    "createdAt": "2025-10-13T10:25:00.000Z"
  }
}
```

### GET /api/analysis/leads/my-leads
Lista tutti i leads generati dal BDR.

**Request:**
```
GET /api/analysis/leads/my-leads?page=1&limit=10&status=completed
Authorization: Bearer <token>
```

**Query params:**
- `page`: Numero pagina (default: 1)
- `limit`: Risultati per pagina (default: 10)
- `status`: Filtra per status (processing, completed, failed)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f191e810c19729de860ea",
      "searchQuery": "scarpe artigianali italiane",
      "status": "completed",
      "stats": {
        "totalUrlsFound": 48,
        "totalUrlsAnalyzed": 45,
        "totalUrlsQualified": 12,
        "totalUrlsFailed": 3
      },
      "qualifiedLeads": 12,
      "createdAt": "2025-10-13T10:25:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 15,
    "pages": 2
  }
}
```

## Modello Dati: SimilarLeads

```javascript
{
  originalAnalysis: ObjectId,        // Riferimento all'analisi originale
  generatedBy: ObjectId,              // BDR che ha generato
  searchQuery: String,                // Query Google usata
  
  leads: [{
    // Dati base
    url: String,
    name: String,
    title: String,
    description: String,
    category: String,
    
    // Metriche
    averageMonthlyVisits: Number,
    
    // Spedizioni per paese
    shipmentsByCountry: [{
      countryName: String,
      countryCode: String,
      monthlyShipments: Number,        // Calcolate automaticamente
      monthlyVisits: Number,
      visitsShare: Number
    }],
    
    // Totali
    totalMonthlyShipments: Number,
    monthlyShipmentsItaly: Number,     // Somma per IT
    monthlyShipmentsAbroad: Number,    // Somma per paesi esteri
    
    // Google Search info
    googleSearchPosition: Number,
    googleSearchDescription: String,
    
    // Status
    analysisStatus: String,            // analyzed, failed
    analyzedAt: Date,
    error: String
  }],
  
  // Statistiche
  searchStats: {
    totalUrlsFound: Number,
    totalUrlsAnalyzed: Number,
    totalUrlsQualified: Number,
    totalUrlsFailed: Number
  },
  
  // Filtri applicati
  filters: {
    minShipmentsItaly: 100,
    minShipmentsAbroad: 30,
    maxShipmentsItaly: 10000
  },
  
  // Status ricerca
  status: String,                      // processing, completed, failed
  
  // Timing
  processingTime: {
    startedAt: Date,
    completedAt: Date,
    durationMs: Number
  },
  
  timestamps: true                     // createdAt, updatedAt
}
```

## Formula Calcolo Spedizioni

```javascript
// Per ogni paese
monthlyShipments = monthlyVisits * 0.02  // 2% conversion rate

// Dove:
monthlyVisits = averageMonthlyVisits * country.visitsShare

// Esempio:
// Se un sito ha 10.000 visite/mese e l'Italia ha 70% share:
// monthlyVisitsItaly = 10.000 * 0.70 = 7.000
// monthlyShipmentsItaly = 7.000 * 0.02 = 140
```

## Processo Background

Il processo è asincrono e viene eseguito in background per non bloccare il client:

1. **Immediato**: Crea record SimilarLeads con status `processing`
2. **Background**:
   - Genera query Google (Perplexity)
   - Esegue Google Search (Apify)
   - Per ogni URL:
     - Analizza con SimilarWeb
     - Calcola spedizioni
     - Applica filtri
     - Salva progress ogni 5 URLs
   - Salva risultati finali con status `completed`

## Cache

- I risultati vengono cachati per 24 ore
- Se esiste una ricerca recente per lo stesso ecommerce, viene restituita dalla cache
- La cache è basata su `originalAnalysis` e timestamp

## Permessi

- **BDR**: Può vedere solo i propri leads
- **Admin/Manager**: Possono vedere tutti i leads

## Gestione Errori

- Gli URL che falliscono l'analisi vengono salvati con `analysisStatus: 'failed'`
- Il processo continua anche se alcuni URL falliscono
- I leads con errori NON vengono conteggiati come qualificati
- Gli errori sono loggati in `errorLogs`

## Esempio Utilizzo

```javascript
// 1. Avvia ricerca
const response = await axios.post(
  'http://localhost:5000/api/analysis/507f1f77bcf86cd799439011/similar',
  {},
  { headers: { Authorization: `Bearer ${token}` } }
);

const leadsId = response.data.data.leadsId;

// 2. Polling per verificare completamento
const checkStatus = async () => {
  const result = await axios.get(
    `http://localhost:5000/api/analysis/leads/${leadsId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  if (result.data.data.status === 'completed') {
    console.log('Leads qualificati:', result.data.data.searchStats.totalUrlsQualified);
    console.log('Leads:', result.data.data.leads.filter(l => l.analysisStatus === 'analyzed'));
  } else if (result.data.data.status === 'processing') {
    setTimeout(checkStatus, 5000); // Riprova dopo 5 secondi
  }
};

checkStatus();
```

## Note Tecniche

- **Perplexity API**: Modello semplice per velocità (non deep research)
- **Google Search**: Max 50 risultati per evitare timeout
- **Rate Limiting**: Rispetta i limiti di Apify
- **Timeout**: 3 minuti per Google Search, 2 minuti per SimilarWeb
- **Parallelizzazione**: Gli URL sono processati in sequenza per evitare rate limits

## Prossimi Sviluppi

- [ ] Export CSV dei leads qualificati
- [ ] Notifiche email quando la ricerca è completata
- [ ] Filtri personalizzabili dal client
- [ ] Analisi comparativa tra leads
- [ ] Integrazione con CRM per export automatico

