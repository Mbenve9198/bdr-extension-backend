/**
 * Script di test per le API Amazon Sellers
 * 
 * Uso:
 * 1. Assicurati che il server sia in esecuzione: npm start
 * 2. Modifica le credenziali di login qui sotto
 * 3. Esegui: node test-amazon-api.js
 */

const axios = require('axios');

// ========== CONFIGURAZIONE ==========
const BASE_URL = 'http://localhost:5000/api';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'password123';
const AMAZON_URL = 'https://www.amazon.it/s?k=scarpe+donna';
// ====================================

let authToken = '';
let sellersId = '';

// Colori per console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Login
async function login() {
  try {
    log('\n🔐 [1/5] Login...', 'cyan');
    
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });

    authToken = response.data.token;
    log(`✅ Login completato! Token ricevuto.`, 'green');
    log(`   User: ${response.data.user.firstName} ${response.data.user.lastName}`, 'blue');
    
    return true;
  } catch (error) {
    log(`❌ Errore login: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// 2. Avvia ricerca venditori Amazon
async function findAmazonSellers() {
  try {
    log('\n🛒 [2/5] Avvio ricerca venditori Amazon...', 'cyan');
    log(`   URL: ${AMAZON_URL}`, 'blue');
    
    const response = await axios.post(
      `${BASE_URL}/amazon/find-sellers`,
      { amazonUrl: AMAZON_URL },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );

    sellersId = response.data.data.sellersId;
    const marketplace = response.data.data.marketplace;
    
    log(`✅ Ricerca avviata!`, 'green');
    log(`   Sellers ID: ${sellersId}`, 'blue');
    log(`   Marketplace: ${marketplace}`, 'blue');
    log(`   Status: ${response.data.data.status}`, 'yellow');
    
    return true;
  } catch (error) {
    log(`❌ Errore avvio ricerca: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// 3. Polling risultati (attendi completamento)
async function pollResults() {
  try {
    log('\n⏳ [3/5] Attendo completamento ricerca...', 'cyan');
    log('   Questo può richiedere 2-5 minuti. Polling ogni 10 secondi...', 'yellow');
    
    let attempts = 0;
    const maxAttempts = 50; // Max 8.3 minuti
    
    while (attempts < maxAttempts) {
      await sleep(10000); // 10 secondi
      attempts++;
      
      const response = await axios.get(
        `${BASE_URL}/amazon/sellers/${sellersId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      const status = response.data.data.status;
      const stats = response.data.data.searchStats;
      
      log(`   [${attempts}] Status: ${status} | Prodotti: ${stats.totalProductsScraped} | Venditori unici: ${stats.totalSellersUnique} | Analizzati: ${stats.totalSellersAnalyzed}/${stats.totalSellersUnique}`, 'blue');
      
      if (status === 'completed') {
        log(`✅ Ricerca completata!`, 'green');
        log(`   Venditori qualificati: ${stats.totalSellersQualified}`, 'green');
        log(`   Venditori rifiutati: ${stats.totalSellersRejected}`, 'yellow');
        return response.data.data;
      } else if (status === 'failed') {
        log(`❌ Ricerca fallita!`, 'red');
        return null;
      }
    }
    
    log(`⚠️  Timeout: ricerca non completata dopo ${maxAttempts * 10} secondi`, 'yellow');
    return null;
    
  } catch (error) {
    log(`❌ Errore polling: ${error.response?.data?.message || error.message}`, 'red');
    return null;
  }
}

// 4. Mostra risultati dettagliati
async function showResults(sellersData) {
  try {
    log('\n📊 [4/5] Risultati dettagliati:', 'cyan');
    
    const qualified = sellersData.qualifiedSellers || [];
    
    log(`\n🎯 VENDITORI QUALIFICATI (${qualified.length}):\n`, 'green');
    
    qualified.forEach((seller, idx) => {
      log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'blue');
      log(`${idx + 1}. ${seller.sellerName}`, 'green');
      log(`   📦 Prodotto: ${seller.productTitle}`, 'blue');
      log(`   🆔 Seller ID: ${seller.sellerId}`, 'blue');
      log(`   🔗 URL: ${seller.sellerUrl}`, 'blue');
      log(`\n   📋 COMPLIANCE:`, 'cyan');
      log(`   • Tipo: ${seller.compliance?.sellerType || 'N/A'}`, 'blue');
      log(`   • P.IVA: ${seller.compliance?.vatNumber || 'N/A'}`, 'blue');
      log(`   • Tel: ${seller.compliance?.phoneNumber || 'N/A'}`, 'green');
      log(`   • Email: ${seller.compliance?.emailAddress || 'N/A'}`, 'blue');
      log(`   • Indirizzo: ${seller.compliance?.address || 'N/A'}`, 'blue');
      log(`   • Marketplace: ${seller.compliance?.marketplace || 'N/A'}`, 'blue');
      log(`   • Lingua: ${seller.compliance?.languageDetected || 'N/A'}`, 'blue');
    });
    
    log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`, 'blue');
    
    // Mostra anche venditori rifiutati (primi 5)
    const rejected = sellersData.sellers.filter(s => s.analysisStatus === 'rejected').slice(0, 5);
    if (rejected.length > 0) {
      log(`\n⛔ VENDITORI RIFIUTATI (primi 5 di ${sellersData.searchStats.totalSellersRejected}):\n`, 'red');
      rejected.forEach((seller, idx) => {
        log(`${idx + 1}. ${seller.sellerName}`, 'yellow');
        log(`   Motivo: ${seller.notes || seller.error || 'N/A'}`, 'red');
      });
      log('');
    }
    
    return true;
  } catch (error) {
    log(`❌ Errore visualizzazione risultati: ${error.message}`, 'red');
    return false;
  }
}

// 5. Lista ricerche utente
async function listMySearches() {
  try {
    log('\n📋 [5/5] Lista ricerche precedenti:', 'cyan');
    
    const response = await axios.get(
      `${BASE_URL}/amazon/my-searches?limit=5`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );

    const searches = response.data.data;
    
    log(`\n   Totale ricerche: ${response.data.pagination.total}\n`, 'blue');
    
    searches.forEach((search, idx) => {
      const date = new Date(search.createdAt).toLocaleString('it-IT');
      log(`   ${idx + 1}. [${search.status.toUpperCase()}] ${search.sourceUrl}`, 'yellow');
      log(`      Marketplace: ${search.marketplace} | Qualificati: ${search.qualifiedSellers} | Data: ${date}`, 'blue');
    });
    
    log('');
    return true;
  } catch (error) {
    log(`❌ Errore lista ricerche: ${error.response?.data?.message || error.message}`, 'red');
    return false;
  }
}

// Main
async function main() {
  log('\n╔═══════════════════════════════════════════════════════════╗', 'cyan');
  log('║       TEST API AMAZON SELLERS - BDR Extension            ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════════╝\n', 'cyan');
  
  // Step 1: Login
  const loginSuccess = await login();
  if (!loginSuccess) {
    log('\n❌ Test fallito: impossibile fare login\n', 'red');
    return;
  }
  
  // Step 2: Avvia ricerca
  const searchSuccess = await findAmazonSellers();
  if (!searchSuccess) {
    log('\n❌ Test fallito: impossibile avviare ricerca\n', 'red');
    return;
  }
  
  // Step 3: Polling risultati
  const sellersData = await pollResults();
  if (!sellersData) {
    log('\n⚠️  Test parzialmente fallito: ricerca non completata\n', 'yellow');
    return;
  }
  
  // Step 4: Mostra risultati
  await showResults(sellersData);
  
  // Step 5: Lista ricerche
  await listMySearches();
  
  log('\n╔═══════════════════════════════════════════════════════════╗', 'green');
  log('║               ✅ TEST COMPLETATO CON SUCCESSO!            ║', 'green');
  log('╚═══════════════════════════════════════════════════════════╝\n', 'green');
}

// Esegui
main().catch(err => {
  log(`\n💥 ERRORE FATALE: ${err.message}\n`, 'red');
  console.error(err);
  process.exit(1);
});


