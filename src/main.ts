// src/main.ts
import { Builder, By, Key, until, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { Options } from 'selenium-webdriver/chrome.js';
import { execSync } from 'child_process';
import readline from 'readline';
import path from 'path';
// Importar fileURLToPath y pathToFileURL del módulo 'url'
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { setTimeout as delay } from 'timers/promises'; // Importar delay

// Importar las clases y interfaces
import { ChatbotCore } from './core/chatbot.js';
import { PostgresDbService } from './services/postgresDbService.js';
import { PdfjsPdfService } from './services/pdfService.js'; // Asegúrate que el nombre del archivo sea correcto aquí
import { GeminiAiService } from './services/geminiAiService.js';
import { LocalConfigService } from './services/localConfigService.js';
import { SeleniumUiService } from './services/seleniumUiService.js';
import { IUIService } from './core/interfaces.js'; // Importar la interfaz UI

// Importar GlobalWorkerOptions de la versión legacy (necesario para configurar el worker)
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
// Definir __filename y __dirname para módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')).toString();


// Configuración (mover a un archivo de config si crece)
const GEMINI_API_KEY: string = process.env.GEMINI_API_KEY || 'AIzaSyDRivvwFML1GTZ_S-h5Qfx4qP3EKforMoM'; // ¡Reemplaza con tu clave o usa .env!
// Ruta al catálogo PDF (puede seguir usando __dirname si está en la raíz del proyecto)
// Si catalogo_.pdf está en la raíz del proyecto, la ruta relativa desde dist/main.js es '../catalogo_.pdf'
const CATALOG_PATH: string = path.join(__dirname, '..', 'catalogo_.pdf'); // Mantener si catalogo_.pdf está en la raíz


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query: string): Promise<string> {
    return new Promise(resolve => rl.question(query, resolve));
}

function installDependencies(): void {
    /** Instala las dependencias necesarias */
    const dependencies: string[] = [
        "selenium-webdriver",
        "chromedriver",
        "axios",
        "pg",
        "pdfjs-dist",
        "natural",
        "clipboardy",
        "@types/selenium-webdriver",
        "@types/pg",
        "@types/natural",
        "@types/clipboardy",
        "@types/node"
    ];

    console.log("Instalando dependencias necesarias...");
    for (const dep of dependencies) {
        try {
            // Check if the package is importable (basic check)
            require.resolve(dep);
            // console.log(`${dep} ya está instalado`); // Silenciar si ya está instalado
        } catch (e: any) {
            console.log(`Instalando ${dep}...`);
            try {
                execSync(`npm install ${dep}`, { stdio: 'inherit' });
            } catch (installError: any) {
                console.error(`❌ Error installing ${dep}: ${installError.message}`);
                console.log(`Please try installing it manually: npm install ${dep}`);
            }
        }
    }
    console.log("Todas las dependencias están instaladas.");
}


