// Importar pkg y Client aquí
import pkg from 'pg';
const { Client } = pkg;
export class PostgresDbService {
    constructor(dbConfig) {
        this.dbConfig = dbConfig;
    }
    async searchProducts(query) {
        let client;
        try {
            client = new Client(this.dbConfig);
            await client.connect();
            console.log('✅ Conectado a PostgreSQL para consulta');
            const queryLower = query.toLowerCase();
            // --- Lógica de análisis de consulta y extracción de términos/rango ---
            const categorias = ['laptop', 'computadora', 'pc', 'celular', 'smartphone', 'tablet', 'monitor',
                'impresora', 'scanner', 'teclado', 'mouse', 'audífono', 'auricular', 'cámara',
                'disco', 'memoria', 'usb', 'router', 'televisor', 'tv'];
            const precioRegex = /(\d+)(?:\s*(?:a|y|hasta|entre|soles?|s\/\.?|dolares?|\$)\s*(\d+)?)?/;
            let minPrecio = null;
            let maxPrecio = null;
            const matchPrecio = queryLower.match(precioRegex);
            if (matchPrecio) {
                const precio1 = parseInt(matchPrecio[1], 10);
                const precio2 = matchPrecio[2] ? parseInt(matchPrecio[2], 10) : null;
                if (!isNaN(precio1) && precio2 !== null && !isNaN(precio2)) {
                    minPrecio = Math.min(precio1, precio2);
                    maxPrecio = Math.max(precio1, precio2);
                }
                else if (!isNaN(precio1)) {
                    let preContext = "";
                    if (typeof matchPrecio.index === "number") {
                        preContext = queryLower.substring(Math.max(0, matchPrecio.index - 15), matchPrecio.index);
                    }
                    if (preContext.includes("menos") || preContext.includes("bajo") || preContext.includes("económico") || preContext.includes("barato") || queryLower.includes("menos de") || queryLower.includes("máximo")) {
                        maxPrecio = precio1;
                    }
                    else if (preContext.includes("más") || preContext.includes("encima") || preContext.includes("mayor") || queryLower.includes("más de") || queryLower.includes("mínimo")) {
                        minPrecio = precio1;
                    }
                    else {
                        // Rango flexible por defecto si solo se menciona un precio
                        minPrecio = Math.max(0, precio1 - Math.round(precio1 * 0.05));
                        maxPrecio = precio1 + Math.round(precio1 * 0.05);
                    }
                }
            }
            const palabrasComunes = ['que', 'cual', 'cuales', 'cuanto', 'como', 'donde', 'quien', 'cuando',
                'hay', 'tiene', 'tengan', 'con', 'sin', 'por', 'para', 'entre', 'los', 'las',
                'uno', 'una', 'unos', 'unas', 'del', 'desde', 'hasta', 'hacia', 'durante',
                'mediante', 'según', 'sin', 'sobre', 'tras', 'versus', 'se', 'encuentre', 'entre', 'y',
                // Añadir números comunes o palabras relacionadas con números si es necesario filtrar más
                'mil', 'cien', 'ciento', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'
            ];
            // Filtrar palabras clave, excluyendo números que ya se manejan en el rango de precios
            const palabrasClave = queryLower.split(/\s+/)
                .map(word => word.replace(/[^\wáéíóúñ]/g, '').trim())
                .filter(word => word.length > 2 && !palabrasComunes.includes(word) && isNaN(parseInt(word, 10))); // Excluir números
            const categoriasMencionadas = categorias.filter(cat => queryLower.includes(cat) || palabrasClave.some(palabra => palabra.includes(cat)));
            console.log('📊 Análisis de la consulta (DB Service):');
            console.log('- Palabras clave (filtradas):', palabrasClave);
            console.log('- Rango de precios:', minPrecio, '-', maxPrecio);
            console.log('- Categorías detectadas:', categoriasMencionadas);
            // Si no hay términos de búsqueda válidos, retornar vacío
            if (palabrasClave.length === 0 && categoriasMencionadas.length === 0 && minPrecio === null && maxPrecio === null) {
                console.log('⚠️ No se encontraron términos válidos para buscar en DB');
                return [];
            }
            // --- Estrategia de búsqueda por etapas ---
            // ETAPA 1: Búsqueda estricta (Texto/Categoría AND Rango de Precio Exacto)
            if ((palabrasClave.length > 0 || categoriasMencionadas.length > 0) && (minPrecio !== null || maxPrecio !== null)) {
                console.log('🔄 Intentando búsqueda estricta (Texto/Categoría AND Rango de Precio Exacto)...');
                const result = await this.executeSearchQuery(client, palabrasClave, categoriasMencionadas, minPrecio, maxPrecio, 'AND');
                if (result.length > 0) {
                    console.log(`✅ Encontrados ${result.length} productos en la búsqueda estricta`);
                    return result;
                }
                console.log('⚠️ Búsqueda estricta no encontró productos.');
            }
            // ETAPA 2: Búsqueda flexible de precio (Texto/Categoría AND Rango de Precio Flexible)
            if ((palabrasClave.length > 0 || categoriasMencionadas.length > 0) && (minPrecio !== null || maxPrecio !== null)) {
                console.log('🔄 Intentando búsqueda flexible de precio (Texto/Categoría AND Rango de Precio Flexible ±10%)...');
                const flexibleMin = minPrecio !== null ? Math.max(0, minPrecio - Math.round(minPrecio * 0.1)) : null;
                const flexibleMax = maxPrecio !== null ? maxPrecio + Math.round(maxPrecio * 0.1) : null;
                const result = await this.executeSearchQuery(client, palabrasClave, categoriasMencionadas, flexibleMin, flexibleMax, 'AND');
                if (result.length > 0) {
                    console.log(`✅ Encontrados ${result.length} productos en la búsqueda flexible de precio`);
                    return result;
                }
                console.log('⚠️ Búsqueda flexible de precio no encontró productos.');
            }
            // ETAPA 3: Búsqueda solo por Texto/Categoría (si hay términos de texto)
            if (palabrasClave.length > 0 || categoriasMencionadas.length > 0) {
                console.log('🔄 Intentando búsqueda solo por Texto/Categoría...');
                const result = await this.executeSearchQuery(client, palabrasClave, categoriasMencionadas, null, null, 'OR'); // Usar OR para texto/categoría
                if (result.length > 0) {
                    console.log(`✅ Encontrados ${result.length} productos en la búsqueda solo por texto/categoría`);
                    return result;
                }
                console.log('⚠️ Búsqueda solo por texto/categoría no encontró productos.');
            }
            // ETAPA 4: Búsqueda solo por Rango de Precio (si se especificó un rango)
            if (minPrecio !== null || maxPrecio !== null) {
                console.log('🔄 Intentando búsqueda solo por Rango de Precio (Exacto)...');
                const result = await this.executeSearchQuery(client, [], [], minPrecio, maxPrecio, 'AND'); // Solo condiciones de precio
                if (result.length > 0) {
                    console.log(`✅ Encontrados ${result.length} productos en la búsqueda solo por rango de precio exacto`);
                    return result;
                }
                console.log('⚠️ Búsqueda solo por rango de precio exacto no encontró productos.');
                console.log('🔄 Intentando búsqueda solo por Rango de Precio (Flexible ±15%)...');
                const veryFlexibleMin = minPrecio !== null ? Math.max(0, minPrecio - Math.round(minPrecio * 0.15)) : null;
                const veryFlexibleMax = maxPrecio !== null ? maxPrecio + Math.round(maxPrecio * 0.15) : null;
                const resultFlexible = await this.executeSearchQuery(client, [], [], veryFlexibleMin, veryFlexibleMax, 'AND'); // Solo condiciones de precio flexible
                if (resultFlexible.length > 0) {
                    console.log(`✅ Encontrados ${resultFlexible.length} productos en la búsqueda solo por rango de precio flexible`);
                    return resultFlexible;
                }
                console.log('⚠️ Búsqueda solo por rango de precio flexible no encontró productos.');
            }
            console.log('❌ No se encontraron productos con ninguna estrategia de búsqueda.');
            return []; // Devolver array vacío si no se encuentra nada
        }
        catch (dbError) {
            console.error('❌ Error en la consulta a la base de datos:', dbError);
            // En un sistema real, podrías lanzar una excepción o devolver un resultado de error más detallado
            return []; // Devolver array vacío en caso de error para simplificar
        }
        finally {
            if (client) {
                await client.end();
                console.log('✅ Conexión a PostgreSQL cerrada');
            }
        }
    }
    // Método auxiliar para construir y ejecutar la consulta SQL
    async executeSearchQuery(client, palabrasClave, categoriasMencionadas, minPrecio, maxPrecio, textPriceJoinOperator // Cómo unir las condiciones de texto/categoría con las de precio
    ) {
        let conditions = [];
        let params = [];
        let paramIndex = 1;
        // Construir condiciones para palabras clave y categorías (unidas con OR)
        const keywordOrCategoryConditions = [];
        if (palabrasClave.length > 0) {
            for (const palabra of palabrasClave) {
                if (palabra.length > 2) {
                    const likeExpr = `%${palabra}%`;
                    keywordOrCategoryConditions.push(`(
                        LOWER(nombre) LIKE $${paramIndex} OR
                        LOWER(descripcion) LIKE $${paramIndex + 1} OR
                        LOWER(codigo) LIKE $${paramIndex + 2} OR
                        LOWER(categoria) LIKE $${paramIndex + 3}
                    )`);
                    params.push(likeExpr, likeExpr, likeExpr, likeExpr);
                    paramIndex += 4;
                }
            }
        }
        if (categoriasMencionadas.length > 0) {
            for (const categoria of categoriasMencionadas) {
                keywordOrCategoryConditions.push(`LOWER(categoria) LIKE $${paramIndex}`);
                params.push(`%${categoria}%`);
                paramIndex++;
            }
        }
        if (keywordOrCategoryConditions.length > 0) {
            conditions.push(`(${keywordOrCategoryConditions.join(' OR ')})`);
        }
        // Construir condiciones para rango de precios (unidas con AND)
        const priceConditions = [];
        if (minPrecio !== null) {
            priceConditions.push(`precio >= $${paramIndex}`);
            params.push(minPrecio);
            paramIndex++;
        }
        if (maxPrecio !== null) {
            priceConditions.push(`precio <= $${paramIndex}`);
            params.push(maxPrecio);
            paramIndex++;
        }
        if (priceConditions.length > 0) {
            conditions.push(`(${priceConditions.join(' AND ')})`);
        }
        let sqlQuery = 'SELECT codigo, nombre, descripcion, precio, stock, categoria, imagen_url FROM productos';
        if (conditions.length > 0) {
            // Unir las condiciones principales (texto/categoría) con las de precio usando el operador especificado
            sqlQuery += ' WHERE ' + conditions.join(` ${textPriceJoinOperator} `);
        }
        sqlQuery += ' ORDER BY precio ASC'; // Ordenar por precio por defecto
        console.log('🔍 Ejecutando consulta SQL (Auxiliar):');
        console.log('Query:', sqlQuery);
        console.log('Params:', params);
        const result = await client.query(sqlQuery, params);
        return result.rows.map(row => ({
            codigo: row.codigo,
            nombre: row.nombre,
            descripcion: row.descripcion,
            precio: row.precio,
            stock: row.stock,
            categoria: row.categoria,
            imagen_url: row.imagen_url
        }));
    }
}
