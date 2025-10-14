const { GoogleGenAI } = require('@google/genai');

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    
    if (!this.apiKey) {
      console.warn('⚠️  GEMINI_API_KEY non configurata');
    }
    
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  /**
   * Estrae email e numeri di telefono da testo usando Gemini
   * @param {string} text - Testo da analizzare (es: contenuto pagine sito)
   * @param {string} companyName - Nome azienda per contesto
   * @returns {Promise<{emails: string[], phones: string[]}>}
   */
  async extractContacts(text, companyName = '') {
    if (!this.apiKey) {
      throw new Error('Gemini API key non configurata');
    }

    try {
      console.log(`🤖 Gemini: estrazione contatti per ${companyName || 'sito'}...`);
      console.log(`📄 Lunghezza testo: ${text.length} caratteri`);

      const prompt = `Analizza il seguente testo estratto dal sito web ${companyName ? `di "${companyName}"` : ''} e trova TUTTI gli indirizzi email e numeri di telefono presenti.

TESTO DA ANALIZZARE:
${text.slice(0, 50000)} 

ISTRUZIONI:
1. Estrai TUTTI gli indirizzi email validi (formato: esempio@dominio.it)
2. Estrai TUTTI i numeri di telefono (formati italiani: +39, 02-, 06-, cellulari, etc)
3. Pulisci e normalizza i numeri (rimuovi spazi, trattini extra)
4. Rimuovi duplicati
5. Se trovi email generiche (info@, contatti@, etc) includile comunque

Rispondi SOLO con un oggetto JSON in questo formato:
{
  "emails": ["email1@example.com", "email2@example.com"],
  "phones": ["+39 02 1234567", "+39 333 1234567"]
}

NON aggiungere spiegazioni, SOLO il JSON.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0 // Disattiva thinking per velocità
          },
          temperature: 0.1, // Bassa temperatura per output deterministico
          maxOutputTokens: 1000
        }
      });

      const rawText = response.text.trim();
      console.log(`📥 Risposta Gemini (raw):`, rawText);

      // Estrai JSON dalla risposta (potrebbe avere ```json ... ```)
      let jsonText = rawText;
      const jsonMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const result = JSON.parse(jsonText);

      // Validazione
      if (!result.emails || !result.phones) {
        throw new Error('Formato risposta Gemini non valido');
      }

      // Normalizza arrays (potrebbero essere undefined/null)
      const contacts = {
        emails: Array.isArray(result.emails) ? result.emails : [],
        phones: Array.isArray(result.phones) ? result.phones : []
      };

      console.log(`✅ Contatti estratti: ${contacts.emails.length} email, ${contacts.phones.length} telefoni`);
      
      if (contacts.emails.length > 0) {
        console.log(`📧 Email trovate:`, contacts.emails);
      }
      if (contacts.phones.length > 0) {
        console.log(`📞 Telefoni trovati:`, contacts.phones);
      }

      return contacts;

    } catch (error) {
      console.error('❌ Errore Gemini extractContacts:', error.message);
      
      // Se errore parsing JSON, prova a estrarre manualmente
      if (error instanceof SyntaxError) {
        console.log('⚠️  Tentativo estrazione manuale da risposta Gemini...');
        return {
          emails: [],
          phones: [],
          error: 'Formato risposta non valido'
        };
      }
      
      throw error;
    }
  }
}

module.exports = new GeminiService();