async function facebookMessengerBot(targetChatId: string | null = null): Promise<void> {
    /**
     * Función principal del bot de Facebook Messenger
     * Configura los servicios, la lógica central y ejecuta el bucle de interacción.
     *
     * Args:
     *     targetChatId (str, optional): ID específico del chat al que se quiere responder.
     *                                   Si es null, responderá a todos los chats no leídos.
     */
    let driver: WebDriver | undefined;
    const configService = new LocalConfigService(); // Instanciar servicio de configuración

    try {
        // Obtener credenciales
        const credentials = await configService.getFacebookCredentials();

        // Configurar opciones del navegador
        const options = new Options();
        options.addArguments("--disable-notifications");
        options.addArguments("--disable-infobars");
        options.addArguments("--mute-audio");
        options.addArguments("--disable-blink-features=AutomationControlled"); // Avoid detection
        // options.addArguments("--headless"); // Descomentar para ejecutar sin abrir ventana del navegador (útil en servidores)

        console.log("Iniciando navegador Chrome...");

        // Build the driver
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        await driver.manage().window().maximize();

        // --- Autenticación en Facebook ---
        try {
            console.log("Abriendo Facebook...");
            await driver.get("https://www.facebook.com");

            // Esperar a que se cargue la página de inicio de sesión
            await driver.wait(until.elementLocated(By.id("email")), 10000);

            // Ingresar email
            console.log("Ingresando credenciales...");
            const emailField = await driver.findElement(By.id("email"));
            await emailField.clear();
            await emailField.sendKeys(credentials.email);

            // Ingresar contraseña
            const passwordField = await driver.findElement(By.id("pass"));
            await passwordField.clear();
            await passwordField.sendKeys(credentials.password);

            // Hacer clic en el botón de inicio de sesión
            const loginButton = await driver.findElement(By.name("login"));
            await loginButton.click();

            // Esperar un momento para verificar si hay verificación adicional
            console.log("Iniciando sesión... espera un momento");
            await delay(5000);

            // Verificar si estamos en la página principal
            try {
                await driver.wait(until.elementLocated(By.xpath("//a[contains(@href, '/messages/')]")), 15000);
                console.log("Inicio de sesión exitoso");
            } catch (e: any) {
                console.warn("Es posible que necesites completar verificaciones adicionales de seguridad.");
                console.warn("Por favor, completa cualquier verificación que aparezca en el navegador.");
                await question("Presiona Enter cuando hayas terminado...");
            }

            // Si hay un chat específico, navegar directamente a él
            if (targetChatId) {
                const chatUrl = `https://www.facebook.com/messages/e2ee/t/${targetChatId}`; // Usar e2ee/t para chats encriptados también
                console.log(`Navegando al chat específico: ${chatUrl}`);
                await driver.get(chatUrl);

                // Esperar a que se cargue la conversación específica
                try {
                    await driver.wait(until.elementLocated(By.xpath("//div[@role='main']")), 15000);
                    console.log(`Chat específico (ID: ${targetChatId}) abierto correctamente`);
                } catch (e: any) {
                    console.error("No se pudo cargar el chat específico. Verifica el ID del chat.");
                    return; // Exit if specific chat cannot be loaded
                }
            } else {
                // Navegar a Messenger general
                console.log("Navegando a Messenger...");
                await driver.get("https://www.facebook.com/messages/t/");

                // Esperar a que se cargue Messenger
                await driver.wait(until.elementLocated(By.xpath("//div[@role='main']")), 15000);
            }

            console.log("Bot activo. Se está ejecutando en el navegador.");
            if (targetChatId) {
                console.log(`El bot está configurado para responder solo al chat con ID: ${targetChatId}`);
            } else {
                console.log("El bot revisará las conversaciones no leídas y responderá automáticamente.");
            }
            console.log("Para detener el bot, cierra el navegador o presiona Ctrl+C en esta terminal.");

            // --- Instanciar y cablear los servicios y la lógica central ---
            // Define la configuración de conexión a PostgreSQL aquí
            const DB_CONFIG = {
                user: process.env.POSTGRES_USER,
                host: process.env.POSTGRES_HOST,
                database: process.env.PGDATABASE,
                password: process.env.POSTGRES_PASSWORD,
                port: process.env.POSTGRES_PORT,
            };
            const dbService = new PostgresDbService(DB_CONFIG);
            const pdfService = new PdfjsPdfService();
            const aiService = new GeminiAiService(GEMINI_API_KEY);
            const uiService: IUIService = new SeleniumUiService(driver); // Usar la interfaz
            const chatbotCore = new ChatbotCore(dbService, pdfService, aiService, configService, uiService, CATALOG_PATH);

            // Variable para evitar responder múltiples veces al mismo mensaje
            const processedMessageIds: Set<string> = new Set(); // To track processed messages by ID

            // Function to process the latest message in the current chat
            async function processLatestMessage(driver: WebDriver): Promise<boolean> {
                try {
                    // Get the last messages using a more robust selector
                    // Look for elements that represent individual messages or message groups
                    // Common patterns: div with role="row", div containing message bubbles
                    const messageElements = await driver.findElements(By.xpath(
                        "//div[@role='main']//div[@role='row'] | //div[@role='main']//div[contains(@class, 'x1iorvi4') and contains(@class, 'x1pi30zi')]" // Intenta con role='row' o clases comunes de burbujas de mensaje
                    ));


                    if (messageElements.length > 0) {
                        // Get the last message element
                        const lastMessageElement = messageElements[messageElements.length - 1];

                        // Intenta obtener el texto del mensaje. A veces el texto está en un sub-elemento.
                        let messageText = "";
                        try {
                            // Busca un elemento de texto dentro del último elemento de mensaje
                            const textElement = await lastMessageElement.findElement(By.xpath(".//span[@dir='auto'] | .//div[@data-lexical-text='true'] | .//div[contains(@class, 'x1lli2ws')]")); // Busca span con dir='auto' o div con data-lexical-text o clases comunes de texto
                             messageText = await textElement.getText();
                        } catch (e) {
                            // Si no se encuentra un elemento de texto específico, intenta obtener el texto del elemento principal
                            messageText = await lastMessageElement.getText();
                        }

                        messageText = messageText.trim();


                        // Generate a unique ID for the message based on its content and position (simple approach)
                        // A more robust approach would involve finding a stable data attribute if available
                        const messageId = `${messageText.substring(0, Math.min(messageText.length, 50))}_${messageElements.length}`; // ID simple basado en texto y orden


                        // If this message was already processed, ignore it
                        if (processedMessageIds.has(messageId)) {
                            // console.log(`Message ID ${messageId} already processed. Ignoring.`); // Silenciar mensajes procesados
                            return false;
                        }

                        // Add the current message ID to the processed set
                        processedMessageIds.add(messageId);

                        // Keep the set size reasonable
                        if (processedMessageIds.size > 100) {
                            // Elimina el ID más antiguo si el conjunto es demasiado grande
                            const oldest = processedMessageIds.values().next().value;
                            if (typeof oldest === "string") {
                                processedMessageIds.delete(oldest);
                            }
                        }


                        // Ignore empty messages or messages that seem to be just loading interfaces
                        if (!messageText || messageText.toLowerCase() === "cargando...") {
                            // console.log("Message ignored: empty or system message"); // Silenciar mensajes ignorados
                            return false;
                        }

                        // Check if the message seems to be a previous bot response
                        const botIdentifiers: string[] = [
                            "✨ ¡bienvenido", "opción no válida", "información del producto",
                            "📦 *catálogo", "🏷️ *ofertas", "🚚 *información", "🔍 *modo consulta",
                            "✅ has salido del modo consulta", "🔍 consultando base de datos",
                            "🖼️ mostrando productos encontrados", "_para salir de este modo escribe *salir* o *menu*_" // Añadido identificador del pie de página
                        ];

                        for (const identifier of botIdentifiers) {
                            if (messageText.toLowerCase().includes(identifier)) {
                                // console.log("This message seems to be a previous bot response. Skipping."); // Silenciar respuestas del bot
                                return false;
                            }
                        }

                        console.log(`Message detected: ${messageText}`);

                        // Generate a unique user ID based on the current conversation URL
                        const currentUrl = await driver.getCurrentUrl();
                        // Extraer el ID del chat de la URL
                        const match = currentUrl.match(/\/t\/(\d+)/);
                        const userId = match ? `user_${match[1]}` : `user_${Math.abs(hashString(currentUrl)) % 10000}`; // Fallback hash if ID not found

                        // Call the core logic to handle the message
                        await chatbotCore.handleIncomingMessage(userId, messageText);

                        return true; // Indicate that a message was processed
                    } else {
                        // console.log("No messages found in the conversation"); // Silenciar si no hay mensajes
                        return false; // Indicate no message was processed
                    }
                } catch (e: any) {
                    console.error(`Error processing messages: ${e.message}`);
                    // No retornar false aquí, para que el bucle principal no se detenga por un error de selector temporal
                    // Simplemente logueamos el error y continuamos
                    return false;
                }
            }

            // Simple string hash function (mantener esta función)
            function hashString(str: string): number {
                let hash = 0;
                if (str.length === 0) {
                    return hash;
                }
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash; // Convert to 32bit integer
                }
                return hash;
            }


            // Main loop
            while (true) {
                try {
                    if (targetChatId) {
                        // Specific chat mode: only respond to the open chat
                        await processLatestMessage(driver);
                        // console.log("No new messages to respond to in this chat"); // Keep this silent unless there's an error
                    } else {
                        // General mode: look for unread conversations
                        // Look for elements with aria-label containing "unread" or "no leído"
                        const unreadConversations = await driver.findElements(By.xpath(
                            "//div[contains(@aria-label, 'unread') or contains(@aria-label, 'no leído') or contains(@aria-label, 'New message')]"
                        ));

                        if (unreadConversations.length > 0) {
                            console.log(`Found ${unreadConversations.length} unread conversations`);

                            for (const conversation of unreadConversations) {
                                try {
                                    // Click on the conversation
                                    await conversation.click();
                                    await delay(10000); // Wait for the conversation to load

                                    // Process the message
                                    await processLatestMessage(driver);
                                    await delay(10000); // Wait a bit before checking the next conversation

                                    // Go back to the main Messenger page to check for the next unread
                                    await driver.get("https://www.facebook.com/messages/t/");
                                    await delay(10000); // Wait for it to load

                                } catch (e: any) {
                                    console.error(`Error processing conversation: ${e.message}`);
                                }
                            }
                        } else {
                            // console.log("No unread conversations at the moment"); // Keep this silent
                        }
                    }

                    // Wait before checking again
                    // console.log("Waiting 5 seconds before checking again..."); // Keep this silent
                    await delay(10000); // Reducido el delay para una respuesta más rápida

                    // If in specific chat mode, refresh the page to get new messages
                    if (targetChatId) {
                        // Refreshing might lose state or cause issues, better to just check for new messages
                        // await driver.navigate().refresh();
                        // await delay(3000); // Wait for it to load after refreshing
                         // Instead of refreshing, just continue the loop which calls processLatestMessage
                    } else {
                         // In general mode, ensure we are on the main Messenger page
                         const currentUrl = await driver.getCurrentUrl();
                         if (!currentUrl.includes("facebook.com/messages/t/")) {
                             await driver.get("https://www.facebook.com/messages/t/");
                             await delay(10000); // Wait for it to load
                         }
                    }


                } catch (e: any) {
                    console.error(`Error in main loop: ${e.message}`);
                    await delay(10000); // Wait a bit before retying
                }
            }

        } catch (e: any) {
            console.error(`Error during Facebook interaction: ${e.message}`);

        } finally {
            console.log("Session finished. The browser will remain open.");
            console.log("You can close it manually when you want.");
            await question("Press Enter to close the browser...");
            if (driver) {
                await driver.quit();
            }
            configService.closeReader(); // Cerrar la interfaz de lectura
            rl.close(); // Asegurarse de cerrar también la interfaz local si no se cerró antes
        }

    } catch (e: any) {
        console.error(`Unexpected error during setup or execution: ${e.message}`);
        configService.closeReader(); // Asegurarse de cerrar la interfaz de lectura
        rl.close(); // Asegurarse de cerrar también la interfaz local
    }
}

// Main execution block
(async () => {
    // Install necessary dependencies
    installDependencies();

    // Ask the user if they want to respond to a specific chat
    console.log("\nOpciones para ejecutar el bot:");
    console.log("1. Responder a todas las conversaciones no leídas");
    console.log("2. Responder a una conversación específica (necesitas el ID)");
    const option = await question("Selecciona una opción (1/2): ");

    if (option === "2") {
        const chatId = await question("Introduce el ID del chat (ej. 29355186307462875): ");
        if (chatId.trim()) {
            console.log(`Ejecutando bot para el chat específico con ID: ${chatId.trim()}`);
            await facebookMessengerBot(chatId.trim());
        } else {
            console.log("No se proporcionó un ID válido. Ejecutando en modo general...");
            await facebookMessengerBot();
        }
    } else {
        // Run the bot in general mode
        await facebookMessengerBot();
    }
})();
