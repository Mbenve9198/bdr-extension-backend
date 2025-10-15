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

  /**
   * Estrae email e telefono principale da un URL specifico
   * Versione veloce per singoli lead
   * @param {string} url - URL del sito ecommerce
   * @param {string} siteName - Nome del sito (opzionale)
   * @returns {Promise<{email: string|null, phone: string|null}>}
   */
  async extractMainContact(url, siteName = '') {
    console.log(`\n🤖 [GEMINI] extractMainContact chiamata`);
    console.log(`🤖 [GEMINI] URL: ${url}`);
    console.log(`🤖 [GEMINI] Site Name: ${siteName}`);
    console.log(`🤖 [GEMINI] API Key presente: ${!!this.apiKey}`);
    console.log(`🤖 [GEMINI] AI instance presente: ${!!this.ai}`);
    
    if (!this.apiKey) {
      console.error(`❌ [GEMINI] API key mancante!`);
      throw new Error('Gemini API key non configurata');
    }

    try {
      console.log(`📞 [GEMINI] Preparazione prompt...`);

      // Prompt ottimizzato per trovare solo contatti principali
      const prompt = `Visita mentalmente il sito ${url} ${siteName ? `(${siteName})` : ''} e trova i contatti principali dell'azienda.

Cerca nella homepage e pagina contatti:
- 1 EMAIL PRINCIPALE (preferibilmente info@, contatti@, o email generica aziendale)
- 1 NUMERO DI TELEFONO PRINCIPALE (preferibilmente fisso/sede principale)

ISTRUZIONI:
- Se trovi più email, scegli quella più generale/ufficiale
- Se trovi più telefoni, scegli il numero principale/sede
- Formati italiani per telefoni: +39, 02, 06, 333, etc.
- NON inventare informazioni
- Se non trovi, rispondi "Non disponibile"

Rispondi SOLO in questo formato JSON:
{
  "email": "info@example.com",
  "phone": "+39 02 1234567"
}

Se non trovi uno dei due, usa null:
{
  "email": "info@example.com",
  "phone": null
}

NON aggiungere spiegazioni, SOLO il JSON.`;

      console.log(`📤 [GEMINI] Invio richiesta API...`);
      console.log(`📤 [GEMINI] Model: gemini-2.5-flash`);
      console.log(`📤 [GEMINI] Prompt length: ${prompt.length} caratteri`);
      
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0
          },
          temperature: 0.1,
          maxOutputTokens: 150
        }
      });

      console.log(`📥 [GEMINI] Risposta ricevuta!`);
      const rawText = response.text.trim();
      console.log(`📥 [GEMINI] Testo risposta:`, rawText);

      // Estrai JSON dalla risposta
      let jsonText = rawText;
      const jsonMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const result = JSON.parse(jsonText);

      // Validazione e normalizzazione
      const contact = {
        email: result.email && result.email !== 'Non disponibile' && result.email !== 'null' ? result.email : null,
        phone: result.phone && result.phone !== 'Non disponibile' && result.phone !== 'null' ? result.phone : null
      };

      console.log(`✅ Contatti estratti: ${contact.email || 'N/A'} | ${contact.phone || 'N/A'}`);

      return contact;

    } catch (error) {
      console.error(`\n❌ [GEMINI] ERRORE in extractMainContact:`);
      console.error(`   Messaggio: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      console.error(`   Tipo: ${error.constructor.name}`);
      console.error(`   Error object:`, error);
      
      // Ritorna contatti vuoti in caso di errore
      return {
        email: null,
        phone: null,
        error: error.message
      };
    }
  }

  /**
   * Estrae dati compliance da seller page Amazon usando il prompt specializzato
   * @param {string} pageText - Testo estratto dalla seller page
   * @param {string} sellerUrl - URL seller page (per metadati)
   * @param {string} marketplace - Marketplace (amazon.it, amazon.fr, etc)
   * @returns {Promise<Object>} - Dati compliance estratti
   */
  async extractAmazonSellerCompliance(pageText, sellerUrl, marketplace = 'amazon.it') {
    if (!this.apiKey) {
      throw new Error('Gemini API key non configurata');
    }

    try {
      console.log(`🤖 Gemini: estrazione compliance da seller page ${marketplace}...`);
      console.log(`📄 Lunghezza testo: ${pageText.length} caratteri`);

      const prompt = `#CONTEXT#

You are an AI-powered web scraper extracting seller compliance details from Amazon seller pages across EU/UK/US marketplaces and languages (Italian, French, German, Spanish, English). Handle amazon.it, amazon.fr, amazon.de, amazon.es, amazon.co.uk, amazon.com.

#OBJECTIVE#

Navigate to the seller page at ${sellerUrl} and extract the "Detailed Seller Information" (localized) and specified fallback sections. Return the required fields as strict JSON.

#INSTRUCTIONS#

1) Navigate
- Open the seller page URL: ${sellerUrl}.
- Detect marketplace from the domain and language from page content.

2) Target Section (localized headings)
- Primary: find the block titled (localized variants):
  - IT: "Informazioni dettagliate sul venditore"
  - FR: "Informations détaillées sur le vendeur"
  - DE: "Detaillierte Informationen zum Verkäufer" or "Impressum & Informationen zum Verkäufer"
  - ES: "Información detallada sobre el vendedor" or "Información del vendedor"
  - EN: "Detailed Seller Information" or "Business seller information"
