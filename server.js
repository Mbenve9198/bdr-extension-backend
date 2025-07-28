require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

console.log('🚀 [SERVER] Caricamento variabili d\'ambiente...');
console.log('🚀 [SERVER] PERPLEXITY_API_KEY presente:', !!process.env.PERPLEXITY_API_KEY);

const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 100 // limite di 100 richieste per IP ogni 15 minuti
});

// CORS configuration for Chrome Extensions
const corsOptions = {
  origin: function (origin, callback) {
    // Allow Chrome extensions and specific domains
    if (!origin || 
        origin.startsWith('chrome-extension://') || 
        origin.startsWith('moz-extension://') ||
        origin === 'http://localhost:3000' ||
        origin === 'https://bdr-extension-backend.onrender.com') {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now - can be restricted later
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Middleware
app.use(helmet());
app.use(limiter);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Connessione MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('📦 Connesso a MongoDB'))
.catch(err => console.error('❌ Errore connessione MongoDB:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/prospects', require('./routes/prospects'));
app.use('/api/analysis', require('./routes/analysis'));

// Route di base
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 BDR Ecommerce Analysis API attiva!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users', 
      prospects: '/api/prospects',
      analysis: '/api/analysis'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Errore interno del server' 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Endpoint non trovato' 
  });
});

app.listen(PORT, () => {
  console.log(`🌟 Server in esecuzione sulla porta ${PORT}`);
  console.log(`🌐 Accedi a: http://localhost:${PORT}`);
}); 