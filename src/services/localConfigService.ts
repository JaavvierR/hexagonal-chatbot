// src/services/localConfigService.ts
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { IConfigService, ChatData, FacebookCredentials } from '../core/interfaces.js';

// Definir __filename y __dirname para módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Archivo para guardar las credenciales de acceso
const CREDENTIALS_FILE: string = path.join(__dirname, '..', '..', "fb_credentials.json"); // Ajustar ruta

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query: string): Promise<string> {
    return new Promise(resolve => rl.question(query, resolve));
}


export class LocalConfigService implements IConfigService {

    async getChatData(): Promise<ChatData> {
        /**
         * Obtiene datos del chat desde una API local o datos predeterminados.
         */
        try {
            // Intenta obtener de una API local primero
            const response = await axios.get<ChatData>('http://localhost:5001/api/chat', { timeout: 3000 }); // Reducir timeout
            if (response.status === 200) {
                console.log("✅ Datos de chat cargados desde API local.");
                return response.data;
            }
        } catch (e: any) {
            // Ignorar errores de conexión, usar datos predeterminados
             // console.warn(`⚠️ No se pudo conectar a la API de chat local: ${e.message}. Usando datos predeterminados.`); // Silenciar si es solo conexión
        }

        // Datos predeterminados si la API no está disponible
        console.log("ℹ️ Usando datos de chat predeterminados.");
        return {
            "bienvenida": "✨ ¡Bienvenido al Asistente de Ventas! ✨\n🛍️ Estoy aquí para ayudarte a…",
            "menu": [
                "1️⃣ Consultar productos",
                "2️⃣ Ofertas especiales",
                "3️⃣ Información de envíos",
                "4️⃣ Otros (realizar pregunta personalizada)",
                "5️⃣ Salir"
            ],
            "respuestas": {
                "1": "📦 *Catálogo de Productos*\n\nNuestros productos están organizados en las siguientes categorías:\n- Electrónica\n- Ropa y accesorios\n- Hogar y jardín\n- Belleza y cuidado personal\n\n¿Sobre qué categoría te gustaría más información?",
                "2": "🏷️ *Ofertas Especiales*\n\n¡Tenemos increíbles descuentos esta semana!\n- 30% OFF en todos los productos de electrónica\n- 2x1 en ropa de temporada\n- Envío gratis en compras mayores a $50\n\nEstas ofertas son válidas hasta el final de mes.",
                "3": "🚚 *Información de Envíos*\n\nNuestras políticas de envío:\n- Envío estándar (3-5 días): $5.99\n- Envío express (1-2 días): $12.99\n- Envío gratuito en compras superiores a $50\n\nHacemos envíos a todo el país.",
                "4": "📚 *Consulta al catálogo*\n\nAhora puedes hacer preguntas sobre nuestro catálogo de productos. ¿Qué te gustaría saber?"
            }
        };
    }

    async getFacebookCredentials(): Promise<FacebookCredentials> {
        /** Solicita las credenciales al usuario y las guarda en un archivo */
        if (fs.existsSync(CREDENTIALS_FILE)) {
            console.log(`Cargando credenciales desde ${CREDENTIALS_FILE}`);
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
            return credentials;
        }

        console.log("Necesitas ingresar tus credenciales de Facebook");
        const email = await question("Email de Facebook: ");
        const password = await question("Contraseña de Facebook (no se mostrará): ");

        const credentials: FacebookCredentials = {
            "email": email,
            "password": password
        };

        try {
             fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
             console.log(`✅ Credenciales guardadas en ${CREDENTIALS_FILE}`);
        } catch (e: any) {
             console.error(`❌ Error al guardar credenciales en ${CREDENTIALS_FILE}: ${e.message}`);
        }


        return credentials;
    }

    // Método para cerrar la interfaz de lectura si es necesario al finalizar
    closeReader() {
        rl.close();
    }
}
