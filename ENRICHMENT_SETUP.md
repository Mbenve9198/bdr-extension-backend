# Setup Enrichment Contatti con Gemini

## 🚀 Nuova Funzionalità: Enrichment Avanzato

Il sistema di enrichment ora usa:
- **Apify Website Content Crawler** - Estrae il testo da homepage e pagina contatti
- **Google Gemini 2.5 Flash** - Analizza il testo ed estrae email e telefoni con AI

## 📋 Configurazione Richiesta

### 1. Ottieni API Key Gemini

1. Vai su [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Fai login con il tuo account Google
3. Clicca "Create API Key"
4. Copia la chiave generata

### 2. Aggiungi la chiave al file `.env`

Nel file `/backend/.env`, aggiungi:

```env
GEMINI_API_KEY=tua_chiave_api_qui
```

### 3. Riavvia il server

```bash
cd backend
npm start
```

## 🔍 Come Funziona

1. **L'utente clicca "Arricchisci Contatti"** su un lead
2. **Apify crawla il sito** (max 5 pagine: home, contatti, chi-siamo, about)
3. **Gemini analizza il testo** e cerca:
   - Indirizzi email (info@, contatti@, nomi@, etc.)
   - Numeri di telefono (formati italiani: +39, 02-, 333-, etc.)
4. **I contatti vengono salvati** nel database MongoDB
5. **Mostrati nell'UI** con link cliccabili (mailto:, tel:)

## 📊 Formato Dati Enrichment

```javascript
{
  status: 'enriched',
  enrichedAt: Date,
  emails: ['info@example.com', 'vendite@example.com'],
  phones: ['+39 02 1234567', '+39 333 1234567'],
  pagesCrawled: 3,
  error: null
}
```

## 💰 Costi

- **Apify Website Crawler**: ~$0.5-2 per 1000 pagine crawlate
- **Gemini 2.5 Flash**: 
  - Input: $0.075 per 1M token (~150 pagine)
  - Output: $0.30 per 1M token
  
**Stima per enrichment**: ~$0.001-0.005 per sito (molto economico!)

## 🔧 Configurazione Avanzata

### Modifica numero pagine crawlate

In `/backend/services/apifyService.js`:

```javascript
maxCrawlPages: 5, // Cambia questo numero (default: 5)
```

### Modifica URL inclusi

```javascript
includeUrlGlobs: [
  `${baseUrl}`,
  `${baseUrl}/contatti*`,
  `${baseUrl}/contact*`,
  // Aggiungi altri pattern qui
]
```

## ⚠️ Troubleshooting

### "Gemini API key non configurata"
- Verifica che `GEMINI_API_KEY` sia nel file `.env`
- Verifica che il file `.env` non abbia spazi extra
- Riavvia il server

### "Nessun contatto trovato"
- Il sito potrebbe non avere email/telefoni nelle prime 5 pagine
- Prova ad aumentare `maxCrawlPages`
- Alcuni siti usano form di contatto invece di email dirette

### Enrichment lento
- Il crawling può richiedere 30-90 secondi per sito
- È normale per siti con JavaScript pesante
- Il processo è asincrono, non blocca altre operazioni

## 📝 API Endpoint

```
POST /api/analysis/leads/:leadsId/enrich/:leadIndex
```

Parametri:
- `leadsId`: ID della ricerca leads
- `leadIndex`: Indice del lead nell'array (0-based)

Response:
```json
{
  "success": true,
  "message": "Enrichment avviato",
  "data": {
    "leadIndex": 0,
    "url": "https://example.com",
    "status": "enriching"
  }
}
```

## 🎯 Best Practices

1. **Non arricchire troppi lead contemporaneamente** (max 3-5)
2. **Attendi il completamento** prima di fare nuove richieste
3. **Monitora i log** per vedere il progresso
4. **Controlla i costi** Apify/Gemini nel rispettivo dashboard

