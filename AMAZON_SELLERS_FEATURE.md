# 🛒 Funzionalità Trova Venditori Amazon

## 📋 Panoramica

Questa nuova funzionalità permette di scrapare prodotti Amazon, estrarre i venditori e analizzare le loro informazioni di compliance (Partita IVA, telefono, email, indirizzo) per trovare potenziali lead italiani.

## 🎯 Come Funziona

### 1. **L'utente apre l'estensione su una pagina Amazon**
   - Pagina di ricerca (es: `https://www.amazon.it/s?k=scarpe`)
   - Pagina categoria (es: `https://www.amazon.it/Elettronica/b/ref=...`)
   - Pagina risultati con filtri

### 2. **Clicca sul bottone "Trova Venditori Amazon"**
   - L'estensione invia l'URL Amazon al backend
   - Il backend avvia il processo in background

### 3. **Processo Backend (Automatico)**

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Scraping Prodotti Amazon (Apify)                  │
│  → Usa "Free Amazon Product Scraper"                        │
│  → Estrae max 50 prodotti dalla pagina                      │
│  → Per ogni prodotto: ASIN, titolo, prezzo, seller info     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Estrazione Venditori Unici                        │
│  → Raggruppa per Seller ID                                  │
│  → Elimina duplicati (stesso venditore su più prodotti)     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Analisi Ogni Venditore (Loop)                     │
│                                                             │
│  3A. Controlla se già analizzato (riusa dati)              │
│  3B. Crawl Seller Page Amazon (Apify Website Crawler)      │
│      → Estrae testo dalla pagina "Informazioni venditore"  │
│                                                             │
│  3C. Estrai Compliance con Gemini AI                       │
│      → Cerca sezione "Informazioni dettagliate venditore"  │
│      → Estrae: Tipo venditore, P.IVA, Tel, Email, Indirizzo│
│      → Multilingua: IT, FR, DE, ES, EN                     │
│                                                             │
│  3D. Filtra per Telefono Italiano                          │
│      → ACCETTA: +39..., 02..., 333..., etc                 │
│      → SCARTA: numeri non italiani                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Risultati Finali                                  │
│  → Venditori qualificati (con telefono italiano)           │
│  → Salvati nel database MongoDB                            │
│  → Disponibili nell'UI per export/contatto                 │
└─────────────────────────────────────────────────────────────┘
```

## 🔌 API Endpoints

### 1. **Avvia Ricerca Venditori**
```http
POST /api/amazon/find-sellers
Authorization: Bearer <token>

Body:
{
  "amazonUrl": "https://www.amazon.it/s?k=scarpe+donna"
}

