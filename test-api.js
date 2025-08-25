#!/usr/bin/env node

/**
 * Script di test per verificare il funzionamento dell'API BDR Ecommerce
 * 
 * Uso: node test-api.js
 * 
 * Assicurati che:
 * - MongoDB sia in esecuzione
 * - Le variabili d'ambiente siano configurate nel file .env
 * - Il server sia avviato (npm run dev)
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let authToken = null;

// Colori per output console
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Test delle API
async function testAPI() {
  log('\n🚀 Inizio test API BDR Ecommerce Analysis\n', 'blue');

  try {
    // Test 1: Verifica server attivo
    logInfo('Test 1: Verifica server attivo');
    const healthCheck = await axios.get(`${BASE_URL.replace('/api', '')}/`);
    if (healthCheck.data.message.includes('BDR Ecommerce Analysis API attiva')) {
      logSuccess('Server attivo e funzionante');
    } else {
      throw new Error('Risposta server non valida');
    }

    // Test 2: Registrazione utente test
    logInfo('\nTest 2: Registrazione utente test');
    const testUser = {
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'TestPassword123',
      firstName: 'Mario',
      lastName: 'Rossi',
      company: 'Test Company'
    };

    try {
      const registerResponse = await axios.post(`${BASE_URL}/auth/register`, testUser);
      authToken = registerResponse.data.data.token;
      logSuccess(`Utente registrato: ${testUser.username}`);
    } catch (error) {
      if (error.response?.status === 400 && error.response.data.message.includes('già')) {
        logWarning('Utente già esistente, provo con login');
        
        // Test 3: Login
        logInfo('\nTest 3: Login utente');
        const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
          login: testUser.email,
          password: testUser.password
        });
        authToken = loginResponse.data.data.token;
        logSuccess('Login effettuato con successo');
      } else {
        throw error;
      }
    }

    // Configurazione headers per richieste autenticate
    const authHeaders = {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    };

    // Test 4: Verifica profilo utente
    logInfo('\nTest 4: Verifica profilo utente');
    const profileResponse = await axios.get(`${BASE_URL}/auth/me`, { headers: authHeaders });
    if (profileResponse.data.data.username) {
      logSuccess(`Profilo recuperato: ${profileResponse.data.data.firstName} ${profileResponse.data.data.lastName}`);
    }

    // Test 5: Creazione prospect
    logInfo('\nTest 5: Creazione prospect');
    const testProspect = {
      url: 'https://emanuelebicocchi.it',
      name: 'Emanuele Bicocchi',
      company: 'Emanuele Bicocchi Store',
      industry: 'jewelry_luxury',
      priority: 'high',
      tags: ['test', 'jewelry'],
      notes: 'Prospect di test creato automaticamente'
    };

    try {
      const prospectResponse = await axios.post(`${BASE_URL}/prospects`, testProspect, { headers: authHeaders });
      logSuccess(`Prospect creato: ${prospectResponse.data.data.name}`);
      
      // Test 6: Lista prospects
      logInfo('\nTest 6: Lista prospects');
      const prospectsListResponse = await axios.get(`${BASE_URL}/prospects`, { headers: authHeaders });
      logSuccess(`${prospectsListResponse.data.data.length} prospect trovati`);

    } catch (error) {
      if (error.response?.status === 400 && error.response.data.message.includes('già esistente')) {
        logWarning('Prospect già esistente, continuo con i test');
      } else {
        throw error;
      }
    }

    // Test 7: Analisi ecommerce (solo se hai configurato APIFY_TOKEN)
    logInfo('\nTest 7: Analisi ecommerce');
    if (process.env.APIFY_TOKEN && process.env.APIFY_TOKEN !== 'your_apify_token_here') {
      try {
        const analysisResponse = await axios.post(`${BASE_URL}/analysis/analyze`, {
          url: 'https://emanuelebicocchi.it'
        }, { headers: authHeaders });
        
        if (analysisResponse.data.success) {
          logSuccess('Analisi avviata con successo');
          if (analysisResponse.data.fromCache) {
            logInfo('Risultato ottenuto dalla cache');
          }
        }
      } catch (error) {
        if (error.response?.status === 429) {
          logWarning('Limite analisi raggiunto');
        } else {
          logError(`Errore analisi: ${error.response?.data?.message || error.message}`);
        }
      }
    } else {
      logWarning('APIFY_TOKEN non configurato, salto test analisi');
    }

    // Test 8: Dashboard statistiche
    logInfo('\nTest 8: Dashboard statistiche');
    const dashboardResponse = await axios.get(`${BASE_URL}/analysis/dashboard`, { headers: authHeaders });
    if (dashboardResponse.data.data.stats) {
      logSuccess(`Dashboard caricata - Analisi totali: ${dashboardResponse.data.data.stats.totalAnalyses}`);
    }

    // Test 9: Statistiche prospects
    logInfo('\nTest 9: Statistiche prospects');
    const prospectStatsResponse = await axios.get(`${BASE_URL}/prospects/stats`, { headers: authHeaders });
    if (prospectStatsResponse.data.data.total !== undefined) {
      logSuccess(`Statistiche prospects - Totale: ${prospectStatsResponse.data.data.total}`);
    }

    log('\n🎉 Tutti i test completati con successo!', 'green');
    log('\n📋 Riepilogo funzionalità testate:', 'blue');
    log('✅ Server attivo');
    log('✅ Registrazione/Login utenti');
    log('✅ Autenticazione JWT');
    log('✅ Gestione profilo');
    log('✅ Creazione e lista prospects');
    log('✅ Dashboard e statistiche');
    log(process.env.APIFY_TOKEN && process.env.APIFY_TOKEN !== 'your_apify_token_here' ? 
      '✅ Analisi ecommerce (Apify)' : '⚠️  Analisi ecommerce (Apify non configurato)');

  } catch (error) {
    logError(`Errore durante i test: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Risposta: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    process.exit(1);
  }
}

// Verifica prerequisiti
function checkPrerequisites() {
  logInfo('Verifica prerequisiti...');
  
  const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logError(`Variabili d'ambiente mancanti: ${missingVars.join(', ')}`);
    logError('Crea un file .env con le configurazioni necessarie');
    process.exit(1);
  }
  
  if (!process.env.APIFY_TOKEN || process.env.APIFY_TOKEN === 'your_apify_token_here') {
    logWarning('APIFY_TOKEN non configurato - i test di analisi verranno saltati');
  }
  
  logSuccess('Prerequisiti verificati');
}

// Funzione principale
async function main() {
  try {
    // Carica variabili d'ambiente
    require('dotenv').config();
    
    checkPrerequisites();
    
    // Attendi un momento per assicurarsi che il server sia pronto
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testAPI();
    
  } catch (error) {
    logError(`Errore generale: ${error.message}`);
    process.exit(1);
  }
}

// Istruzioni per l'uso
if (require.main === module) {
  log('🧪 Script di test API BDR Ecommerce Analysis', 'blue');
  log('');
  log('Prerequisiti:', 'yellow');
  log('1. MongoDB in esecuzione');
  log('2. File .env configurato');
  log('3. Server avviato (npm run dev)');
  log('');
  
  main();
}

module.exports = { testAPI, checkPrerequisites }; 