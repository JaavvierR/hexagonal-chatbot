// src/core/interfaces.ts

// Tipos de datos (pueden ir aquí o en un archivo separado si crecen mucho)
export interface Product {
    codigo: string | null;
    nombre: string | null;
    descripcion: string | null;
    precio: number | null;
    stock: number | null;
    categoria: string | null;
    imagen_url: string | null;
}

export interface ChatData {
    bienvenida: string;
    menu: string[];
    respuestas: { [key: string]: string };
}

export interface FacebookCredentials {
    email: string;
    password: string;
}

export interface ProcessedQueryResponse {
    text_response: string;
    image_urls: { url: string; name: string }[];
    products?: Product[];
}


// Interfaces de Servicios Externos (Puertos de Salida simplificados)

export interface IDatabaseService {
    searchProducts(query: string): Promise<Product[]>;
}

export interface IPdfService {
    extractText(pdfPath: string): Promise<string | null>;
    findRelevantSections(text: string, query: string): string[];
}

export interface IAiService {
    generateResponse(query: string, products: Product[], catalogContext: string[]): Promise<string>;
}

export interface IConfigService {
    getChatData(): Promise<ChatData>;
    getFacebookCredentials(): Promise<FacebookCredentials>;
}

// Interfaz para la interacción con el usuario (simplificado, el Entry Point lo implementará)
export interface IUIService {
    sendMessage(message: string): Promise<boolean>;
    sendImage(imageUrl: string, imageName: string): Promise<boolean>;
    // Podrías añadir métodos para recibir mensajes si el diseño lo requiere,
    // pero en este caso, el Entry Point (Selenium) manejará la recepción.
}
