// src/services/pdfjsPdfService.ts
import fs from 'fs';
import path from 'path';
// Importar getDocument y GlobalWorkerOptions, pero NO configurar GlobalWorkerOptions.workerSrc aquí
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import natural from 'natural';
const { WordTokenizer } = natural;
// Definir __filename y __dirname para módulos ES
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// !!! ESTA LÍNEA DEBE ESTAR COMENTADA O ELIMINADA AQUÍ !!!
// GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(__dirname, '..', '..', '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')).toString();
export class PdfjsPdfService {
    async extractText(pdfPath) {
        /** Extrae el texto de un archivo PDF usando pdfjs-dist */
        try {
            if (!fs.existsSync(pdfPath)) {
                console.error(`❌ Archivo PDF no encontrado: ${pdfPath}`);
                return null;
            }
            const dataBuffer = fs.readFileSync(pdfPath);
            // Asegúrate de que GlobalWorkerOptions.workerSrc ya fue configurado en el punto de entrada (main.ts)
            const pdf = await getDocument({ data: new Uint8Array(dataBuffer) }).promise;
            let fullText = '';
            for (let i = 0; i < pdf.numPages; i++) {
                const page = await pdf.getPage(i + 1);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' '); // Cast item to any to access str
                fullText += pageText + '\n';
            }
            return fullText;
        }
        catch (e) {
            console.error(`❌ Error al extraer texto del PDF con pdfjs-dist: ${e}`);
            return null;
        }
    }
    findRelevantSections(text, query, maxChunks = 5) {
        /** Encuentra los fragmentos más relevantes para la consulta usando TF-IDF simplificado. */
        if (!text) {
            return [];
        }
        // --- Lógica de splitTextIntoChunks y findRelevantChunks (mover desde main.ts) ---
        // Asegúrate de que esta lógica solo use los parámetros de entrada (text, query)
        // y devuelva un array de strings.
        const chunkSize = 250;
        const chunkOverlap = 80;
        const chunks = [];
        const sentences = text.split('\n').filter(s => s.trim());
        let currentChunk = "";
        for (const sentence of sentences) {
            if (currentChunk.length + sentence.length > chunkSize) {
                if (currentChunk) {
                    chunks.push(currentChunk);
                }
                if (currentChunk && chunkOverlap > 0) {
                    const words = currentChunk.split(/\s+/);
                    const overlapWords = words.slice(-Math.floor(chunkOverlap / 5));
                    currentChunk = overlapWords.join(' ') + ' ' + sentence;
                }
                else {
                    currentChunk = sentence;
                }
            }
            else {
                currentChunk = currentChunk ? currentChunk + "\n" + sentence : sentence;
            }
        }
        if (currentChunk) {
            chunks.push(currentChunk);
        }
        // Lógica de findRelevantChunks
        const lowerQuery = query.toLowerCase();
        const tokenizer = new WordTokenizer();
        const stopWords = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'a', 'ante', 'bajo', 'con', 'de', 'desde', 'en', 'entre', 'hacia', 'hasta', 'para', 'por', 'según', 'sin', 'sobre', 'tras']);
        const queryTerms = tokenizer.tokenize(lowerQuery)
            .map((term) => term.replace(/[^\wáéíóúñ]/g, '').trim())
            .filter((term) => term.length > 2 && !stopWords.has(term));
        const priceNumbers = (lowerQuery.match(/\d+/g) || []).map(Number);
        const scoredChunks = [];
        for (const chunk of chunks) {
            const lowerChunk = chunk.toLowerCase();
            let score = 0;
            for (const term of queryTerms) {
                const matches = (lowerChunk.split(term).length - 1);
                if (matches > 0) {
                    score += matches * (term.length / 3);
                }
            }
            if (priceNumbers.length > 0) {
                const chunkNumbers = (lowerChunk.match(/\d+/g) || []).map(Number);
                for (const chunkNum of chunkNumbers) {
                    for (const priceNum of priceNumbers) {
                        // Check if chunk number is within a flexible range of the price number
                        if (Math.abs(chunkNum - priceNum) <= priceNum * 0.1) {
                            score += 2; // Boost score for price proximity
                        }
                    }
                }
            }
            // Boost score if multiple query terms are found in the chunk
            const termMatches = queryTerms.filter(term => lowerChunk.includes(term)).length;
            if (termMatches > 1) {
                score *= (1 + (termMatches / queryTerms.length));
            }
            scoredChunks.push({ chunk, score });
        }
        // Sort chunks by score in descending order
        scoredChunks.sort((a, b) => b.score - a.score);
        // Select the top N chunks
        const relevantChunks = scoredChunks.slice(0, maxChunks).map(item => item.chunk);
        console.log(`🔍 Puntuaciones más altas (PDF Service): ${scoredChunks.slice(0, Math.min(3, scoredChunks.length)).map(c => c.score.toFixed(2))}`);
        return relevantChunks;
    }
}
