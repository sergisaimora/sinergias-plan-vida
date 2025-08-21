import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, getDoc, initializeFirestore, enableNetwork } from 'firebase/firestore';


async function __fetchDocViaREST(app, projectId, databaseId, docPath) {
  try {
    const auth = getAuth(app);
    // Ensure user is signed in to get a token
    if (!auth.currentUser) {
        await signInAnonymously(auth);
    }
    const token = await auth.currentUser.getIdToken(true);
    const dbSegment = encodeURIComponent(databaseId || '(default)');
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbSegment}/documents/${docPath}`;
    
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        console.warn(`[REST Fallback] Request failed with status: ${res.status}`);
        return null;
    }
    const json = await res.json();
    if (!json || !json.fields) return null;
    return __fromFirestoreREST(json.fields);
  } catch (e) {
    console.warn('[REST Fallback] Fetch error:', e);
    return null;
  }
}

function __fromFirestoreREST(fields) {
  const parseValue = (v) => {
    if (v === null || v === undefined) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return !!v.booleanValue;
    if ('mapValue' in v) {
      const m = v.mapValue?.fields || {};
      const out = {};
      for (const k in m) out[k] = parseValue(m[k]);
      return out;
    }
    // Add other type parsers from the example if needed
    return v;
  };
  const out = {};
  for (const key in fields) out[key] = parseValue(fields[key]);
  return out;
}

// --- FUNCIÓN PARA CARGAR DESCRIPCIONES DESDE FIREBASE (VERSIÓN MEJORADA) ---
const getEnergyDescriptionsFromFirebase = async () => {
    // Caché para no recargar los datos en cada renderizado.
    if (getEnergyDescriptionsFromFirebase.cache) {
        return getEnergyDescriptionsFromFirebase.cache;
    }

    try {
        const app = getApp();
        const auth = getAuth(app);
        
        if (!auth.currentUser) {
            throw new Error("Se intentó leer datos sin un usuario autenticado.");
        }

        const db = getDb(app, FIRESTORE_DB_ID); // Using your existing getDb function

        // Función auxiliar mejorada para leer un documento
        const readDoc = async (docName) => {
            const docRef = doc(db, 'analisistextos', docName);
            try {
                // Intento 1: Usar el SDK normal de Firestore
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    return docSnap.data(); // Devuelve los datos directamente
                } else {
                    console.warn(`SDK: El documento "${docName}" no fue encontrado.`);
                    return null;
                }
            } catch (error) {
                // Si falla por estar offline, usamos el fallback
                if (error.code === 'unavailable' || error.message.includes('offline')) {
                    console.warn(`SDK falló para "${docName}" (${error.code}). Intentando con REST Fallback...`);
                    const docPath = `analisistextos/${docName}`;
                    // Llama a la función de fallback que añadiste en el Paso 1
                    const restData = await __fetchDocViaREST(app, firebaseConfig.projectId, FIRESTORE_DB_ID, docPath);
                    if (restData) {
                        console.log(`REST Fallback para "${docName}" tuvo éxito.`);
                        return restData;
                    } else {
                        console.error(`REST Fallback para "${docName}" también falló.`);
                        return null;
                    }
                }
                // Si es otro tipo de error, lo lanzamos
                throw error;
            }
        };

        // Realiza todas las lecturas en paralelo
        const [karma, talentos, mision, objetivos] = await Promise.all([
            readDoc('karma'),
            readDoc('talentos'),
            readDoc('misión'),
            readDoc('objetivos')
        ]);

        // Procesa los datos de la misma manera que tu código original
        const processRawData = (rawData) => {
    if (!rawData) return {};
    const formattedData = {};
    for (const key in rawData) {
        // AHORA: Comprueba si el dato es un string no vacío.
        if (rawData[key] && typeof rawData[key] === 'string') {
            // Transforma el string en el objeto que la app espera.
            formattedData[key] = {
                title: `Análisis para energía ${key}`, // Crea un título genérico.
                description: rawData[key] // Usa el texto de la DB como descripción.
            };
        }
    }
    return formattedData;
};
        
        const descriptions = {
            karmaDescriptions: processRawData(karma),
            talentDescriptions: processRawData(talentos),
            missionDescriptions: processRawData(mision),
            goalDescriptions: processRawData(objetivos),
        };

        // Guarda en caché el resultado para futuras llamadas.
        getEnergyDescriptionsFromFirebase.cache = descriptions;
        return descriptions;

    } catch (error) {
        // Este bloque ahora solo se ejecutará si el fallback también falla
        console.error("Error crítico y final al cargar descripciones:", error);
        return {
            karmaDescriptions: {}, talentDescriptions: {},
            missionDescriptions: {}, goalDescriptions: {}
        };
    }
};

// --- CONFIGURACIÓN DE FIREBASE ---
// Se utiliza la configuración proporcionada por el entorno para mayor seguridad y flexibilidad.
const firebaseConfig = {
  // Lee valores de Firebase desde variables de entorno cuando estén disponibles. Si no se
  // proporcionan, usa los valores por defecto definidos en el código. Esto permite que las claves
  // sensibles se almacenen en la configuración de Vercel en lugar de exponerse en el bundle.
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyDFrswKemxaK5KGt6PMb-3aRsJQgJ_Orlk",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "gold-subset-467605-u7.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "gold-subset-467605-u7",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "gold-subset-467605-u7.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "898264190170",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:898264190170:web:0e21a959bc8609658029e3",
  measurementId: "G-PQLYSLK3TB"
    };

const FIRESTORE_DB_ID = 'analisistextos';

// Función de inicialización de Firestore para evitar errores si se llama múltiples veces.
function getDb(app, databaseId) {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    }, databaseId);
  } catch (e) {
    return getFirestore(app, databaseId);
  }
}



// --- CONSTANTES GLOBALES Y CONFIGURACIÓN ---
const APP_CONFIG = {
    // URL base para llamadas al modelo Gemini. Se puede sobrescribir mediante una variable de entorno
    // si se desea apuntar a un proxy propio (/api/generate) en lugar de realizar llamadas directas.
    GEMINI_API_URL: process.env.REACT_APP_GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent",
    // URL de la función de Cloud para síntesis de voz. Se puede sobrescribir mediante variable de entorno.
    TTS_CLOUD_FUNCTION_URL: process.env.REACT_APP_CLOUD_FUNCTION_URL || "https://us-central1-gold-subset-467605-u7.cloudfunctions.net/textToSpeechProxy",
    FETCH_TIMEOUT_MS: 90000,
};

const LANGUAGE_VOICE_MAP = {
    'Español (original)': { lang: 'es-ES', name: 'es-ES-Wavenet-B' },
    'English (USA)': { lang: 'en-US', name: 'en-US-Standard-C' },
    'Français': { lang: 'fr-FR', name: 'fr-FR-Wavenet-B' },
    'Italiano': { lang: 'it-IT', name: 'it-IT-Wavenet-B' },
    'Português': { lang: 'pt-BR', name: 'pt-BR-Wavenet-B' },
    'Deutsch': { lang: 'de-DE', name: 'de-DE-Wavenet-B' },
    'Català': { lang: 'ca-ES', name: 'ca-es-Standard-A' },
    'Lietuvių': { lang: 'lt-LT', name: 'lt-LT-Standard-A' },
};

// --- Motor de Cálculo de Energías ---
const calculationEngine = {
    conversionTable: { 'A': 1, 'B': 2, 'C': 11, 'D': 4, 'E': 5, 'F': 17, 'G': 3, 'H': 5, 'I': 10, 'J': 10, 'K': 19, 'L': 12, 'M': 13, 'N': 14, 'Ñ': 3, 'O': 6, 'P': 17, 'Q': 19, 'R': 20, 'S': 15, 'T': 9, 'U': 6, 'V': 6, 'W': 6, 'X': 15, 'Y': 16, 'Z': 7, 'AH': 5, 'CH': 8, 'SH': 21, 'TA': 22, 'TH': 22, 'TZ': 18, 'WH': 16 },
    sumDigits: (num) => num.toString().split('').reduce((a, d) => a + +d, 0),
    reduceNumber: function(num) { if (num >= 1 && num <= 22) return num; let s = this.sumDigits(num); while (s > 22) s = this.sumDigits(s); return s; },
    reduceToSmallest: function(num) { let s = this.sumDigits(num); while (s > 9) s = this.sumDigits(s); return s; },
    calculateAspectPair: function(numbers) { const arr = Array.isArray(numbers) ? numbers : [numbers]; if (!arr.length) return 'N/A'; const sum = arr.reduce((a, n) => a + n, 0); let left = this.reduceNumber(sum); let right = this.reduceToSmallest(left); if (left === 10) right = 1; if (left === 19) right = 1; if (left === 22) right = 4; return `${left}-${right}`; },
    getPhoneticValues: function(name) { const preNormalized = name.replace(/ñ/gi, (match) => match === 'ñ' ? '__LOWER_ENYE__' : '__UPPER_ENYE__'); const normalized = preNormalized.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); const restored = normalized.replace(/__LOWER_ENYE__/g, 'ñ').replace(/__UPPER_ENYE__/g, 'Ñ'); const words = restored.toUpperCase().split(/\s+/).filter(w => w.length > 0); const allVals = []; words.forEach((word) => { let i = 0; while (i < word.length) { let foundCombo = false; if (i + 1 < word.length) { const twoLetterCombo = word.substring(i, i + 2); if (this.conversionTable[twoLetterCombo]) { allVals.push(this.conversionTable[twoLetterCombo]); i += 2; foundCombo = true; } } if (!foundCombo) { if (this.conversionTable[word[i]]) { allVals.push(this.conversionTable[word[i]]); } i++; } } }); return allVals; },
    calculateEnergies: function(name) {
        const phonVals = this.getPhoneticValues(name);
        if (!phonVals.length) return { error: "El nombre no es válido o está vacío." };
        const isShortName = phonVals.length < 10;
        let pk, sk, pt, st, pg, sg, mision;
        if (isShortName) {
            let aspects = { challenges: [], talents: [], goals: [] };
            phonVals.forEach((v, i) => aspects[Object.keys(aspects)[i % 3]].push(v));
            pk = this.calculateAspectPair(aspects.challenges); sk = pk;
            pt = this.calculateAspectPair(aspects.talents); st = pt;
            pg = this.calculateAspectPair(aspects.goals); sg = pg;
            mision = this.calculateAspectPair(phonVals.reduce((a, b) => a + b, 0));
        } else {
            let aspects = { pk: [], sk: [], pt: [], st: [], pg: [], sg: [] };
            phonVals.forEach((v, i) => aspects[Object.keys(aspects)[i % 6]].push(v));
            pk = this.calculateAspectPair(aspects.pk); sk = this.calculateAspectPair(aspects.sk);
            pt = this.calculateAspectPair(aspects.pt); st = this.calculateAspectPair(aspects.st);
            pg = this.calculateAspectPair(aspects.pg); sg = this.calculateAspectPair(aspects.sg);
            const allLefts = [pk, sk, pt, st, pg, sg].map(p => (p && p !== 'N/A') ? +p.split('-')[0] : 0);
            mision = this.calculateAspectPair(allLefts.reduce((a, n) => a + n, 0));
        }
        const nameSum = phonVals.reduce((a, n) => a + n, 0);
        const esencia = this.calculateAspectPair(nameSum * nameSum);
        return { "Misión": mision, "Esencia": esencia, "Karma I": pk, "Karma II": sk, "Talento I": pt, "Talento II": st, "Objetivo I": pg, "Objetivo II": sg };
    }
};

// --- LÓGICA DE COMPATIBILIDAD ---
const CATEGORIES = [
  { min: 85, max: 100, label: 'Afinidad Excepcional', brief: 'Una conexión con sinergia alta, natural y un gran potencial co-creativo.' },
  { min: 60, max: 84,  label: 'Afinidad Sólida', brief: 'Una conexión con bases fuertes y estables, y con espacio para seguir creciendo juntos.' },
  { min: 35, max: 59,  label: 'Afinidad Evolutiva', brief: 'Una relación con contrastes interesantes que invitan al crecimiento mutuo y consciente.' },
  { min: 11, max: 34,  label: 'Afinidad Inicial', brief: 'Una sintonía con puntos de encuentro claros que pueden fortalecerse con el tiempo y la intención.' },
  { min: 0,  max: 10,   label: 'Afinidad Delicada', brief: 'Una dinámica con fricciones notables que requiere consciencia, comunicación y límites claros.' }
];

function checkMatch(energyA, energyB) {
    if (!energyA || !energyB || energyA === 'N/A' || energyB === 'N/A') return null;
    if (energyA === energyB) return 'exact';
    const [, rightA] = energyA.split('-');
    const [, rightB] = energyB.split('-');
    if (rightA === rightB) return 'partial';
    return null;
}

const astroRelationsData = [
  { "energia": "1-1", "complementarios": ["13-4", "5-5"], "antagonistas": ["10-1", "16-7"] },
  { "energia": "2-2", "complementarios": ["16-7", "8-8"], "antagonistas": ["5-5", "12-3"] },
  { "energia": "3-3", "complementarios": ["15-6", "5-5"], "antagonistas": ["8-8", "16-7"] },
  { "energia": "4-4", "complementarios": ["18-9", "9-9"], "antagonistas": ["6-6", "14-5"] },
  { "energia": "5-5", "complementarios": ["12-3", "3-3"], "antagonistas": ["8-8", "16-7"] },
  { "energia": "6-6", "complementarios": ["14-5", "4-4"], "antagonistas": ["9-9", "18-9"] },
  { "energia": "7-7", "complementarios": ["15-6", "22-4"], "antagonistas": ["10-1", "19-1"] },
  { "energia": "8-8", "complementarios": ["16-7", "2-2"], "antagonistas": ["5-5", "12-3"] },
  { "energia": "9-9", "complementarios": ["18-9", "4-4"], "antagonistas": ["6-6", "14-5"] },
  { "energia": "10-1", "complementarios": ["19-1", "17-8"], "antagonistas": ["7-7", "15-6"] },
  { "energia": "11-2", "complementarios": ["22-4", "12-3"], "antagonistas": ["8-8", "16-7"] },
  { "energia": "12-3", "complementarios": ["5-5", "11-2"], "antagonistas": ["8-8", "2-2"] },
  { "energia": "13-4", "complementarios": ["1-1", "19-1"], "antagonistas": ["7-7", "15-6"] },
  { "energia": "14-5", "complementarios": ["6-6", "20-2"], "antagonistas": ["9-9", "4-4"] },
  { "energia": "15-6", "complementarios": ["7-7", "22-4"], "antagonistas": ["10-1", "17-8"] },
  { "energia": "16-7", "complementarios": ["8-8", "20-2"], "antagonistas": ["5-5", "12-3"] },
  { "energia": "17-8", "complementarios": ["19-1", "10-1"], "antagonistas": ["7-7", "15-6"] },
  { "energia": "18-9", "complementarios": ["9-9", "21-3"], "antagonistas": ["6-6", "14-5"] },
  { "energia": "19-1", "complementarios": ["10-1", "13-4"], "antagonistas": ["7-7", "15-6"] },
  { "energia": "20-2", "complementarios": ["8-8", "16-7"], "antagonistas": ["5-5", "12-3"] },
  { "energia": "21-3", "complementarios": ["9-9", "18-9"], "antagonistas": ["6-6", "14-5"] },
  { "energia": "22-4", "complementarios": ["7-7", "15-6"], "antagonistas": ["10-1", "17-8"] }
];
const astroRelations = astroRelationsData.reduce((acc, curr) => {
    acc[curr.energia] = { comp: curr.complementarios, ant: curr.antagonistas };
    return acc;
}, {});


function calcularCompatibilidad(A, B, opts = {}) {
  const phase = opts.phase === 'first' ? 'first' : 'second';
  const CONFIG = {
    anchors: ['M', 'E'],
    weights_second: { R1_T_to_ANCHOR: 20, R2b_T_to_O2: 16, R2a_T_to_O1: 12, R4_T_to_K: 12, R3_ANCHOR_to_ANCHOR: 10, R5b_ANCHOR_to_O2: 10, R5a_ANCHOR_to_O1: 8, R6b_O2_to_O2: 5, R6a_O1_to_O1: 3, R8a_K_same_stage: -15, R8b_K_cross_stage: -10, R9_K_to_O: -10, R10_COMP_ME: 8, R11_ANT_ME: -8, R12_K_to_ANCHOR: -7, R13_PARTIAL_MM: -5 },
    weights_first: { R1_T_to_ANCHOR: 20, R2a_T_to_O1: 16, R2b_T_to_O2: 12, R4_T_to_K: 12, R3_ANCHOR_to_ANCHOR: 10, R5a_ANCHOR_to_O1: 10, R5b_ANCHOR_to_O2: 8, R6a_O1_to_O1: 5, R6b_O2_to_O2: 3, R8a_K_same_stage: -15, R8b_K_cross_stage: -10, R9_K_to_O: -10, R10_COMP_ME: 8, R11_ANT_ME: -8, R12_K_to_ANCHOR: -7, R13_PARTIAL_MM: -5 },
    bonuses: { B1_balance_integrator: 5, B2_north_coherence_per_person_noK: 5, B3_shared_active_focus_both_dirs: 5, B4_talent_complementarity_none_shared: 6, B4_talent_complementarity_one_shared: 3 },
    caps: { min: 0, max: 100 }
  };
  const W = phase === 'first' ? CONFIG.weights_first : CONFIG.weights_second;
  const ANCH = CONFIG.anchors;
  const matches = new Map();

  const addMatch = (posA, posB, rule, basePoints, energyA, energyB) => {
      const matchType = checkMatch(energyA, energyB);
      if (!matchType) return;
      const points = (matchType === 'partial' && rule !== 'R13_PARTIAL_MM') ? basePoints * 0.5 : basePoints;
      const key = `${posA}|${posB}`;
      const desc = `${energyA} ↔ ${energyB}`;
      const current = matches.get(key);
      if (!current || Math.abs(points) > Math.abs(current.points)) {
          matches.set(key, { rule, points, desc, posA, posB, energyA, energyB });
      }
  };

  const ruleMap = {
      'T_to_ANCHOR': { rule: 'R1_T_to_ANCHOR', weight: W.R1_T_to_ANCHOR },
      'T_to_O2': { rule: 'R2b_T_to_O2', weight: W.R2b_T_to_O2 },
      'T_to_O1': { rule: 'R2a_T_to_O1', weight: W.R2a_T_to_O1 },
      'T_to_K': { rule: 'R4_T_to_K', weight: W.R4_T_to_K },
      'ANCHOR_to_ANCHOR': { rule: 'R3_ANCHOR_to_ANCHOR', weight: W.R3_ANCHOR_to_ANCHOR },
      'ANCHOR_to_O2': { rule: 'R5b_ANCHOR_to_O2', weight: W.R5b_ANCHOR_to_O2 },
      'ANCHOR_to_O1': { rule: 'R5a_ANCHOR_to_O1', weight: W.R5a_ANCHOR_to_O1 },
      'O2_to_O2': { rule: 'R6b_O2_to_O2', weight: W.R6b_O2_to_O2 },
      'O1_to_O1': { rule: 'R6a_O1_to_O1', weight: W.R6a_O1_to_O1 },
      'K_same_stage': { rule: 'R8a_K_same_stage', weight: W.R8a_K_same_stage },
      'K_cross_stage': { rule: 'R8b_K_cross_stage', weight: W.R8b_K_cross_stage },
      'K_to_O': { rule: 'R9_K_to_O', weight: W.R9_K_to_O },
      'COMP_ME': { rule: 'R10_COMP_ME', weight: W.R10_COMP_ME },
      'ANT_ME': { rule: 'R11_ANT_ME', weight: W.R11_ANT_ME },
      'K_to_ANCHOR': { rule: 'R12_K_to_ANCHOR', weight: W.R12_K_to_ANCHOR },
      'PARTIAL_MM': { rule: 'R13_PARTIAL_MM', weight: W.R13_PARTIAL_MM }
  };

  ['A', 'B'].forEach(person => {
      const P = person === 'A' ? A : B;
      const Other = person === 'A' ? B : A;
      const pLabel = person;
      const oLabel = person === 'A' ? 'B' : 'A';

      ['T1', 'T2'].forEach(t => {
          ANCH.forEach(a => addMatch(`${pLabel}.${t}`, `${oLabel}.${a}`, ruleMap.T_to_ANCHOR.rule, ruleMap.T_to_ANCHOR.weight, P[t], Other[a]));
          addMatch(`${pLabel}.${t}`, `${oLabel}.O2`, ruleMap.T_to_O2.rule, ruleMap.T_to_O2.weight, P[t], Other.O2);
          addMatch(`${pLabel}.${t}`, `${oLabel}.O1`, ruleMap.T_to_O1.rule, ruleMap.T_to_O1.weight, P[t], Other.O1);
          ['K1', 'K2'].forEach(k => addMatch(`${pLabel}.${t}`, `${oLabel}.${k}`, ruleMap.T_to_K.rule, ruleMap.T_to_K.weight, P[t], Other[k]));
      });

      ANCH.forEach(a => {
          ANCH.forEach(b => {
                  const posA_full = `${pLabel}.${a}`;
                  const posB_full = `${oLabel}.${b}`;
                  const energy_A = P[a];
                  const energy_B = Other[b];
                  const matchType = checkMatch(energy_A, energy_B);
                  if (a === 'M' && b === 'M' && matchType === 'partial') {
                    addMatch(posA_full, posB_full, ruleMap.PARTIAL_MM.rule, ruleMap.PARTIAL_MM.weight, energy_A, energy_B);
                  } else {
                    addMatch(posA_full, posB_full, ruleMap.ANCHOR_to_ANCHOR.rule, ruleMap.ANCHOR_to_ANCHOR.weight, energy_A, energy_B);
                  }
          });
          addMatch(`${pLabel}.${a}`, `${oLabel}.O2`, ruleMap.ANCHOR_to_O2.rule, ruleMap.ANCHOR_to_O2.weight, P[a], Other.O2);
          addMatch(`${pLabel}.${a}`, `${oLabel}.O1`, ruleMap.ANCHOR_to_O1.rule, ruleMap.ANCHOR_to_O1.weight, P[a], Other.O1);
      });

       ['K1', 'K2'].forEach(k => {
          ['O1', 'O2'].forEach(o => addMatch(`${pLabel}.${k}`, `${oLabel}.${o}`, ruleMap.K_to_O.rule, ruleMap.K_to_O.weight, P[k], Other[o]));
          ANCH.forEach(a => addMatch(`${pLabel}.${k}`, `${oLabel}.${a}`, ruleMap.K_to_ANCHOR.rule, ruleMap.K_to_ANCHOR.weight, P[k], Other[a]));
       });
  });

  addMatch('A.O2', 'B.O2', ruleMap.O2_to_O2.rule, ruleMap.O2_to_O2.weight, A.O2, B.O2);
  addMatch('A.O1', 'B.O1', ruleMap.O1_to_O1.rule, ruleMap.O1_to_O1.weight, A.O1, B.O1);
  addMatch('A.K1', 'B.K1', ruleMap.K_same_stage.rule, ruleMap.K_same_stage.weight, A.K1, B.K1);
  addMatch('A.K2', 'B.K2', ruleMap.K_same_stage.rule, ruleMap.K_same_stage.weight, A.K2, B.K2);
  addMatch('A.K1', 'B.K2', ruleMap.K_cross_stage.rule, ruleMap.K_cross_stage.weight, A.K1, B.K2);
  addMatch('A.K2', 'B.K1', ruleMap.K_cross_stage.rule, ruleMap.K_cross_stage.weight, A.K2, B.K1);

  const checkAstroRelation = (energyA, energyB, relationType) => {
      if (!energyA || !energyB || energyA === 'N/A' || energyB === 'N/A') return false;
      const relsA = astroRelations[energyA];
      const relsB = astroRelations[energyB];
      return (relsA && relsA[relationType].includes(energyB)) || (relsB && relsB[relationType].includes(energyA));
  };

  const anchorsA = { M: A.M, E: A.E };
  const anchorsB = { M: B.M, E: B.E };
  for (const keyA in anchorsA) {
      for (const keyB in anchorsB) {
          const energyA = anchorsA[keyA];
          const energyB = anchorsB[keyB];
          if (checkAstroRelation(energyA, energyB, 'comp')) {
              matches.set(`COMP_${keyA}-${keyB}`, { rule: ruleMap.COMP_ME.rule, points: ruleMap.COMP_ME.weight, desc: `${energyA} (complementa) ${energyB}`, posA: `A.${keyA}`, posB: `B.${keyB}`, energyA, energyB });
          }
          if (checkAstroRelation(energyA, energyB, 'ant')) {
              matches.set(`ANT_${keyA}-${keyB}`, { rule: ruleMap.ANT_ME.rule, points: ruleMap.ANT_ME.weight, desc: `${energyA} (antagoniza) ${energyB}`, posA: `A.${keyA}`, posB: `B.${keyB}`, energyA, energyB });
          }
      }
  }

  let total = 0;
  const detail = Array.from(matches.values());
  detail.forEach(m => total += m.points);

  const bonusesApplied = [];
  const has_TK = detail.some(m => m.rule === 'R4_T_to_K');
  const has_KK = detail.some(m => m.rule === 'R8a_K_same_stage' || m.rule === 'R8b_K_cross_stage');
  if (has_TK && !has_KK) {
      total += CONFIG.bonuses.B1_balance_integrator;
      bonusesApplied.push('B1');
  }
  const countAnchorInOther = (anchorValue, other) => [other.T1, other.T2, other.O1, other.O2, other.M, other.E].filter(v => v === anchorValue).length;
  [['A', A, B], ['B', B, A]].forEach(([label, P, Other]) => {
      if (countAnchorInOther(P.M, Other) >= 3 || countAnchorInOther(P.E, Other) >= 3) {
          total += CONFIG.bonuses.B2_north_coherence_per_person_noK;
          bonusesApplied.push(`B2_${label}`);
      }
  });
  const activeO = phase === 'first' ? 'O1' : 'O2';
  const condA = ANCH.some(a => checkMatch(A[a], B[activeO]));
  const condB = ANCH.some(a => checkMatch(B[a], A[activeO]));
  if (condA && condB) {
      total += CONFIG.bonuses.B3_shared_active_focus_both_dirs;
      bonusesApplied.push('B3');
  }
  const sharedTalents = [A.T1, A.T2].filter(t => [B.T1, B.T2].includes(t)).length;
  if (sharedTalents === 0) {
      total += CONFIG.bonuses.B4_talent_complementarity_none_shared;
      bonusesApplied.push('B4_none_shared');
  } else if (sharedTalents === 1) {
      total += CONFIG.bonuses.B4_talent_complementarity_one_shared;
      bonusesApplied.push('B4_one_shared');
  }

  const totalClamped = Math.max(CONFIG.caps.min, Math.min(CONFIG.caps.max, Math.round(total)));
  return { total: totalClamped, totalRaw: total, phase, matches: detail.sort((a,b)=>b.points-a.points), bonusesApplied };
}

function clasificar(score) { for (const c of CATEGORIES) if (score >= c.min && score <= c.max) return c; return CATEGORIES[CATEGORIES.length - 1]; }


// --- Iconos SVG ---
const IconSparkles = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/></svg>;
const IconTrash = () => <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
const IconPDF = () => <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>;
const IconSoundWave = () => <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10v4" /><path d="M6 7v10" /><path d="M10 4v16" /><path d="M14 7v10" /><path d="M18 10v4" /></svg>;
const IconCopy = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>;
const IconDownload = () => <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const IconClipboard = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>;

// --- FUNCIONES AUXILIARES ---
// NUEVA FUNCIÓN CON LÓGICA DE REINTENTOS Y BACKOFF
async function fetchWithBackoff(url, options = {}, retries = 3, initialDelay = 1000) {
    let delay = initialDelay;
    const controller = new AbortController();
    const timeout = APP_CONFIG.FETCH_TIMEOUT_MS || 90000;

    for (let i = 0; i < retries; i++) {
        const id = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal, // Asocia el AbortController
            });

            clearTimeout(id); // Limpia el timeout si la respuesta llega a tiempo

            // Si la respuesta es exitosa (2xx), la devolvemos.
            if (response.ok) {
                return response;
            }

            // Si es un error de servidor (5xx) o 429 (demasiadas peticiones), reintentamos.
            if (response.status === 503 || response.status === 429 || response.status >= 500) {
                console.warn(`Intento ${i + 1}/${retries} falló con estado ${response.status}. Reintentando en ${delay}ms...`);
                // No reintentamos más si este es el último intento
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Duplicamos el tiempo de espera para el próximo intento
                } else {
                    // Si es el último intento y falla, lanzamos el error
                    throw new Error(`La llamada a la IA falló después de ${retries} intentos con estado: ${response.status}`);
                }
            } else {
                // Si es otro tipo de error (ej. 403 de permisos), no reintentamos y lanzamos el error.
                throw response; 
            }
        } catch (error) {
            clearTimeout(id); // Limpia el timeout también si hay un error

            // Si el error es por un AbortController o un fallo de red, y no es el último intento
            if (i < retries - 1) {
                console.warn(`Intento ${i + 1}/${retries} falló por error de red o timeout. Reintentando en ${delay}ms...`, error.name);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            } else {
                // Si es el último intento, lanzamos el error para que sea gestionado más arriba.
                console.error(`Todos los ${retries} intentos fallaron. Error final:`, error);
                throw error; // Lanza el error original (puede ser un objeto Response o un Error)
            }
        }
    }
}

const fetchWithTimeout = (url, options = {}, timeout = APP_CONFIG.FETCH_TIMEOUT_MS) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const opts = { ...options, signal: controller.signal };
    return fetch(url, opts).finally(() => clearTimeout(id));
};

const b64toBlob = (b64Data, contentType = '', sliceSize = 512) => {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
};

// --- Componente para el formulario de una persona ---
const PersonForm = ({ personData, onInputChange, personIndex }) => {
    const setPhase = (phase) => {
        onInputChange(personIndex, 'phase', phase);
    };

    const activeClass = "bg-blue-600 text-white";
    const inactiveClass = "bg-gray-200 text-gray-700 hover:bg-gray-300";

    return (
        <div className="space-y-4 bg-gray-50 p-4 rounded-lg border">
            <h3 className="font-bold text-lg text-gray-700">Persona {personIndex + 1}</h3>
            <div>
                <label htmlFor={`nombre-${personIndex}`} className="block text-sm font-semibold text-gray-600 mb-1">Nombre y Apellidos</label>
                <input type="text" id={`nombre-${personIndex}`} name="nombre" value={personData.nombre} onChange={(e) => onInputChange(personIndex, 'nombre', e.target.value)} placeholder="Ej: María López García" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition" required />
            </div>
            <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2">Etapa de Vida</label>
                <div className="flex gap-2">
                    <button type="button" onClick={() => setPhase('first')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition ${personData.phase === 'first' ? activeClass : inactiveClass}`}>
                        Etapa I (&lt; 35)
                    </button>
                    <button type="button" onClick={() => setPhase('second')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition ${personData.phase === 'second' ? activeClass : inactiveClass}`}>
                        Etapa II (&gt; 35)
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Componente Modal para el Audio ---
const AudioModal = ({ script, onClose, people, targetLanguage }) => {
    const [downloadState, setDownloadState] = useState('idle');
    const [copyState, setCopyState] = useState('Copiar Texto');
    const [error, setError] = useState('');

    const fallbackCopy = (text) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.top = "-9999px";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            setCopyState('¡Copiado!');
            setTimeout(() => setCopyState('Copiar Texto'), 2000);
        } catch (err) {
            setError('La copia automática falló. Por favor, copia el texto manualmente.');
        }
        document.body.removeChild(textArea);
    };

    const handleCopyScript = () => {
        setError('');
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(script).then(() => {
                setCopyState('¡Copiado!');
                setTimeout(() => setCopyState('Copiar Texto'), 2000);
            }).catch(err => fallbackCopy(script));
        } else {
            fallbackCopy(script);
        }
    };

    const handleDownload = async () => {
        setDownloadState('loading');
        setError('');
        const MAX_LENGTH = 4500;
        const chunks = [];
        let currentChunk = "";
        const sentences = script.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
            if (currentChunk.length + sentence.length > MAX_LENGTH) {
                chunks.push(currentChunk);
                currentChunk = sentence;
            } else {
                currentChunk += " " + sentence;
            }
        }
        chunks.push(currentChunk.trim());
        try {
            const voiceConfig = LANGUAGE_VOICE_MAP[targetLanguage] || LANGUAGE_VOICE_MAP['Español (original)'];
            const audioResponses = await Promise.all(chunks.map(chunk => {
                // ...
                return fetchWithBackoff(APP_CONFIG.TTS_CLOUD_FUNCTION_URL, { // <-- CAMBIO AQUÍ
                    method: 'POST',
                    // ...
                }).then(res => {
                    // La lógica de reintento ya está hecha.
                    if (!res.ok) throw new Error(`La llamada al asistente de voz falló: ${res.statusText}`);
                    return res.json();
                });
            }));
            const audioBlobs = audioResponses.map(response => {
                if (!response.audioContent) throw new Error("La respuesta del servidor no contiene audio.");
                return b64toBlob(response.audioContent, 'audio/mpeg');
            });
            const combinedBlob = new Blob(audioBlobs, { type: 'audio/mpeg' });
            const url = window.URL.createObjectURL(combinedBlob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            const p1_name = people[0].nombre.split(' ')[0];
            const p2_name = people[1].nombre.split(' ')[0];
            a.download = `Sinergia ${p1_name} y ${p2_name}.mp3`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            setDownloadState('success');
        } catch (err) {
            console.error('Error al generar el audio:', err);
            setError(`Error: ${err.message}`);
            setDownloadState('error');
        } finally {
            setTimeout(() => setDownloadState('idle'), 3000);
        }
    };

    const getButtonContent = () => {
        switch (downloadState) {
            case 'loading': return 'Generando Audio...';
            case 'success': return '¡Descargado!';
            case 'error': return 'Error al generar';
            default: return 'Descargar Audio MP3';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
                <h3 className="text-xl font-bold text-gray-800 mb-2">Guion para Narración</h3>
                <p className="text-sm text-gray-600 mb-4">Este es el texto que se convertirá en audio. Puedes copiarlo o descargarlo.</p>
                <textarea
                    readOnly
                    value={script}
                    className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 flex-grow"
                />
                {error && <p className="text-red-600 text-sm mt-2 text-center">{error}</p>}
                <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
                    <button onClick={onClose} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">Cerrar</button>
                    <button onClick={handleCopyScript} className="flex items-center justify-center gap-2 bg-gray-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-700">
                        <IconClipboard /> {copyState}
                    </button>
                    <button onClick={handleDownload} disabled={downloadState === 'loading'} className="flex items-center justify-center gap-2 bg-teal-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-teal-600 disabled:bg-gray-400">
                        <IconDownload /> {getButtonContent()}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Componente para la Estrella de Energía (para vista previa en pantalla) ---
const EnergyStarPreview = ({ energies, personName }) => {
    if (!energies) return null;
    const { "Misión": mision, "Esencia": esencia, "Karma I": karma1, "Karma II": karma2, "Talento I": talento1, "Talento II": talento2, "Objetivo I": objetivo1, "Objetivo II": objetivo2 } = energies;
    return (
        <div className="flex flex-col items-center p-4">
            <h3 className="font-bold text-lg text-gray-800 mb-3">{personName}</h3>
            <svg width="300" height="300" viewBox="0 0 130 130" xmlns="http://www.w3.org/2000/svg">
                {/* Estructura de la estrella */}
                <polygon points="65,10 115,90 15,90" stroke="#60A5FA" fill="none" strokeWidth="0.5"/>
                <polygon points="65,110 15,30 115,30" stroke="#C084FC" fill="none" strokeWidth="0.5"/>
                <polygon points="65,47 50,72 80,72" stroke="#4A5568" fill="none" strokeWidth="0.3"/>
                
                {/* Círculo Central */}
                <circle cx="65" cy="65" r="18" stroke="black" fill="white" strokeWidth="0.5"/>
                <text x="65" y="62" textAnchor="middle" fontSize="11" fontWeight="bold">{mision}</text>
                <text x="65" y="73" textAnchor="middle" fontSize="5.5">MISIÓN</text>
                
                {/* Puntos de energía */}
                <text x="65" y="86" textAnchor="middle" fontSize="6" fill="#4A5568">{esencia}</text>
                <text x="65" y="93" textAnchor="middle" fontSize="5.5" fill="#4A5568">Esencia</text>
                
                <text x="65" y="10" textAnchor="middle" fontSize="6" fill="#C084FC">{objetivo2}</text>
                <text x="65" y="4" textAnchor="middle" fontSize="5.5" fill="#C084FC">Objetivo II</text>
                
                <text x="118" y="33" textAnchor="start" fontSize="6" fill="#60A5FA">{karma1}</text>
                <text x="122" y="40" textAnchor="end" fontSize="5.5" fill="#60A5FA">Karma I</text>
                
                <text x="118" y="93" textAnchor="start" fontSize="6" fill="#C084FC">{karma2}</text>
                <text x="122" y="100" textAnchor="end" fontSize="5.5" fill="#C084FC">Karma II</text>
                
                <text x="65" y="118" textAnchor="middle" fontSize="6" fill="#60A5FA">{talento1}</text>
                <text x="65" y="125" textAnchor="middle" fontSize="5.5" fill="#60A5FA">Talento I</text>
                
                <text x="12" y="93" textAnchor="end" fontSize="6" fill="#C084FC">{talento2}</text>
                <text x="8" y="100" textAnchor="start" fontSize="5.5" fill="#C084FC">Talento II</text>
                
                <text x="12" y="33" textAnchor="end" fontSize="6" fill="#60A5FA">{objetivo1}</text>
                <text x="8" y="40" textAnchor="start" fontSize="5.5" fill="#60A5FA">Objetivo I</text>
            </svg>
        </div>
    );
};

// --- Componente Principal de la Aplicación ---
function App() {
    const initialPersonState = { nombre: '', phase: 'second' };
    const [people, setPeople] = useState([initialPersonState, initialPersonState]);
    const [results, setResults] = useState([null, null]);
    const [analysisData, setAnalysisData] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState('');
    const [isExportingPDF, setIsExportingPDF] = useState(false);
    const [isPdfMakeReady, setIsPdfMakeReady] = useState(false);
    const [copyButtonText, setCopyButtonText] = useState('Copiar Análisis');
    const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
    const [audioScript, setAudioScript] = useState('');
    const [targetLanguage, setTargetLanguage] = useState('Español (original)');
    const [energyDescriptions, setEnergyDescriptions] = useState(null);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [dataError, setDataError] = useState('');
    const [isAuthReady, setIsAuthReady] = useState(false);

    // --- useEffect PARA INICIALIZAR FIREBASE Y AUTENTICAR ---
    useEffect(() => {
        try {
            const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
            const auth = getAuth(app);

            const unsubscribe = onAuthStateChanged(auth, (user) => {
                if (user) {
                    setIsAuthReady(true);
                    unsubscribe(); // Limpia el listener una vez que se confirma el usuario.
                }
            });

             const authenticate = async () => {
                if (!auth.currentUser) {
                    // We will always use anonymous sign-in for simplicity and reliability.
                    await signInAnonymously(auth);
                } else {
                    // The user is already signed in from a previous session.
                    setIsAuthReady(true);
                }
            };

            authenticate().catch(err => {
                console.error("Error de autenticación:", err);
                setDataError("Fallo en la autenticación. No se pueden cargar los datos.");
                setIsLoadingData(false);
            });

            // Devuelve la función de limpieza para el listener.
            return () => {
                if (unsubscribe) unsubscribe();
            };
        } catch (err) {
            console.error("Error al inicializar Firebase:", err);
            setDataError("No se pudo conectar con el servicio de datos.");
            setIsLoadingData(false);
        }
    }, []); // Se ejecuta solo una vez al montar el componente.

    // --- useEffect PARA CARGAR LOS DATOS DE FIREBASE (depende de la autenticación) ---
    useEffect(() => {
        if (!isAuthReady) {
            return; // Espera a que la autenticación se complete.
        }

        const loadDescriptions = async () => {
            setIsLoadingData(true);
            setDataError('');
            try {
                const descriptions = await getEnergyDescriptionsFromFirebase();
                if (Object.keys(descriptions.talentDescriptions).length === 0) {
                    throw new Error("Los datos de Firebase llegaron vacíos. Revisa la conexión o la base de datos.");
                }
                setEnergyDescriptions(descriptions);
            } catch (err) {
                console.error("Error en useEffect al cargar descripciones:", err);
                setDataError("No se pudieron cargar las descripciones de las energías. Comprueba tu conexión a internet y recarga la página.");
            } finally {
                setIsLoadingData(false);
            }
        };

        loadDescriptions();
    }, [isAuthReady]); // Se ejecuta cuando isAuthReady cambia a true.
    
    useEffect(() => {
        const loadPdfMake = async () => {
            try {
                if (window.pdfMake) {
                    setIsPdfMakeReady(true);
                    return;
                }
    
                const pdfMakeScript = document.createElement('script');
                pdfMakeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js';
                pdfMakeScript.async = true;
                document.body.appendChild(pdfMakeScript);
    
                await new Promise((resolve, reject) => {
                    pdfMakeScript.onload = resolve;
                    pdfMakeScript.onerror = reject;
                });
    
                const vfsFontsScript = document.createElement('script');
                vfsFontsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js';
                vfsFontsScript.async = true;
                document.body.appendChild(vfsFontsScript);
    
                await new Promise((resolve, reject) => {
                    vfsFontsScript.onload = resolve;
                    vfsFontsScript.onerror = reject;
                });
                
                if (window.pdfMake && window.pdfMake.vfs) {
                    setIsPdfMakeReady(true);
                } else {
                    throw new Error("pdfmake or vfs_fonts did not load correctly.");
                }
            } catch (err) {
                console.error("Error loading pdfmake scripts:", err);
                setError("Error al cargar la librería para PDF. Por favor, refresca la página.");
            }
        };
        loadPdfMake();
    }, []);

    const handleInputChange = (index, name, value) => {
        setPeople(prev => prev.map((p, i) => i === index ? { ...p, [name]: value } : p));
    };

    const getStarSVG = (energies) => {
    if (!energies) return '';
    const { "Misión": mision, "Esencia": esencia, "Karma I": karma1, "Karma II": karma2, "Talento I": talento1, "Talento II": talento2, "Objetivo I": objetivo1, "Objetivo II": objetivo2 } = energies;
    const font = "font-family='Helvetica'"; // Forzar una fuente estándar para PDF
    return `
        <svg width="300" height="300" viewBox="0 0 130 130" xmlns="http://www.w3.org/2000/svg">
            <polygon points="65,10 115,90 15,90" stroke="#60A5FA" fill="none" stroke-width="0.5"/>
            <polygon points="65,110 15,30 115,30" stroke="#C084FC" fill="none" stroke-width="0.5"/>
            <polygon points="65,47 50,72 80,72" stroke="#4A5568" fill="none" stroke-width="0.3"/>
            <circle cx="65" cy="65" r="18" stroke="black" fill="white" stroke-width="0.5"/>
            <text x="65" y="62" text-anchor="middle" font-size="11" font-weight="bold" ${font}>${mision}</text>
            <text x="65" y="73" text-anchor="middle" font-size="5.5" ${font}>MISIÓN</text>
            <text x="65" y="86" text-anchor="middle" font-size="6" fill="#4A5568" ${font}>${esencia}</text>
            <text x="65" y="93" text-anchor="middle" font-size="5.5" fill="#4A5568" ${font}>Esencia</text>
            <text x="65" y="10" text-anchor="middle" font-size="6" fill="#C084FC" ${font}>${objetivo2}</text>
            <text x="65" y="4" text-anchor="middle" font-size="5.5" fill="#C084FC" ${font}>Objetivo II</text>
            <text x="118" y="33" text-anchor="start" font-size="6" fill="#60A5FA" ${font}>${karma1}</text>
            <text x="122" y="40" text-anchor="end" font-size="5.5" fill="#60A5FA" ${font}>Karma I</text>
            <text x="118" y="93" text-anchor="start" font-size="6" fill="#C084FC" ${font}>${karma2}</text>
            <text x="122" y="100" text-anchor="end" font-size="5.5" fill="#C084FC" ${font}>Karma II</text>
            <text x="65" y="118" text-anchor="middle" font-size="6" fill="#60A5FA" ${font}>${talento1}</text>
            <text x="65" y="125" text-anchor="middle" font-size="5.5" fill="#60A5FA" ${font}>Talento I</text>
            <text x="12" y="93" text-anchor="end" font-size="6" fill="#C084FC" ${font}>${talento2}</text>
            <text x="8" y="100" text-anchor="start" font-size="5.5" fill="#C084FC" ${font}>Talento II</text>
            <text x="12" y="33" text-anchor="end" font-size="6" fill="#60A5FA" ${font}>${objetivo1}</text>
            <text x="8" y="40" text-anchor="start" font-size="5.5" fill="#60A5FA" ${font}>Objetivo I</text>
        </svg>
    `;
};
    
const handleCalculate = async (e) => {
    e.preventDefault();
    setIsAnalyzing(true);
    setError('');
    setAnalysisData(null);

    // Verificación de que los datos de Firebase se hayan cargado.
    if (!energyDescriptions) {
        setError("Las descripciones de energía no se han cargado. Intenta recargar la página.");
        setIsAnalyzing(false);
        return;
    }

    try {
        const newResults = people.map(p => calculationEngine.calculateEnergies(p.nombre));
        setResults(newResults);
        if (newResults.some(r => r.error)) {
            throw new Error("Por favor, introduce nombres válidos para ambas personas.");
        }

        const dataForCompat = newResults.map(r => ({ M: r["Misión"], E: r["Esencia"], T1: r["Talento I"], T2: r["Talento II"], K1: r["Karma I"], K2: r["Karma II"], O1: r["Objetivo I"], O2: r["Objetivo II"] }));

        const compatData = calcularCompatibilidad(dataForCompat[0], dataForCompat[1], { phase: people[0].phase });
        
        // --- FUNCIÓN buildPersonContext MODIFICADA ---
        // Ahora usa 'energyDescriptions' del estado en lugar de las constantes globales.
        const buildPersonContext = (personEnergies) => {
            return Object.entries(personEnergies).reduce((acc, [key, value]) => {
                if (key === 'error') return acc;

                let descriptionSource;
                let lookupKey = value;

                if (key.startsWith('Misión')) {
                    descriptionSource = energyDescriptions.missionDescriptions;
                } else if (key.startsWith('Karma')) {
                    descriptionSource = energyDescriptions.karmaDescriptions;
                } else if (key.startsWith('Talento')) {
                    descriptionSource = energyDescriptions.talentDescriptions;
                } else if (key.startsWith('Objetivo')) {
                    descriptionSource = energyDescriptions.goalDescriptions;
                } else if (key === 'Esencia') {
                    descriptionSource = energyDescriptions.missionDescriptions;
                    lookupKey = personEnergies["Misión"]; 
                }

                const descriptionData = descriptionSource ? descriptionSource[lookupKey] : null;
                acc[key] = {
                    codigo: value,
                    titulo: descriptionData?.title || 'Título Desconocido',
                    descripcion: descriptionData?.description || 'Descripción no disponible.'
                };
                return acc;
            }, {});
        };

        const contextoParaIA = {
            personaA: { nombre: people[0].nombre.split(' ')[0], energias: buildPersonContext(newResults[0]) },
            personaB: { nombre: people[1].nombre.split(' ')[0], energias: buildPersonContext(newResults[1]) },
            interacciones: {
                sinergias: compatData.matches.filter(m => m.points > 0),
                fricciones: compatData.matches.filter(m => m.points <= 0)
            }
        };

        const prompt = createSynergyPrompt(contextoParaIA, 0, people[0].phase, people[1].phase);

        const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
};
        
        // La clave de API se gestiona de forma segura en el entorno de ejecución.
        const apiKey = "AIzaSyB_XXPZO-djwdBGIWVHy7AFwLPSWJzw2_o"; 
        const apiUrl = `${APP_CONFIG.GEMINI_API_URL}?key=${apiKey}`;
        
        const response = await fetchWithBackoff(apiUrl, { // <-- CAMBIO AQUÍ
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // La gestión del error !response.ok ya está dentro de fetchWithBackoff,
        // pero podemos mantener una verificación final por si lanza un objeto Response.
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`La llamada a la IA falló: ${response.status}. Cuerpo: ${errorBody}`);
        }

        const result = await response.json();
        const analysisText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (analysisText) {
            // Find the start and end of the JSON object within the string
            const startIndex = analysisText.indexOf('{');
            const endIndex = analysisText.lastIndexOf('}');

            // Check if a valid-looking JSON object was found
            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                const jsonString = analysisText.substring(startIndex, endIndex + 1);
                try {
                    // Now, parse only the extracted JSON string
                    const parsedData = JSON.parse(jsonString);
                    setAnalysisData(parsedData);
                } catch (parseError) {
                    console.error("Error parsing the extracted JSON string:", parseError);
                    console.error("Extracted string that failed to parse:", jsonString);
                    throw new Error("The AI returned a malformed JSON. The response could not be processed.");
                }
            } else {
                console.error("Unexpected or blocked AI response (no valid JSON found):", analysisText);
                throw new Error("The AI returned an empty response or it did not contain a recognizable JSON format.");
            }
        } else {
            console.error("Unexpected or blocked AI response:", result);
            throw new Error("The AI returned an empty or blocked response. Check security filters or the prompt.");
        }
        

    } catch (err) {
        console.error("Error al generar análisis:", err);
        setError(`No se pudo generar el análisis. Causa: ${err.message}`);
    } finally {
        setIsAnalyzing(false);
    }
};


// ====================================================================================
// =================== INICIO DEL BLOQUE DE PROMPT ACTUALIZADO ========================
// ====================================================================================

const createSynergyPrompt = (contexto, recipientIndex, phaseCliente, phasePareja) => {
    const cliente = recipientIndex === 0 ? contexto.personaA : contexto.personaB;
    const pareja = recipientIndex === 0 ? contexto.personaB : contexto.personaA;

    const formatEnergies = (persona, phase) => {
    return Object.entries(persona.energias).map(([key, energy]) => {
        const cleanKey = key.replace(/ I$| II$/, '');
        const title = energy.titulo || 'Título no disponible';
        const codigo = energy.codigo || 'N/A';
        const descripcion = energy.descripcion || 'Sin descripción.';

        // Lógica para asignar el estado de cada energía según la etapa de vida
        const keyMap = {
            'Misión': '(Siempre Activa)',
            'Esencia': '(Siempre Activa)',
            'Karma I': phase === 'first' ? '(Activo)' : '(Lección Integrada)',
            'Talento I': phase === 'first' ? '(Activo)' : '(Herramienta Maestra)',
            'Objetivo I': phase === 'first' ? '(Activo)' : '(Base Establecida)',
            'Karma II': phase === 'first' ? '(Potencial Futuro)' : '(Desafío Activo)',
            'Talento II': phase === 'first' ? '(Potencial Futuro)' : '(Don Emergente)',
            'Objetivo II': phase === 'first' ? '(Potencial Futuro)' : '(Norte Actual)',
        };
        const status = keyMap[key] || '';

        // Se añade la etiqueta {status} a la descripción
        return `- **${cleanKey} (${codigo}) ${status}**: ${title}\n  *Descripción*: ${descripcion}`;
    }).join('\n\n');
};
    
    const formatInteractions = (interactions, type) => {
        if (!interactions || interactions.length === 0) return `No se han identificado ${type} clave en esta dinámica.`;
        const positionMap = { M: 'Misión', E: 'Esencia', T1: 'Talento I', T2: 'Talento II', K1: 'Karma I', K2: 'Karma II', O1: 'Objetivo I', O2: 'Objetivo II' };
        
        return interactions.map((item, index) => {
            const [labelA, rolKeyA] = item.posA.split('.');
            const [labelB, rolKeyB] = item.posB.split('.');
            const rolA = positionMap[rolKeyA];
            const rolB = positionMap[rolKeyB];
            const nameA = labelA === 'A' ? cliente.nombre : pareja.nombre;
            const nameB = labelB === 'A' ? cliente.nombre : pareja.nombre;
            const dataA = (labelA === 'A' ? contexto.personaA : contexto.personaB).energias[rolA];
            const dataB = (labelB === 'A' ? contexto.personaA : contexto.personaB).energias[rolB];
            
            return `
### Interacción de ${type} #${index + 1} (Regla: ${item.rule}):
- **Componente de ${nameA}**: Su **${rolA}** (${item.energyA}), que representa: "${dataA?.descripcion || 'N/D'}".
- **Componente de ${nameB}**: Su **${rolB}** (${item.energyB}), que representa: "${dataB?.descripcion || 'N/D'}".
`;
        }).join('');
    };

    const createPhaseInstructions = (persona, phase) => {
    if (phase === 'first') {
        return `
- **Etapa de Vida Actual**: Etapa I (< 35 años).
- **Interpretación de Etiquetas**: Presta atención a las etiquetas '(Activo)' y '(Potencial Futuro)' en su perfil energético.`;
    } else { // 'second'
        return `
- **Etapa de Vida Actual**: Etapa II (> 35 años).
- **Interpretación de Etiquetas**: Las energías de Etapa I marcadas como '(Lección Integrada)', '(Herramienta Maestra)' y '(Base Establecida)' son sus cimientos. Su enfoque de crecimiento actual está en las energías marcadas como '(Desafío Activo)', '(Don Emergente)' y '(Norte Actual)'.`;
    }
};

const instruccionCliente = `
**Perfil de ${cliente.nombre}**:
- **Energías Siempre Activas**: Su Misión y su Esencia.
${createPhaseInstructions(cliente, phaseCliente)}`;

const instruccionPareja = `
**Perfil de ${pareja.nombre}**:
- **Energías Siempre Activas**: Su Misión y su Esencia.
${createPhaseInstructions(pareja, phasePareja)}`;    
    return `
# ROL Y MISIÓN
Eres un analista experto en sinergias energéticas con un toque de poeta y alquimista. Tu misión es transformar datos abstractos en una narrativa profunda, evocadora y precisa sobre el vínculo entre ${cliente.nombre} y ${pareja.nombre}. Tu estilo es sofisticado, claro y revelador.

# REGLAS INQUEBRANTABLES (EL INCUMPLIMIENTO ANULA EL RESULTADO)
1.  **ESTILO NARRATIVO: EXPLICA Y LUEGO ANCLA**: Tu método es tejer una descripción fluida y rica sobre una energía o interacción. SOLO DESPUÉS de haber explicado su esencia, puedes anclar la idea mencionando su arquetipo y código entre comillas y paréntesis. Ejemplo: "...una capacidad innata para irradiar seguridad y sanar heridas de abandono solo con su presencia, lo que define al arquetipo de 'EL AMOR INCONDICIONAL' (13-4)".
2.  **FOCO EN EL PRESENTE**: El análisis de los desafíos y zonas de crecimiento DEBE centrarse obligatoriamente en las energías etiquetadas como '(Desafío Activo)'. Las '(Lecciones Integradas)' solo pueden mencionarse como un contexto de fondo o una tendencia latente que podría resurgir, NUNCA como el desafío principal de la etapa actual.
3. **REGLA DE LA MISIÓN-KARMA**: Si la Misión de una persona comparte el mismo código que su Karma I (ej: Misión 10-1 y Karma I 10-1), esto es de vital importancia. Significa que el desafío de su Karma I se convierte en el tema central a dominar a lo largo de *toda su vida* a través de su Misión. Al analizar a esa persona, DEBES tratar su Misión como una energía dual: es su mayor don, pero también contiene la sombra latente de su Karma I, un desafío que requiere vigilancia y conciencia constantes, incluso después de haberlo 'integrado' formalmente.
4.  **TONO Y PERSPECTIVA**: Usa siempre un tono neutro y descriptivo en tercera persona (su, ellos, ambos). Adopta un lenguaje poético y significativo, especialmente en los títulos.
5.  **PRECISIÓN DE ESTADO (ACTIVO/LATENTE)**: Debes indicar claramente si una energía de Etapa I o II es "activa" en su etapa de vida actual o un "potencial latente" a desarrollar, basándote en los datos proporcionados.
6.  **SÍNTESIS Y PATRONES**: No te limites a listar interacciones. Busca temas comunes y agrupa energías que apunten en la misma dirección para revelar patrones más profundos en la relación.
7.  **DINÁMICAS DE MEDICINA**: La interacción más crucial es un Talento que sana un Karma con el mismo código. Preséntala como "la medicina" central del vínculo, el eje sobre el cual gira gran parte de su crecimiento mutuo.
8.  **TENSIONES SUTILES**: Si detectas una fricción de tipo "antagonista" (R11_ANT_ME), descríbela no como un conflicto, sino como "diferentes modalidades" o "enfoques energéticos distintos" hacia un mismo fin, lo que puede requerir conciencia para armonizarse.
9.  **FORMATO**: Párrafos cortos y claros. El JSON final debe ser texto plano sin Markdown.
10.  **PROHIBICIÓN DE TÉRMINOS**: No utilices la palabra "nutre" en ninguna de sus formas. En su lugar, emplea sinónimos como "potencia", "fomenta", "enriquece", "fortalece" o "impulsa".

# DATOS BASE PARA EL ANÁLISIS (FUENTE ÚNICA DE VERDAD)

## 1. Contexto de Etapa de Vida:
- ${instruccionCliente}
- ${instruccionPareja}

## 2. Perfiles Energéticos de Referencia (CON DESCRIPCIONES):
### Perfil de ${cliente.nombre}
${formatEnergies(cliente, phaseCliente)}

### Perfil de ${pareja.nombre}
${formatEnergies(pareja, phasePareja)}

## 3. Interacciones Específicas Calculadas (CON DESCRIPCIONES):
### Sinergias Clave (Puntos de Apoyo y Fluidez):
${formatInteractions(contexto.interacciones.sinergias, 'Sinergia')}

### Fricciones Clave (Puntos de Tensión y Crecimiento):
${formatInteractions(contexto.interacciones.fricciones, 'Fricción')}


# ESTRUCTURA DEL JSON A GENERAR (RESPETA ESTA ESTRUCTURA Y ESTILO AL 100%)
Genera únicamente un objeto JSON válido.

{
  "arquitectura_vinculo": {
    "titulo": "Un título poético y alquímico que capture la esencia de su unión.",
    "vinculoPrincipal": {
      "titulo": "El Hilo Conductor de su Conexión: [Subtítulo Evocador]",
      "cuerpo": "Describe la dinámica central, priorizando la 'dinámica de medicina' si existe. Explica la esencia de las energías en una narrativa fluida antes de anclarlas con su arquetipo y código. Especifica su estado (activo/latente)."
    },
    "dinamicaLuz": {
      "titulo": "Puntos de Sinergia: sus Dones en Acción",
      "cuerpo": "Profundiza en las sinergias, agrupando temas comunes. Describe cómo los dones de uno nutren las aspiraciones o la esencia del otro, siguiendo el método 'explica y luego ancla'."
    },
    "dinamicaSombra": {
      "titulo": "Zonas de Crecimiento: Donde la Tensión se Vuelve Transformación",
      "cuerpo": "Describe los desafíos basados en las fricciones. Explica cómo un patrón kármico activo choca con la misión o el objetivo del otro. Incluye las tensiones sutiles como 'modalidades diferentes'."
    },
    "riesgoPrincipal": {
      "titulo": "El Principal Desafío a Cuidar",
      "cuerpo": "Identifica la fricción con mayor potencial de conflicto si no se gestiona. Sé claro, explicando la naturaleza de las energías en juego y el impacto que podría tener."
    }
  },
  "legado_cocreativo": {
    "titulo": "El Propósito Superior de su Vínculo",
    "cuerpo": "Basado en la combinación de sus Misiones, Esencias y Talentos, describe qué están destinados a crear o aportar al mundo juntos. Teje una visión unificada a partir de las descripciones de sus energías más elevadas."
  },
  "conclusion_consejos": {
    "titulo": "Conclusión y Pasos Prácticos",
    "cuerpo": "Ofrece un párrafo final de resumen que capture la belleza y el potencial de su vínculo, manteniendo el tono elevado y descriptivo.",
    "consejos": [
      "Un primer consejo práctico enfocado en activar o potenciar la 'dinámica de medicina'.",
      "Un segundo consejo para navegar conscientemente la fricción o desafío principal.",
      "Un tercer consejo sobre cómo manifestar tangiblemente su propósito cocreativo."
    ]
  }
}
`;
};

// ====================================================================================
// ==================== FIN DEL BLOQUE DE PROMPT ACTUALIZADO ==========================
// ====================================================================================


    const handleReset = () => {
        setPeople([initialPersonState, initialPersonState]);
        setResults([null, null]);
        setAnalysisData(null);
        setError('');
    };

    const generatePlainTextAnalysis = () => {
        if (!analysisData) return '';
        let text = '';
        const addSection = (title, body) => {
            if (title && body) text += `${title.toUpperCase()}\n${body}\n\n`;
        };
        const introText = "Es importante comprender que este análisis representa solo una de las variables que contribuyen al éxito de una relación. Aquí evaluamos la alineación de propósitos y objetivos de vida según lo codificado en la vibración de sus nombres y apellidos completos: una sintonía profunda que permite a dos personas caminar en la misma dirección y potenciarse mutuamente.\n\nSin embargo, una relación exitosa requiere también valores compartidos, comunicación efectiva, respeto, admiración genuina y empatía profunda. Todos estos elementos actúan en conjunto para crear un vínculo pleno y duradero.";
        text += introText + "\n\n";
        if (analysisData.arquitectura_vinculo) {
            text += `${analysisData.arquitectura_vinculo.titulo.toUpperCase()}\n\n`;
            addSection(analysisData.arquitectura_vinculo.vinculoPrincipal?.titulo, analysisData.arquitectura_vinculo.vinculoPrincipal?.cuerpo);
            addSection(analysisData.arquitectura_vinculo.dinamicaLuz?.titulo, analysisData.arquitectura_vinculo.dinamicaLuz?.cuerpo);
            addSection(analysisData.arquitectura_vinculo.dinamicaSombra?.titulo, analysisData.arquitectura_vinculo.dinamicaSombra?.cuerpo);
            addSection(analysisData.arquitectura_vinculo.riesgoPrincipal?.titulo, analysisData.arquitectura_vinculo.riesgoPrincipal?.cuerpo);
        }
        if (analysisData.legado_cocreativo) {
            addSection(analysisData.legado_cocreativo.titulo, analysisData.legado_cocreativo.cuerpo);
        }
        if (analysisData.conclusion_consejos) {
            addSection(analysisData.conclusion_consejos.titulo, analysisData.conclusion_consejos.cuerpo);
            text += 'CONSEJOS PRÁCTICOS\n';
            analysisData.conclusion_consejos.consejos?.forEach((consejo, i) => {
                text += `${i + 1}. ${consejo}\n`;
            });
            text += '\n';
        }
        return text.trim();
    };

    const handleCopy = () => {
        const textToCopy = generatePlainTextAnalysis();
        if (!textToCopy) return;
        const fallbackCopy = (text) => {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed"; textArea.style.top = "-9999px"; textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus(); textArea.select();
            try {
                document.execCommand('copy');
                setCopyButtonText('¡Copiado!');
                setTimeout(() => setCopyButtonText('Copiar Análisis'), 2000);
            } catch (err) {
                setCopyButtonText('Error al copiar');
            }
            document.body.removeChild(textArea);
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                setCopyButtonText('¡Copiado!');
                setTimeout(() => setCopyButtonText('Copiar Análisis'), 2000);
            }).catch(err => fallbackCopy(textToCopy));
        } else {
            fallbackCopy(textToCopy);
        }
    };

    const handlePrepareAudio = () => {
        let script = generatePlainTextAnalysis();
        if (script) {
            // Eliminar los arquetipos y códigos para una narración más fluida
            script = script.replace(/, el arquetipo de '[^']+' \(\d+-\d+\)/g, '');
            script = script.replace(/, definida por el arquetipo de '[^']+' \(\d+-\d+\)/g, '');
            script = script.replace(/, conocida como '[^']+' \(\d+-\d+\)/g, '');
            script = script.replace(/, su '[^']+' \(\d+-\d+\)/g, '');
            script = script.replace(/\s\('[^']+' \(\d+-\d+\)\)/g, '');
            // Limpieza general
            const cleanedScript = script.replace(/### (.*?)\n/g, '$1.\n').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
            setAudioScript(cleanedScript);
            setIsAudioModalOpen(true);
        }
    };
    
    const handleExportPDF = () => {
        if (!analysisData || !results[0] || !results[1]) {
            setError("No hay datos de análisis para exportar.");
            return;
        }
        if (!isPdfMakeReady) {
            setError("La librería para generar PDF no está lista. Por favor, espera unos segundos.");
            return;
        }
        setIsExportingPDF(true);
        try {
            const docDefinition = buildDocDefinition(analysisData, people, results);
            window.pdfMake.createPdf(docDefinition).download(`Sinergia ${people[0].nombre.split(' ')[0]} y ${people[1].nombre.split(' ')[0]}.pdf`, () => {
                setIsExportingPDF(false);
            });
        } catch (err) {
            console.error("Error al crear el PDF con pdfmake:", err);
            setError("Ocurrió un error al generar el PDF.");
            setIsExportingPDF(false);
        }
    };

    const buildDocDefinition = (data, peopleData, resultsData) => {
    const star1SVG = getStarSVG(resultsData[0]);
    const star2SVG = getStarSVG(resultsData[1]);
    const { arquitectura_vinculo, legado_cocreativo, conclusion_consejos } = data;
    const introText = "Es importante comprender que este análisis representa solo una de las variables que contribuyen al éxito de una relación. Aquí evaluamos la alineación de propósitos y objetivos de vida según lo codificado en la vibración de sus nombres y apellidos completos: una sintonía profunda que permite a dos personas caminar en la misma dirección y potenciarse mutuamente.\n\nSin embargo, una relación exitosa requiere también valores compartidos, comunicación efectiva, respeto, admiración genuina y empatía profunda. Todos estos elementos actúan en conjunto para crear un vínculo pleno y duradero.";
    return {
        pageSize: 'A4',
        pageMargins: [60, 80, 60, 80],
        content: [
            { text: 'Análisis de Sinergia Energética', style: 'coverTitle', absolutePosition: { x: 60, y: 200 } },
            { text: peopleData[0].nombre, style: 'coverName', absolutePosition: { x: 60, y: 300 } },
            { text: '&', style: 'coverAnd', absolutePosition: { x: 60, y: 340 } },
            { text: peopleData[1].nombre, style: 'coverName', absolutePosition: { x: 60, y: 380 } },
            { text: 'Visualización Energética', style: 'h1', alignment: 'center', pageBreak: 'before' },
            { columns: [ { stack: [ { svg: star1SVG, width: 250 }, { text: peopleData[0].nombre, style: 'starName' } ], alignment: 'center' }, { stack: [ { svg: star2SVG, width: 250 }, { text: peopleData[1].nombre, style: 'starName' } ], alignment: 'center' } ], columnGap: 10, margin: [0, 20, 0, 0] },
            { text: introText, style: 'introBody', pageBreak: 'before', margin: [0, 0, 0, 20] },
            { text: arquitectura_vinculo?.titulo || 'La Arquitectura de su Vínculo', style: 'h1', pageBreak: 'before' },
            { canvas: [{ type: 'line', x1: 150, y1: 5, x2: 360, y2: 5, lineWidth: 0.5, lineColor: '#AEB6BF' }], margin: [0, 0, 0, 20] },
            { text: arquitectura_vinculo?.vinculoPrincipal?.titulo, style: 'h2' },
            { text: [ { text: (arquitectura_vinculo?.vinculoPrincipal?.cuerpo || '').substring(0, 1), style: 'dropCap' }, { text: (arquitectura_vinculo?.vinculoPrincipal?.cuerpo || '').substring(1), style: 'bodyWithDropCap' } ] },
            { text: legado_cocreativo?.titulo, style: 'h1', pageBreak: 'before' },
            { canvas: [{ type: 'line', x1: 150, y1: 5, x2: 360, y2: 5, lineWidth: 0.5, lineColor: '#AEB6BF' }], margin: [0, 0, 0, 20] },
            { text: [ { text: (legado_cocreativo?.cuerpo || '').substring(0, 1), style: 'dropCap' }, { text: (legado_cocreativo?.cuerpo || '').substring(1), style: 'bodyWithDropCap' } ] },
            { text: conclusion_consejos?.titulo, style: 'h1', pageBreak: 'before' },
            { canvas: [{ type: 'line', x1: 150, y1: 5, x2: 360, y2: 5, lineWidth: 0.5, lineColor: '#AEB6BF' }], margin: [0, 0, 0, 20] },
            { text: [ { text: (conclusion_consejos?.cuerpo || '').substring(0, 1), style: 'dropCap' }, { text: (conclusion_consejos?.cuerpo || '').substring(1), style: 'bodyWithDropCap' } ] },
            { text: 'Consejos Prácticos', style: 'h2', margin: [0, 15, 0, 5] },
            { ul: (conclusion_consejos?.consejos || []).map(consejo => ({ text: consejo, style: 'body', margin: [10, 5, 0, 5] })) }
        ],
        styles: {
            coverTitle: { fontSize: 32, bold: true, color: '#333', alignment: 'center' },
            coverName: { fontSize: 24, bold: false, color: '#333', alignment: 'center' },
            coverAnd: { fontSize: 20, italics: true, color: '#555', alignment: 'center' },
            starName: { fontSize: 12, bold: true, alignment: 'center', margin: [0, 8, 0, 0] },
            h1: { fontSize: 18, bold: true, color: '#2c3e50', alignment: 'center', margin: [0, 20, 0, 5] },
            h2: { fontSize: 14, bold: true, color: '#34495e', margin: [0, 15, 0, 5] },
            introBody: { fontSize: 11, italics: true, color: '#4A5568', margin: [0, 0, 0, 10], lineHeight: 1.5, alignment: 'justify' },
            body: { fontSize: 11, margin: [0, 0, 0, 10], lineHeight: 1.5, alignment: 'justify' },
            bodyWithDropCap: { fontSize: 11, margin: [0, 0, 0, 10], lineHeight: 1.5, alignment: 'justify' },
            dropCap: { fontSize: 32, bold: true, color: '#60A5FA', lineHeight: 0.85 }
        }
    };
};
    
    return (
        <div className="bg-gray-100 min-h-screen font-sans">
             <style>{`
                 .report-container { font-family: 'Georgia', serif; color: #333; font-size: 12pt; line-height: 1.7; }
                 .report-h2 { color: #003366; font-size: 18pt; margin-top: 28pt; margin-bottom: 14pt; border-bottom: 1.5px solid #a2b4c5; padding-bottom: 7pt; font-weight: bold; }
                 .report-h3 { color: #004080; font-size: 14pt; font-weight: bold; margin-top: 22pt; margin-bottom: 8pt; }
                 .report-container p { margin-bottom: 12pt; text-align: justify; }
                 .report-container strong { font-weight: bold; color: #000; }
              `}</style>
            <div className="w-full max-w-5xl mx-auto p-4 sm:p-8">
                <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
                    <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 mb-2">Calculadora de Sinergia Energética</h1>
                    <p className="text-center text-gray-500 mb-6">Introduce los nombres y descubre la dinámica de la relación.</p>
                    
                    <form onSubmit={handleCalculate}>
                        <div className="grid md:grid-cols-2 gap-6 mb-6">
                            <PersonForm personData={people[0]} onInputChange={handleInputChange} personIndex={0} />
                            <PersonForm personData={people[1]} onInputChange={handleInputChange} personIndex={1} />
                        </div>

                        {error && <p className="text-red-600 bg-red-100 p-3 rounded-lg text-center mb-6">{error}</p>}
                        {dataError && <p className="text-red-600 bg-red-100 p-3 rounded-lg text-center mb-6">{dataError}</p>}

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                             <button type="submit" disabled={isAnalyzing || isLoadingData} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105 disabled:bg-blue-300">
                                 <IconSparkles />
                                 {isLoadingData ? 'Cargando datos...' : isAnalyzing ? 'Analizando Sinergia...' : 'Calcular y Analizar'}
                             </button>
                             <button type="button" onClick={handleReset} className="w-full flex items-center justify-center gap-2 bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-transform transform hover:scale-105">
                                 <IconTrash />
                                 Limpiar Todo
                             </button>
                        </div>
                    </form>

                    {analysisData && (
                        <div className="mt-8 pt-6 border-t border-gray-200">
                             <div className="no-print flex justify-between items-center mb-4">
                                 <h2 className="text-2xl font-bold text-gray-800">Resultado del Análisis</h2>
                                 <div className="flex flex-wrap gap-2">
                                     <button onClick={handleExportPDF} disabled={isExportingPDF || !isPdfMakeReady} className="flex items-center justify-center gap-2 bg-red-600 text-white font-semibold py-2 px-3 rounded-lg hover:bg-red-700 transition disabled:bg-gray-400">
                                         <IconPDF />
                                         {isExportingPDF ? 'Exportando...' : 'PDF'}
                                     </button>
                                     <button onClick={handlePrepareAudio} className="flex items-center gap-2 bg-teal-500 text-white font-semibold py-2 px-3 rounded-lg hover:bg-teal-600 transition">
                                         <IconSoundWave />
                                         Narrar
                                     </button>
                                     <button onClick={handleCopy} className="flex items-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2 px-3 rounded-lg hover:bg-gray-200 transition">
                                         <IconCopy />
                                         {copyButtonText}
                                     </button>
                                 </div>
                             </div>
                            
                            <div className="flex flex-col md:flex-row justify-center items-start gap-8">
                                {results[0] && <EnergyStarPreview energies={results[0]} personName={people[0].nombre} />}
                                {results[1] && <EnergyStarPreview energies={results[1]} personName={people[1].nombre} />}
                            </div>
                            <div className="report-container mt-8">
                                <h2 className="report-h2">{analysisData.arquitectura_vinculo?.titulo}</h2>
                                <h3 className="report-h3">{analysisData.arquitectura_vinculo?.vinculoPrincipal?.titulo}</h3>
                                <p>{analysisData.arquitectura_vinculo?.vinculoPrincipal?.cuerpo}</p>
                                <h3 className="report-h3">{analysisData.arquitectura_vinculo?.dinamicaLuz?.titulo}</h3>
                                <p>{analysisData.arquitectura_vinculo?.dinamicaLuz?.cuerpo}</p>
                                <h3 className="report-h3">{analysisData.arquitectura_vinculo?.dinamicaSombra?.titulo}</h3>
                                <p>{analysisData.arquitectura_vinculo?.dinamicaSombra?.cuerpo}</p>
                                <h3 className="report-h3">{analysisData.arquitectura_vinculo?.riesgoPrincipal?.titulo}</h3>
                                <p>{analysisData.arquitectura_vinculo?.riesgoPrincipal?.cuerpo}</p>

                                <h2 className="report-h2">{analysisData.legado_cocreativo?.titulo}</h2>
                                <p>{analysisData.legado_cocreativo?.cuerpo}</p>

                                <h2 className="report-h2">{analysisData.conclusion_consejos?.titulo}</h2>
                                <p>{analysisData.conclusion_consejos?.cuerpo}</p>
                                <h3 className="report-h3">Consejos Prácticos</h3>
                                {analysisData.conclusion_consejos?.consejos?.map((consejo, i) => (
                                    <p key={i}><strong>{i + 1}.</strong> {consejo}</p>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                 <footer className="no-print text-center mt-6 text-sm text-gray-500">
                     <p>Análisis de sinergia basado en el Plan de Vida.</p>
                 </footer>
            </div>
            {isAudioModalOpen && <AudioModal script={audioScript} onClose={() => setIsAudioModalOpen(false)} people={people} targetLanguage={targetLanguage} />}
        </div>
    );
}

export default App;