- If missing, check fallbacks on the same seller page:
  - DE: "Impressum"
  - EN/UK: "Business seller information" box
  - Any "Legal information" panel near Contact Seller
- Use both label matching and structural cues (definition lists, tables, key-value rows). Accept minor label variations (singular/plural, accents, punctuation).

3) Fields to Extract (trim whitespace; preserve original casing of values; return null if not present)
- 1) Seller Type
  Label examples:
  - IT: "Venditore Business"
  - FR: "Vendeur professionnel", "Type de vendeur"
  - DE: "Gewerblicher Verkäufer"
  - ES: "Vendedor profesional", "Tipo de vendedor"
  - EN: "Business seller"
  Note: If page shows "Individual" vs "Business", capture what's shown.

- 2) VAT Number
  Label examples:
  - IT: "Numero di partita IVA", "Partita IVA"
  - FR: "Numéro de TVA", "TVA"
  - DE: "Umsatzsteuer-Identifikationsnummer", "USt-IdNr."
  - ES: "Número de IVA", "NIF/CIF", "IVA"
  - EN: "VAT Number", "VAT ID"
  Post-process: normalize to CC+number when possible (e.g., IT12345678901). If multiple VATs, join with "; " in the original order.

- 3) Phone Number
  Label examples:
  - IT: "Numero di telefono"
  - FR: "Téléphone"
  - DE: "Telefon", "Telefonnummer"
  - ES: "Teléfono"
  - EN: "Phone", "Telephone"
  Post-process: format as E.164 if country code present; otherwise keep as displayed.

- 4) Email Address
  Label examples:
  - IT: "E-mail"
  - FR: "Adresse e-mail", "E-mail"
  - DE: "E-Mail"
  - ES: "Correo electrónico", "E-mail"
  - EN: "Email", "E-mail"
  Notes: If email is hidden behind a contact form, return null. If obfuscated (e.g., "name [at] domain [dot] com"), de-obfuscate when unambiguous.

- 5) Address
  Definition: the official seller address (customer service or commercial address).
  Label examples:
  - IT: "Indirizzo", "Indirizzo commerciale", "Indirizzo del servizio clienti"
  - FR: "Adresse de service clientèle", "Adresse commerciale"
  - DE: "Adresse", "Geschäftsadresse", "Kundenservice-Adresse"
  - ES: "Dirección", "Dirección de servicio de atención al cliente", "Dirección comercial"
  - EN: "Address", "Business address", "Customer service address"
  Collect the full block as written (street, city, postal code, country). If multiple addresses exist, prefer the commercial/legal one. Return as a single string, preserving line breaks with ", ".

