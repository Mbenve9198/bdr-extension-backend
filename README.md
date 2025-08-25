# BDR Ecommerce Analysis Backend

Backend API per l'analisi di ecommerce tramite integrazione con Apify e SimilarWeb.

## 🚀 Caratteristiche

- **Autenticazione JWT** con ruoli (BDR, Manager, Admin)
- **Analisi Ecommerce** tramite Apify + SimilarWeb
- **Gestione Prospect** con stati e assegnazioni
- **Dashboard** con statistiche e metriche
- **Rate Limiting** e sicurezza
- **Validazione dati** completa
- **Esportazione risultati**

## 📋 Requisiti

- Node.js >= 16.x
- MongoDB >= 4.x
- Account Apify con token API

## 🛠 Installazione

1. **Clona e installa dipendenze**
```bash
cd backend
npm install
```

2. **Configura variabili d'ambiente**
```bash
cp .env.example .env
# Modifica .env con i tuoi valori
```

3. **Avvia il server**
```bash
# Sviluppo
npm run dev

# Produzione
npm start
```

## 🔧 Configurazione

### Variabili d'ambiente (.env)

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/bdr-ecommerce
JWT_SECRET=your_super_secret_jwt_key_here
APIFY_TOKEN=apify_api_token_here
NODE_ENV=development
```

### Configurazione MongoDB

Il database si configura automaticamente. Assicurati che MongoDB sia in esecuzione.

## 📚 API Endpoints

### Autenticazione

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Registrazione utente | ❌ |
| POST | `/api/auth/login` | Login utente | ❌ |
| GET | `/api/auth/me` | Profilo corrente | ✅ |
| PUT | `/api/auth/profile` | Aggiorna profilo | ✅ |
| PUT | `/api/auth/change-password` | Cambia password | ✅ |

### Analisi Ecommerce

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| POST | `/api/analysis/analyze` | Analizza singolo URL | ✅ |
| POST | `/api/analysis/batch` | Analisi batch (max 10) | ✅ |
| GET | `/api/analysis` | Lista analisi | ✅ |
| GET | `/api/analysis/dashboard` | Statistiche dashboard | ✅ |
| GET | `/api/analysis/:id` | Dettagli analisi | ✅ |
| GET | `/api/analysis/:id/export` | Esporta analisi | ✅ |

### Prospect

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| POST | `/api/prospects` | Crea prospect | ✅ |
| GET | `/api/prospects` | Lista prospect | ✅ |
| GET | `/api/prospects/stats` | Statistiche prospect | ✅ |
| GET | `/api/prospects/:id` | Dettagli prospect | ✅ |
| PUT | `/api/prospects/:id` | Aggiorna prospect | ✅ |
| DELETE | `/api/prospects/:id` | Elimina prospect | ✅ |
| PUT | `/api/prospects/:id/assign` | Assegna prospect | 👑 |
| POST | `/api/prospects/import` | Importa prospect | ✅ |

### Utenti (Admin/Manager)

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| GET | `/api/users` | Lista utenti | 👑 |
| POST | `/api/users` | Crea utente | 👑 |
| GET | `/api/users/:id` | Dettagli utente | 👑 |
| PUT | `/api/users/:id` | Aggiorna utente | 👑 |
| DELETE | `/api/users/:id` | Disattiva utente | 👑 |
| GET | `/api/users/stats/overview` | Statistiche utenti | 👑 |

**Legenda**: ❌ Pubblico | ✅ Autenticato | 👑 Admin/Manager

## 🔐 Autenticazione

### Registrazione
```javascript
POST /api/auth/register
{
  "username": "mario_rossi",
  "email": "mario@example.com",
  "password": "Password123",
  "firstName": "Mario",
  "lastName": "Rossi",
  "company": "ACME Corp",
  "phone": "+39123456789"
}
```

### Login
```javascript
POST /api/auth/login
{
  "login": "mario@example.com", // email o username
  "password": "Password123"
}

// Risposta
{
  "success": true,
  "data": {
    "user": { ... },
    "token": "jwt_token_here"
  }
}
```

### Headers richieste autenticate
```
Authorization: Bearer <jwt_token>
```

## 🔍 Analisi Ecommerce

### Analisi singola
```javascript
POST /api/analysis/analyze
{
  "url": "https://emanuelebicocchi.it",
  "prospectId": "optional_prospect_id"
}