Response:
{
  "success": true,
  "message": "Ricerca venditori avviata. Il processo continuerà in background.",
  "data": {
    "sellersId": "60f7b3b3b3b3b3b3b3b3b3b3",
    "status": "processing",
    "marketplace": "amazon.it"
  }
}
```

### 2. **Ottieni Risultati Ricerca**
```http
GET /api/amazon/sellers/:sellersId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "sourceUrl": "https://www.amazon.it/s?k=scarpe+donna",
    "marketplace": "amazon.it",
    "status": "completed",
    "sellers": [
      {
        "sellerName": "MyShop Italia",
        "sellerId": "A1234567890ABC",
        "sellerUrl": "/gp/help/seller/...",
        "productAsin": "B09X7MPX8L",
        "productTitle": "Scarpe donna...",
        "compliance": {
          "sellerType": "Business",
          "vatNumber": "IT12345678901",
          "phoneNumber": "+39 02 1234567",
          "emailAddress": "info@myshop.it",
          "address": "Via Roma 123, 20100 Milano, Italy",
          "marketplace": "amazon.it",
          "languageDetected": "it"
        },
        "analysisStatus": "completed"
      }
    ],
    "qualifiedSellers": [...], // Solo con telefono italiano
    "searchStats": {
      "totalProductsScraped": 50,
      "totalSellersFound": 50,
      "totalSellersUnique": 25,
      "totalSellersAnalyzed": 25,
      "totalSellersQualified": 12,
      "totalSellersRejected": 13
    }
  }
}
```

### 3. **Lista Ricerche Utente**
```http
GET /api/amazon/my-searches?page=1&limit=10
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "sourceUrl": "https://www.amazon.it/s?k=...",
      "marketplace": "amazon.it",
      "status": "completed",
      "stats": { ... },
      "qualifiedSellers": 12,
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "pagination": { ... }
}
```

### 4. **Cancella Ricerca**
```http
DELETE /api/amazon/sellers/:sellersId
Authorization: Bearer <token>
```

## 📊 Modello Dati

### AmazonSellers Schema
```javascript
{
  generatedBy: ObjectId,        // Riferimento User
  sourceUrl: String,             // URL Amazon originale
  marketplace: String,           // amazon.it, amazon.fr, etc.
  searchQuery: String,           // Query di ricerca se presente
  
  sellers: [{
    // Dati prodotto
    productAsin: String,
    productTitle: String,
    productUrl: String,
    
    // Dati venditore base
    sellerName: String,
    sellerId: String,
    sellerUrl: String,
    
    // Compliance (estratti da Gemini)
    compliance: {
      sellerType: String,        // "Business" o "Individual"
      vatNumber: String,          // Partita IVA
      phoneNumber: String,        // Telefono
      emailAddress: String,       // Email
      address: String,            // Indirizzo completo
      complianceStatement: String,// Dichiarazioni legali
      marketplace: String,
      languageDetected: String,
      extractedAt: Date,
      rawText: String            // Testo raw (debug)
    },
    
    // Status
    analysisStatus: String,      // pending|crawling|analyzing|completed|failed|rejected
    analyzedAt: Date,
    error: String,
    notes: String,
    isDuplicate: Boolean
  }],
  
  searchStats: {
    totalProductsScraped: Number,
    totalSellersFound: Number,
    totalSellersUnique: Number,
    totalSellersAnalyzed: Number,
    totalSellersQualified: Number,
    totalSellersRejected: Number
  },
  
  status: String,                // processing|completed|failed
  processingTime: { ... },
  errorLogs: [...]
}
```

## 🎨 Integrazione Frontend (Estensione)

### Esempio Codice Estensione

```javascript
// content.js - Rileva se siamo su Amazon
if (window.location.hostname.includes('amazon.')) {
  // Mostra bottone "Trova Venditori Amazon"
  showAmazonSellersButton();
}

function showAmazonSellersButton() {
  const button = document.createElement('button');
  button.textContent = '🛒 Trova Venditori Amazon';
  button.className = 'bdr-amazon-sellers-btn';
  button.addEventListener('click', findAmazonSellers);
  document.body.appendChild(button);
}

async function findAmazonSellers() {
  const currentUrl = window.location.href;
  
  // Chiama API backend
  const response = await fetch('https://your-backend.com/api/amazon/find-sellers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      amazonUrl: currentUrl
    })
  });
  
  const data = await response.json();
  
  if (data.success) {
    const sellersId = data.data.sellersId;
    
    // Mostra notifica
    showNotification('Ricerca avviata! Ti notificheremo quando sarà completata.');
    
    // Poll per risultati (ogni 10 secondi)
    pollForResults(sellersId);
  }
}

async function pollForResults(sellersId) {
  const interval = setInterval(async () => {
    const response = await fetch(`https://your-backend.com/api/amazon/sellers/${sellersId}`, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });
    
    const data = await response.json();
    
    if (data.data.status === 'completed') {
      clearInterval(interval);
      
      // Mostra risultati
      showResults(data.data);
    }
  }, 10000); // Poll ogni 10 secondi
}