- 6) Compliance Statement
  Definition: any legal/compliance disclosure text following or near the seller contact/company info (e.g., company registration details, dispute resolution notes, legal representative, "Impressum" text, disclaimers).
  Collect the full paragraph(s) as a single string. Preserve line breaks minimally (use " \\n " between paragraphs).

4) Robustness & Fallbacks
- Prefer data under the "Detailed Seller Information" section; otherwise take the first meaningful occurrence on the seller page.
- Do not scrape buyer-facing Q&A or reviews.
- If none of the fields are found, still return marketplace, language_detected, and source_url with other fields as null.

5) Output Format (strict JSON)
Return exactly this JSON schema with values extracted as specified:

{
  "Seller Type": "<string or null>",
  "VAT Number": "<string or null>",
  "Phone Number": "<string or null>",
  "Email Address": "<string or null>",
  "Address": "<string or null>",
  "Compliance Statement": "<string or null>",
  "marketplace": "<one of: amazon.it | amazon.fr | amazon.de | amazon.es | amazon.co.uk | amazon.com>",
  "language_detected": "<it|fr|de|es|en>",
  "source_url": "<current page URL>"
}

Ensure the JSON is valid and parseable.

#SELLER PAGE TEXT#

${pageText.slice(0, 100000)}

#RESPONSE#

Analyze the text above and respond ONLY with the JSON object. NO explanations, NO markdown formatting, JUST the raw JSON.`;

      console.log(`📤 [GEMINI] Prompt length: ${prompt.length} caratteri`);
      
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt,
        config: {
          thinkingConfig: {
            thinkingBudget: 0 // Disattiva thinking per velocità
          },
          temperature: 0.1, // Bassa temperatura per output deterministico
          maxOutputTokens: 2000
        }
      });

      console.log(`📥 [GEMINI] Risposta ricevuta!`);
      const rawText = response.text.trim();
      console.log(`📥 [GEMINI] Testo risposta:`, rawText.slice(0, 500));

      // Estrai JSON dalla risposta (potrebbe avere ```json ... ```)
      let jsonText = rawText;
      const jsonMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const result = JSON.parse(jsonText);

      // Validazione campi
      const compliance = {
        sellerType: result['Seller Type'] || null,
        vatNumber: result['VAT Number'] || null,
        phoneNumber: result['Phone Number'] || null,
        emailAddress: result['Email Address'] || null,
        address: result['Address'] || null,
        complianceStatement: result['Compliance Statement'] || null,
        marketplace: result.marketplace || marketplace,
        languageDetected: result.language_detected || 'it',
        extractedAt: new Date()
      };

      console.log(`✅ Compliance estratta:`);
      console.log(`   - Seller Type: ${compliance.sellerType || 'N/A'}`);
      console.log(`   - VAT Number: ${compliance.vatNumber || 'N/A'}`);
      console.log(`   - Phone: ${compliance.phoneNumber || 'N/A'}`);
      console.log(`   - Email: ${compliance.emailAddress || 'N/A'}`);
      console.log(`   - Address: ${compliance.address ? compliance.address.slice(0, 50) + '...' : 'N/A'}`);

      return compliance;

    } catch (error) {
      console.error(`❌ [GEMINI] Errore estrazione compliance:`, error.message);
      console.error(`❌ [GEMINI] Stack:`, error.stack);
      
      // Ritorna oggetto vuoto in caso di errore
      return {
        sellerType: null,
        vatNumber: null,
        phoneNumber: null,
        emailAddress: null,
        address: null,
        complianceStatement: null,
        marketplace: marketplace,
        languageDetected: 'it',
        extractedAt: new Date(),
        error: error.message
      };
    }
  }
}

module.exports = new GeminiService();