// Risposta
{
  "success": true,
  "data": {
    "name": "emanuelebicocchi.it",
    "vertical": "jewelry and luxury products",
    "totalVisitsLast3Months": 112165,
    "estimatedShipmentsLast3Months": 2243,
    "topCountries": [
      {
        "countryName": "Russia",
        "visitsShare": 0.3557,
        "estimatedVisits": 39892,
        "estimatedShipments": 798
      }
    ]
  }
}
```

### Analisi batch
```javascript
POST /api/analysis/batch
{
  "urls": [
    "https://example1.com",
    "https://example2.com"
  ]
}
```

## 📊 Prospect Management

### Crea prospect
```javascript
POST /api/prospects
{
  "url": "https://example.com",
  "name": "Example Store",
  "company": "Example Inc",
  "industry": "fashion",
  "priority": "high",
  "tags": ["ecommerce", "fashion"],
  "contactInfo": {
    "email": "info@example.com",
    "contactPerson": "John Doe",
    "position": "CEO"
  }
}
```

### Filtri e paginazione
```javascript
GET /api/prospects?page=1&limit=10&status=pending&industry=fashion&search=example
```

## 📈 Dashboard e Statistiche

### Dashboard analisi
```javascript
GET /api/analysis/dashboard

// Risposta
{
  "success": true,
  "data": {
    "stats": {
      "totalAnalyses": 150,
      "completedAnalyses": 140,
      "thisMonthAnalyses": 25,
      "successRate": 93
    },
    "recentAnalyses": [...],
    "topCategories": [...]
  }
}
```

## ⚙️ Configurazione Apify

Il sistema utilizza l'actor `tri_angle~fast-similarweb-scraper` di Apify.

### Setup token Apify:
1. Registrati su [Apify.com](https://apify.com)
2. Vai su Settings > Integrations
3. Copia il tuo API token
4. Aggiungi al file `.env` come `APIFY_TOKEN`

## 🛡️ Sicurezza

- **Rate Limiting**: 100 richieste per IP ogni 15 minuti
- **Helmet**: Headers di sicurezza
- **Validazione input**: Tutte le richieste sono validate
- **JWT**: Token con scadenza 30 giorni
- **Ruoli**: BDR, Manager, Admin con permessi diversi
- **Analisi illimitate**: Nessun limite per le analisi

## 🏗️ Struttura del Progetto

```
backend/
├── controllers/          # Logica business
│   ├── authController.js
│   ├── analysisController.js
│   ├── prospectController.js
│   └── userController.js
├── middleware/           # Middleware personalizzati
│   └── auth.js
├── models/              # Modelli Mongoose
│   ├── User.js
│   ├── Prospect.js
│   └── EcommerceAnalysis.js
├── routes/              # Definizione routes
│   ├── auth.js
│   ├── analysis.js
│   ├── prospects.js
│   └── users.js
├── services/            # Servizi esterni
│   └── apifyService.js
├── server.js           # Entry point
└── package.json
```

## 🔄 Modelli Dati

### User
- Gestione BDR, Manager, Admin
- Analisi illimitate
- Profilo e autenticazione

### Prospect
- Ecommerce da analizzare
- Stati: pending, analyzing, completed, failed, qualified, contacted
- Assegnazione a BDR

### EcommerceAnalysis
- Risultati analisi SimilarWeb
- Metriche calcolate (visite, spedizioni, paesi)
- Storico e export

## 🚨 Gestione Errori

L'API restituisce errori strutturati:

```javascript
{
  "success": false,
  "message": "Descrizione errore",
  "errors": [
    {
      "field": "email",
      "message": "Email non valida"
    }
  ]
}
```

### Codici di stato:
- `200` - Successo
- `201` - Creato
- `400` - Richiesta non valida
- `401` - Non autenticato
- `403` - Accesso negato
- `404` - Non trovato
- `429` - Limite raggiunto
- `500` - Errore server

## 🧪 Test

```bash
# Avvia test
npm test

# Test coverage
npm run test:coverage
```

## 📝 Log

I log sono strutturati con:
- ✅ Operazioni completate con successo
- ❌ Errori con dettagli
- 🚀 Avvio operazioni
- 📋 Cache hit
- 🔍 Analisi in corso

## 🚀 Deploy

### Variabili produzione
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://username:password@host:port/database
JWT_SECRET=super_secure_random_string
APIFY_TOKEN=production_apify_token
```

### Docker (opzionale)
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 📞 Supporto

Per problemi o domande:
- Controlla i log del server
- Verifica la configurazione Apify
- Assicurati che MongoDB sia raggiungibile
- Controlla i limiti di rate

---

**Versione**: 1.0.0  
**Autore**: Marco Benvenuti  
**Licenza**: ISC 