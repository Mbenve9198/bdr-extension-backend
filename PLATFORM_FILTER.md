# Filtro Piattaforme Ecommerce con BuiltWith

## 🎯 Obiettivo

Filtrare automaticamente i lead trovati da Google Search, mantenendo solo quelli costruiti su piattaforme ecommerce **gestibili** e **supportate**.

---

## ✅ Piattaforme ACCETTATE

I lead su queste piattaforme vengono **ACCETTATI** e processati:

1. **WooCommerce** / WordPress
2. **PrestaShop**
3. **Shopify**
4. **Storeden**
5. **Magento**
6. **Wix**
7. **OpenCart**

---

## ❌ Piattaforme SCARTATE

Tutte le altre piattaforme vengono **SCARTATE**, incluse:

- Piattaforme custom / proprietarie
- CMS non ecommerce (Drupal, Joomla, etc.)
- Soluzioni enterprise complesse (SAP Commerce, Oracle ATG, etc.)
- Framework custom (React, Vue, Angular standalone)
- Static site generators (Gatsby, Next.js senza ecommerce)
- Piattaforme sconosciute / non rilevate

---

## 🔄 Flusso di Analisi

```
1. Google Search → 50 URL trovati
   ↓
2. SimilarWeb → Analisi traffico
   ↓
3. BuiltWith → Check piattaforma ← NUOVO STEP
   ↓
4. Piattaforma supportata?
   ├─ ✅ Sì → Continua con calcolo spedizioni
   └─ ❌ No → SCARTA lead
```

---

## 📊 Esempio Pratico

### Prima (senza filtro piattaforma):
```
Google Search: "negozio online scarpe artigianali"
→ 50 URL trovati
→ 45 analizzati con SimilarWeb
→ 30 qualificati (spedizioni OK)

Problema: alcuni su piattaforme custom/complesse
```

### Dopo (con filtro BuiltWith):
```
Google Search: "negozio online scarpe artigianali"
→ 50 URL trovati
→ 45 analizzati con SimilarWeb
→ 40 passano filtro piattaforma ✅
→ 5 scartati (piattaforme non supportate) ❌
→ 28 qualificati finali (spedizioni OK)

Risultato: Solo lead gestibili!
```

---

## 🛠️ Implementazione Tecnica

### ApifyService - checkEcommercePlatform()

```javascript
const platformCheck = await apifyService.checkEcommercePlatform(url);

// Risposta:
{
  platform: "shopify",           // Piattaforma rilevata
  isSupported: true,             // Se accettata
  allTechnologies: [...]         // Tutte le tech trovate
}
```

### Database - SimilarLeads Model

```javascript
ecommercePlatform: {
  platform: "shopify",
  isSupported: true,
  checkedAt: "2025-01-14T10:30:00Z"
}
```

### Log Output

```
🔍 BuiltWith check per: example.com
📦 Tecnologie trovate (25): [shopify, google-analytics, cloudflare, ...]
✅ Piattaforma supportata: shopify
```

o

```
🔍 BuiltWith check per: example.com
📦 Tecnologie trovate (18): [angular, nodejs, custom, ...]
❌ Piattaforma non supportata o non rilevata
❌ Lead SCARTATO: piattaforma non supportata (sconosciuta)
```

---

## ⚡ Performance & Costi

### BuiltWith Actor
- **Cache**: 90 giorni (Apify gestisce automaticamente)
- **Costo**: ~$0.001 per check
- **Timeout**: 60 secondi
- **Fallback**: Se fallisce, lead viene ACCETTATO (per sicurezza)

### Ottimizzazioni
- Cache integrata riduce chiamate ripetute
- Check solo dopo analisi SimilarWeb (risparmia su URL già scartati)
- Timeout adeguato per non bloccare il processo
- Fallback safe: errore BuiltWith → lead accettato

---

## 📈 Statistiche

Nel database `SimilarLeads`, le statistiche vengono aggiornate:

```javascript
searchStats: {
  totalUrlsFound: 50,        // Da Google Search
  totalUrlsAnalyzed: 45,     // Passati SimilarWeb
  totalUrlsQualified: 28,    // Spedizioni OK + piattaforma OK
  totalUrlsFailed: 17        // Scartati (traffico basso o piattaforma)
}
```

---

## 🔍 Debugging

### Check manuale piattaforma

```bash
# Nel backend
node -e "
const apify = require('./services/apifyService');
apify.checkEcommercePlatform('example.com').then(console.log);
"
```

### Log MongoDB

```javascript
db.similarleads.find({ 
  'leads.ecommercePlatform.isSupported': false 
})
```

### Piattaforme più comuni

Query per vedere distribuzione:

```javascript
db.similarleads.aggregate([
  { $unwind: '$leads' },
  { $group: { 
      _id: '$leads.ecommercePlatform.platform',
      count: { $sum: 1 }
  }},
  { $sort: { count: -1 }}
])
```

---

## 🎯 Best Practices

1. **Monitora i log**: Controlla quanti lead vengono scartati
2. **Aggiorna lista**: Aggiungi nuove piattaforme se necessario
3. **Cache aware**: La cache dura 90 giorni, considera refresh manuale se serve
4. **Fallback safe**: Sistema continua anche se BuiltWith fallisce

---

## 🔧 Come Aggiungere Piattaforme

Se vuoi aggiungere una nuova piattaforma supportata:

1. Apri `/backend/services/apifyService.js`
2. Trova `supportedPlatforms` array
3. Aggiungi il nome (lowercase):

```javascript
const supportedPlatforms = [
  'woocommerce',
  'wordpress', 
  'prestashop',
  'shopify',
  'storeden',
  'magento',
  'wix',
  'opencart',
  'nuova-piattaforma' // ← AGGIUNGI QUI
];
```

4. Commit e push
5. Riavvia server

---

## ⚠️ Note Importanti

- **Case-insensitive**: "Shopify" = "shopify" = "SHOPIFY"
- **Partial match**: "WooCommerce 5.0" viene riconosciuto come "woocommerce"
- **Fallback safe**: Se BuiltWith fallisce → lead **ACCETTATO**
- **Cache condivisa**: Stesso dominio richiesto 2 volte usa cache
- **No blocco**: Processo continua anche con errori BuiltWith

---

## 📞 Supporto

Per problemi o domande:
- Check logs: `searchStats.totalUrlsFailed`
- Verifica BuiltWith API key funzionante
- Cache reset: elimina key-value store "builtwith" su Apify

---

**Versione**: 1.0.0  
**Data**: Gennaio 2025  
**Autore**: BDR Extension Team

