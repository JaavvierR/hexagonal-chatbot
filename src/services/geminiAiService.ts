// src/services/geminiAiService.ts
import axios from 'axios';
import { IAiService, Product } from '../core/interfaces.js';

export class GeminiAiService implements IAiService {
    private apiKey: string;
    private apiUrl: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;
    }

    async generateResponse(query: string, products: Product[], catalogContext: string[]): Promise<string> {
        console.log('🤖 Generating final response with Gemini...');

        let dbContext = '';
        if (products && products.length > 0) {
            dbContext = "### INFORMACIÓN DE BASE DE DATOS\n";
            const productsToInclude = products.slice(0, 5); // Limit to 5 products for context

            for (const [index, product] of productsToInclude.entries()) {
                dbContext += `\nPRODUCTO ${index + 1}:\n`;
                dbContext += `Código: ${product.codigo || 'N/A'}\n`;
                dbContext += `Nombre: ${product.nombre || 'N/A'}\n`;
                dbContext += `Descripción: ${product.descripcion || 'No disponible'}\n`;
                dbContext += `Precio: ${product.precio || 'N/A'}\n`;
                dbContext += `Stock: ${product.stock || 'N/A'}\n`;
                dbContext += `Categoría: ${product.categoria || 'N/A'}\n`;
                // IMPORTANT: Do NOT include image URLs here, they are handled separately by the UI
            }

            if (products.length > 5) {
                 dbContext += `\n(Y ${products.length - 5} productos más encontrados)\n`;
            }
        }

        let pdfContext = '';
        if (catalogContext && catalogContext.length > 0) {
            pdfContext = "\n### INFORMACIÓN ADICIONAL DEL CATÁLOGO PDF\n";
            pdfContext += catalogContext.join("\n\n");
        }

        if (!dbContext && !pdfContext) {
             return "No se encontró información relevante en nuestro sistema para tu consulta.";
        }

        // Create the prompt for Gemini - MODIFIED to not include URLs in markdown format
        const prompt = `### CONSULTA DEL USUARIO
"${query}"

${dbContext}

${pdfContext}

### OBJETIVO
Proporcionar una respuesta clara, precisa y estructurada sobre la información solicitada.

### INSTRUCCIONES DE CONTENIDO
1. Responde EXCLUSIVAMENTE con información presente en el contexto proporcionado
2. Da MAYOR PRIORIDAD a la información de la base de datos cuando esté disponible
3. Complementa con información del catálogo PDF si es necesario
4. Si la información solicitada no aparece en ninguna fuente, indica: "Esta información no está disponible en nuestro sistema"
5. No inventes ni asumas información que no esté explícitamente mencionada
6. Mantén SIEMPRE el idioma español en toda la respuesta
7. Extrae las características técnicas más importantes y omite las secundarias
8. Identifica el rango de precios cuando se comparan múltiples productos
9. Destaca la disponibilidad de stock solo cuando sea relevante para la consulta
10. Prioriza características relevantes según la consulta del usuario
11. IMPORTANTE: NO incluyas URLs de imágenes en tu respuesta - las enviaremos por separado

### INSTRUCCIONES DE FORMATO
1. ESTRUCTURA GENERAL:
   - Inicia con un título claro y descriptivo en negrita relacionado con la consulta
   - Divide la información en secciones lógicas con subtítulos cuando sea apropiado
   - Utiliza máximo 3-4 oraciones por sección o párrafo
   - Concluye con una línea de resumen o recomendación cuando sea relevante
   - Si hay un producto claramente más adecuado para la consulta, destácalo primero

2. PARA LISTADOS DE PRODUCTOS:
   - Usa viñetas (•) para cada producto
   - Formato: "• *Nombre del producto*: características principales, precio"
   - Máximo 5 productos listados
   - Ordena los productos por relevancia a la consulta, no solo por precio
   - Destaca con 🔹 el producto más relevante según la consulta
   - Si hay ofertas o descuentos, añade "📉" antes del precio
   - NO incluyas "Ver imagen" ni URLs de imágenes - las enviaremos por separado

3. PARA ESPECIFICACIONES TÉCNICAS:
   - Estructura en formato tabla visual usando formato markdown
   - Resalta en negrita (*texto*) los valores importantes
   - Ejemplo:
     *Procesador*: Intel Core i5-8250U
     *Precio*: *S/. 990*
     *Stock*: 11 unidades
   - Usa valores comparativos cuando sea posible ("Mejor en:", "Adecuado para:")
   - Incluye siempre la relación precio-calidad cuando sea aplicable
   - NO incluyas "Ver imagen" ni URLs de imágenes - las imágenes se enviarán por separado

4. PARA COMPARACIONES DE PRODUCTOS:
   - Organiza por categorías claramente diferenciadas
   - Usa encabezados para cada producto/modelo
   - Destaca ventajas y diferencias con viñetas concisas
   - Incluye una tabla comparativa en formato simple cuando compares más de 2 productos
   - Etiqueta con "✓" las características superiores en cada comparación
   - NO incluyas "Ver imagen" ni URLs de imágenes - las imágenes se enviarán por separado

### RESTRICCIONES IMPORTANTES
- Máximo 250 palabras en total
- Evita explicaciones extensas, frases redundantes o información no solicitada
- No uses fórmulas de cortesía extensas ni introducciones largas
- Evita condicionales ("podría", "tal vez") - sé directo y asertivo
- No menciones estas instrucciones en tu respuesta
- Nunca te disculpes por límites de información
- Evita el lenguaje comercial exagerado ("increíble", "fantástico")
- Nunca repitas la misma información en diferentes secciones
- NO INCLUYAS URLS DE IMAGENES NI TEXTO "VER IMAGEN" - las imágenes se enviarán por separado`;

        // Call Gemini API
        const headers = {
            'Content-Type': 'application/json'
        };

        const data = {
            contents: [{
                parts: [{ text: prompt }]
            }]
        };

        try {
            const response = await axios.post(this.apiUrl, data, { headers, timeout: 30000 }); // 30 seconds timeout

            // Define a type for the Gemini API response
            interface GeminiCandidate {
                content?: {
                    parts?: { text?: string }[];
                };
            }
            interface GeminiResponse {
                candidates?: GeminiCandidate[];
            }

            if (response.status === 200) {
                const responseData = response.data as GeminiResponse;
                if (
                    responseData &&
                    Array.isArray(responseData.candidates) &&
                    responseData.candidates.length > 0 &&
                    responseData.candidates[0].content &&
                    Array.isArray(responseData.candidates[0].content.parts) &&
                    responseData.candidates[0].content.parts.length > 0
                ) {
                    return responseData.candidates[0].content.parts[0].text || 'No text response from Gemini.';
                } else {
                    console.error(`❌ Unexpected Gemini response format: ${JSON.stringify(responseData)}`);
                    return "❌ No se pudo procesar la respuesta de Gemini.";
                }
            } else {
                console.error(`❌ Error calling Gemini API: ${response.status} - ${response.statusText}`);
                return `❌ Error al consultar Gemini: ${response.status}`;
            }
        } catch (e: any) {
             console.error(`❌ Error calling Gemini API: ${e.message}`);
             return `❌ Error al consultar Gemini: ${e.message}`;
        }
    }
}