function showResults(sellersData) {
  const qualified = sellersData.qualifiedSellers;
  
  // Crea modal con risultati
  const modal = createResultsModal();
  modal.innerHTML = `
    <h2>🎉 Trovati ${qualified.length} venditori italiani!</h2>
    <ul>
      ${qualified.map(seller => `
        <li>
          <strong>${seller.sellerName}</strong><br>
          📞 ${seller.compliance.phoneNumber}<br>
          📧 ${seller.compliance.emailAddress || 'N/A'}<br>
          🏢 P.IVA: ${seller.compliance.vatNumber || 'N/A'}<br>
          📍 ${seller.compliance.address || 'N/A'}
        </li>
      `).join('')}
    </ul>
    <button onclick="exportToCSV()">📥 Esporta CSV</button>
  `;
  
  document.body.appendChild(modal);
}
```

## 🔧 Configurazione Richiesta

### Variabili d'Ambiente (.env)
```env
# Apify Token (per scraping Amazon e crawling)
APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Gemini API Key (per estrazione compliance)
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# MongoDB (per salvare i risultati)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/bdr
```

### Dipendenze NPM
```json
{
  "dependencies": {
    "axios": "^1.6.0",
    "@google/generative-ai": "^0.1.0",
    "mongoose": "^8.0.0"
  }
}
```

## 💰 Costi Stimati

### Per ogni ricerca (50 prodotti → ~25 venditori unici):

1. **Apify - Amazon Product Scraper**
   - ~$0.10-0.20 per 50 prodotti
   
2. **Apify - Website Content Crawler** (seller pages)
   - ~$0.50-1.00 per 25 pagine crawlate
   
3. **Gemini 2.0 Flash** (estrazione compliance)
   - Input: ~$0.001 per 25 analisi
   - Output: ~$0.002 per 25 analisi
   
**Totale stimato: $0.60-1.25 per ricerca**

## 📈 Ottimizzazioni

### 1. **Cache Venditori**
   - Se un venditore è già stato analizzato, riusa i dati
   - Riduce drasticamente i costi per ricerche successive

### 2. **Filtraggio Preventivo**
   - Scrapa solo 50 prodotti invece di 200+
   - Analizza solo venditori unici
   - Scarta immediatamente duplicati

### 3. **Parallelizzazione**
   - Analizza più venditori in parallelo (max 3-5 contemporanei)
   - Riduce il tempo totale di elaborazione

### 4. **Retry con Exponential Backoff**
   - Se Apify/Gemini falliscono, riprova con attesa crescente
   - Evita fallimenti temporanei

## 🚨 Gestione Errori

### Errori Comuni

1. **"Nessun prodotto trovato"**
   - Amazon ha bloccato lo scraper
   - URL non valido
   - Pagina senza risultati

2. **"Seller page troppo corta"**
   - Pagina venditore non caricata correttamente
   - Venditore non ha sezione "Informazioni dettagliate"

3. **"Gemini parsing error"**
   - Testo estratto non contiene dati strutturati
   - Lingua non supportata

### Strategie di Recovery

- **Retry automatico** (max 3 tentativi)
- **Fallback a dati parziali** (salva quello che c'è)
- **Notifica utente** se fallimenti multipli

## 📝 TODO Future

- [ ] Supporto per altri marketplace (eBay, Etsy, etc.)
- [ ] Filtri avanzati (categoria, range prezzo, etc.)
- [ ] Export automatico a CRM
- [ ] Dashboard analytics venditori
- [ ] Notifiche email/push quando ricerca completata
- [ ] Supporto per ricerche programmate (es: ogni settimana)

## 🎓 Testing

### Test Manuale

1. Apri estensione su `https://www.amazon.it/s?k=scarpe`
2. Clicca "Trova Venditori Amazon"
3. Attendi 2-5 minuti
4. Controlla risultati nella dashboard

### Test API con cURL

```bash
# Login
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  | jq -r '.token')

# Avvia ricerca
SELLERS_ID=$(curl -X POST http://localhost:5000/api/amazon/find-sellers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amazonUrl":"https://www.amazon.it/s?k=scarpe"}' \
  | jq -r '.data.sellersId')

# Attendi 3 minuti...

# Ottieni risultati
curl http://localhost:5000/api/amazon/sellers/$SELLERS_ID \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 🔒 Sicurezza

- ✅ Autenticazione JWT richiesta
- ✅ Permessi: solo il creatore può vedere/cancellare la ricerca
- ✅ Rate limiting: max 100 richieste / 15 min
- ✅ Input validation su tutti gli endpoint
- ✅ Sanitizzazione URL Amazon

## 📞 Supporto

Per problemi o domande:
- GitHub Issues: https://github.com/your-repo/issues
- Email: support@bdr-extension.com
- Slack: #bdr-extension-support

