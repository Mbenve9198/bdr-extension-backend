const express = require('express');
const router = express.Router();

// Middleware auth base (senza import esterno per ora)
const simpleAuth = (req, res, next) => {
  // Skip auth per test - solo per deploy iniziale
  next();
};

// Test endpoint semplici
router.post('/generate', simpleAuth, async (req, res) => {
  try {
    console.log('🔥 POST /generate chiamato!');
    console.log('📦 Body:', req.body);
    
    // Simula la struttura dati attesa dal frontend
    const mockScriptData = {
      _id: '674c1234567890abcdef1234',
      siteName: 'Test Site',
      siteUrl: 'https://test.com',
      isInternational: false,
      estimatedShipments: 750,
      script: {
        language: req.body.language || 'it',
        hook: 'Salve, sono Marco di Sendcloud. Ho visto che gestite circa 750 spedizioni al mese. Siamo la piattaforma #1 in Europa per e-commerce...',
        qualificationQuestions: [
          'Quanto tempo dedicate alle spedizioni ogni giorno?',
          'Quali corrieri usate attualmente?', 
          'Che problemi avete con le spedizioni attuali?'
        ],
        pricingSuggestions: {
          recommendedCouriers: [
            {
              name: 'INPOST ITALIA',
              service: 'Locker to Locker',
              standardPrice: '€3.61-€3.99',
              discountedPrice: '€2.96-€3.27'
            }
          ],
          insuranceInfo: {
            national: 'Valore pacco × 0,6%',
            international: 'Valore pacco × 1,5%'
          }
        },
        fullScript: 'SCRIPT COMPLETO:\n\nSalve, sono [NOME] di Sendcloud. Ho analizzato il vostro sito e ho visto che gestite circa 750 spedizioni al mese.\n\nSendcloud è la piattaforma #1 in Europa per e-commerce. Aiutiamo oltre 25.000 negozi online a:\n- Automatizzare le spedizioni\n- Ridurre i costi\n- Migliorare l\'esperienza cliente\n\nCon i vostri volumi, potremmo offrirvi tariffe molto competitive. Avreste 15 minuti questa settimana per una demo veloce?'
      },
      status: 'completed',
      createdAt: new Date()
    };
    
    console.log('✅ Restituisco dati mock script');
    
    res.json({
      success: true,
      message: 'Script generato con successo (TEST)',
      data: mockScriptData
    });
  } catch (error) {
    console.error('❌ Errore in /generate:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Scripts API is working' });
});

router.get('/:id', simpleAuth, (req, res) => {
  res.json({ 
    success: true, 
    message: 'getScriptById test', 
    data: { id: req.params.id } 
  });
});

router.get('/', simpleAuth, (req, res) => {
  res.json({ 
    success: true, 
    message: 'getScriptsList test', 
    data: [] 
  });
});

// Endpoint per controllare script esistente per analisi
router.get('/analysis/:analysisId', simpleAuth, (req, res) => {
  console.log('🔍 Richiesta script per analisi:', req.params.analysisId);
  console.log('🔍 Lingua:', req.query.language);
  
  // Per ora restituiamo 404 - nessuno script esistente
  res.status(404).json({ 
    success: false, 
    message: 'Nessuno script trovato per questa analisi - normale, genereremo uno nuovo'
  });
});

module.exports = router; 