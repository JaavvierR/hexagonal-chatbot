// src/core/chatbot.ts
import { IDatabaseService, IPdfService, IAiService, IConfigService, IUIService, ProcessedQueryResponse, Product } from './interfaces.js';

// Comandos (pueden ir aquí o en config)
const START_COMMANDS: string[] = ['!start', 'hola', 'consulta', 'inicio', 'comenzar', 'ayuda', 'start', 'hi', 'hello'];
const EXIT_COMMANDS: string[] = ['salir', 'exit', 'menu', 'volver', 'regresar', 'terminar', 'finalizar', '!menu', '!start'];

// Estado por usuario (simplificado, en un sistema real usarías una base de datos o caché)
const waitingForQuery: { [userId: string]: boolean } = {};

export class ChatbotCore {
    private dbService: IDatabaseService;
    private pdfService: IPdfService;
    private aiService: IAiService;
    private configService: IConfigService;
    private uiService: IUIService; // La lógica central puede llamar a la UI para enviar mensajes
    private catalogPath: string; // Simplificación: pasar la ruta aquí

    constructor(
        dbService: IDatabaseService,
        pdfService: IPdfService,
        aiService: IAiService,
        configService: IConfigService,
        uiService: IUIService, // Recibe la implementación de la UI
        catalogPath: string
    ) {
        this.dbService = dbService;
        this.pdfService = pdfService;
        this.aiService = aiService;
        this.configService = configService;
        this.uiService = uiService;
        this.catalogPath = catalogPath;
    }

    async handleIncomingMessage(userId: string, message: string): Promise<void> {
        const lowerMessage = message.toLowerCase().trim();
        const chatData = await this.configService.getChatData();

        // Check for start commands
        if (START_COMMANDS.some(cmd => lowerMessage.includes(cmd))) {
             if (waitingForQuery[userId]) {
                waitingForQuery[userId] = false;
            }
            const menuMessage = await this.getMenuMessage();
            await this.uiService.sendMessage(menuMessage);
            return;
        }

        // If waiting for a query from this user
        if (waitingForQuery[userId]) {
            console.log(`💬 Recibida consulta de ${userId}: ${message}`);

            // If the user wants to exit query mode
            if (EXIT_COMMANDS.includes(lowerMessage)) {
                waitingForQuery[userId] = false;
                await this.uiService.sendMessage("✅ Has salido del modo consulta. Volviendo al menú principal...");
                const menuMessage = await this.getMenuMessage();
                await this.uiService.sendMessage(menuMessage);
                return;
            }

            // Process the query
            await this.uiService.sendMessage("🔍 Consultando base de datos y catálogo con Gemini AI. Esto puede tomar un momento...");
            const response = await this.processProductQuery(message);

            // Send text response
            await this.uiService.sendMessage(response.text_response);

            // Send images
            if (response.image_urls && response.image_urls.length > 0) {
                 await this.uiService.sendMessage("🖼️ Mostrando productos encontrados...");
                 // Pequeña pausa antes de enviar imágenes (manejar en UI Service si es posible)
                 // await delay(1000); // Delay should be handled by the UI adapter

                 for (const img of response.image_urls) {
                     await this.uiService.sendImage(img.url, img.name);
                     // Pequeña pausa entre imágenes (manejar en UI Service si es posible)
                     // await delay(1000); // Delay should be handled by the UI adapter
                 }
            }

            return;
        }

        // Ignore 'menu' and 'salir' silently if not in query mode
        if (['menu', 'salir'].includes(lowerMessage)) {
             console.log(`🔇 Ignoring keyword: ${lowerMessage}`);
             return; // No response needed
        }

        // Handle menu options
        const cleanOption = this.extractOptionNumber(lowerMessage);

        if (cleanOption === '4') {
            // Option 4: Product Query Mode
            waitingForQuery[userId] = true;

            // Set a timeout to exit query mode after 2 minutes
            // The UI adapter might need to handle sending a message on timeout
            setTimeout(() => {
                if (waitingForQuery[userId]) {
                    waitingForQuery[userId] = false;
                    console.log(`⏳ Consulta mode timed out for user ${userId}`);
                    // The UI adapter should ideally send a message here
                }
            }, 120000); // 2 minutes

            await this.uiService.sendMessage("🔍 *Modo Consulta al Catálogo y Base de Datos*\n\nAhora puedes hacer preguntas sobre nuestros productos.\nConsultaremos primero nuestra base de datos y luego el catálogo PDF.\nPara volver al menú principal, escribe *salir* o *menu*.");
            return;

        } else if (chatData.respuestas[cleanOption]) {
            // Respond to other menu options
            console.log(`✅ Responding to option ${cleanOption}: ${chatData.respuestas[cleanOption]}`);
            await this.uiService.sendMessage(chatData.respuestas[cleanOption]);
            return;

        } else {
            // Invalid option
            console.warn(`⚠️ Invalid option: "${cleanOption}".`);
            await this.uiService.sendMessage("⚠️ Opción no válida. Por favor, selecciona una de las opciones del menú.");
            const menuMessage = await this.getMenuMessage();
            await this.uiService.sendMessage(menuMessage);
            return;
        }
    }

    private async getMenuMessage(): Promise<string> {
        const chatData = await this.configService.getChatData();
        let menuText = `${chatData.bienvenida}\n\n`;
        menuText += chatData.menu.filter((op: string) => !op.includes('5. Salir')).join("\n");
        menuText += "\n\n💬 *Responde con el número de la opción deseada.*";
        return menuText;
    }


    private async processProductQuery(query: string): Promise<ProcessedQueryResponse> {
        // 1. Search in PostgreSQL database
        const dbProducts = await this.dbService.searchProducts(query);

        // 2. Search in PDF catalog
        const pdfText = await this.pdfService.extractText(this.catalogPath);
        let relevantPdfChunks: string[] = [];
        if (pdfText) {
             relevantPdfChunks = this.pdfService.findRelevantSections(pdfText, query);
        }

        // 3. Combine information and generate response with AI
        const aiTextResponse = await this.aiService.generateResponse(query, dbProducts, relevantPdfChunks);

        // Collect image URLs from DB results
        const imageUrls = dbProducts
            .filter((p: Product) => p.imagen_url)
            .map((p: Product) => ({ url: p.imagen_url!, name: p.nombre || 'Producto' }));

        return {
            text_response: `📚 *Información del Producto*\n\n${aiTextResponse}\n\n_Para salir de este modo escribe *salir* o *menu*_`,
            image_urls: imageUrls,
            products: dbProducts
        };
    }

     private extractOptionNumber(messageText: string): string {
        // Try to find an isolated number in the message
        const match = messageText.match(/\b[1-5]\b/);
        if (match) {
            return match[0];
        }

        // If no isolated number, check if the message contains only a number
        if (["1", "2", "3", "4", "5"].includes(messageText.trim())) {
            return messageText.trim();
        }

        return messageText; // Return original text if no number found
    }
}
