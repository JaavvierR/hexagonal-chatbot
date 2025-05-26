// src/services/seleniumUiService.ts
import { By, Key, until } from 'selenium-webdriver';
import clipboardy from 'clipboardy'; // Importar clipboardy
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios'; // Para descargar imágenes
import { setTimeout as delay } from 'timers/promises'; // Importar delay
// Definir __filename y __dirname para módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export class SeleniumUiService {
    constructor(driver) {
        this.driver = driver;
    }
    async sendMessage(messageText) {
        try {
            // Use clipboardy to copy text to clipboard
            await clipboardy.write(messageText);
            // Find the input field
            const selectors = [
                "//div[@role='textbox' and (@aria-label='Mensaje' or @aria-label='Message')]",
                "//div[@contenteditable='true'][@role='textbox']",
                "//div[@data-lexical-editor='true']"
            ];
            let messageInput = null;
            for (const selector of selectors) {
                try {
                    messageInput = await this.driver.findElement(By.xpath(selector));
                    break;
                }
                catch (e) {
                    continue;
                }
            }
            if (messageInput) {
                // Click on the input field
                await messageInput.click();
                await delay(500);
                // Use Ctrl+V to paste
                await this.driver.actions().keyDown(Key.CONTROL).sendKeys('v').keyUp(Key.CONTROL).perform();
                await delay(500);
                await messageInput.sendKeys(Key.RETURN);
                console.log(`Mensaje enviado: ${messageText}`);
                return true;
            }
            else {
                console.error("No se pudo encontrar el campo de texto para enviar el mensaje");
                return false;
            }
        }
        catch (e) {
            console.error(`Error al enviar mensaje: ${e.message}`);
            return false;
        }
    }
    async sendImage(imageUrl, imageName) {
        /** Descarga la imagen y la adjunta directamente al mensaje con manejo mejorado de errores */
        let imgFilename = undefined;
        try {
            console.log(`🖼️ Intentando enviar imagen para: ${imageName}`);
            console.log(`🔗 URL de imagen: ${imageUrl}`);
            // Crear un directorio temporal para las imágenes si no existe
            const tempDir = path.join(__dirname, "..", "..", "temp_images"); // Ajustar ruta
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }
            // Descargar la imagen con tiempo de espera
            let imgResponse;
            try {
                imgResponse = await axios({
                    method: 'get',
                    url: imageUrl,
                    responseType: 'stream',
                    timeout: 10000 // 10 seconds timeout
                });
                if (imgResponse.status !== 200) {
                    console.error(`❌ No se pudo descargar la imagen. Código: ${imgResponse.status}`);
                    throw new Error(`Error al descargar imagen: ${imgResponse.status}`);
                }
            }
            catch (e) {
                console.error(`❌ Error en la solicitud HTTP: ${e.message}`);
                throw new Error(`Error de conexión: ${e.message}`);
            }
            // Crear un nombre de archivo único
            imgFilename = path.join(tempDir, `product_${Date.now()}.jpg`);
            // Guardar la imagen
            const writer = fs.createWriteStream(imgFilename);
            imgResponse.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            console.log(`✅ Imagen descargada en: ${imgFilename}`);
            // Método 1: Usar el atajo de teclado Ctrl+G (funciona en muchas versiones de FB Messenger)
            try {
                console.log("🔄 Intentando método 1: Atajo de teclado Ctrl+G");
                // Enfocar el área de texto
                const textSelectors = [
                    "//div[@role='textbox' and (@aria-label='Mensaje' or @aria-label='Message')]",
                    "//div[@contenteditable='true'][@role='textbox']",
                    "//div[@data-lexical-editor='true']"
                ];
                let textBox = null;
                for (const selector of textSelectors) {
                    try {
                        textBox = await this.driver.wait(until.elementLocated(By.xpath(selector)), 5000);
                        break;
                    }
                    catch (e) {
                        continue;
                    }
                }
                if (!textBox)
                    throw new Error("Text box not found for Ctrl+G");
                await textBox.click();
                // Usar combinación de teclas Ctrl+G para adjuntar
                await this.driver.actions().keyDown(Key.CONTROL).sendKeys('g').keyUp(Key.CONTROL).perform();
                // Verificar si se abrió el diálogo
                await delay(1500);
                // Buscar el input de archivo que debería aparecer
                const fileInputs = await this.driver.findElements(By.xpath("//input[@type='file']"));
                if (fileInputs.length > 0) {
                    // Enviar la ruta absoluta al input de archivo
                    await fileInputs[fileInputs.length - 1].sendKeys(path.resolve(imgFilename));
                    console.log("✅ Archivo seleccionado mediante método de atajo de teclado");
                    // Esperar a que se cargue la imagen
                    await delay(2000);
                    // Añadir descripción al mensaje si es posible
                    try {
                        let messageInputAfterUpload = null;
                        for (const selector of textSelectors) {
                            try {
                                messageInputAfterUpload = await this.driver.wait(until.elementLocated(By.xpath(selector)), 3000);
                                break;
                            }
                            catch (e) {
                                continue;
                            }
                        }
                        if (messageInputAfterUpload) {
                            await messageInputAfterUpload.click();
                            await messageInputAfterUpload.sendKeys(imageName);
                        }
                        else {
                            console.warn("⚠️ No se pudo encontrar el campo de texto después de cargar la imagen para agregar descripción.");
                        }
                    }
                    catch (e) {
                        console.warn(`⚠️ No se pudo agregar descripción: ${e.message}`);
                    }
                    // Enviar con Enter (método más confiable)
                    try {
                        await this.driver.actions().sendKeys(Key.ENTER).perform();
                        await delay(1500);
                        console.log(`✅ Imagen enviada con Enter para: ${imageName}`);
                        return true;
                    }
                    catch (e) {
                        console.error(`❌ Error al enviar con Enter: ${e.message}`);
                    }
                }
                else {
                    console.warn("❌ No se abrió el diálogo de adjuntar archivo con Ctrl+G");
                }
            }
            catch (e) {
                console.warn(`⚠️ Método 1 (Ctrl+G) falló: ${e.message}`);
            }
            // Método 2: Usar botones de la interfaz
            try {
                console.log("🔄 Intentando método 2: Botones de la interfaz");
                const attachButton = await this.driver.wait(until.elementIsVisible(await this.driver.findElement(By.xpath("//div[@aria-label='Adjuntar' or @aria-label='Attach']"))), 5000);
                await attachButton.click();
                await delay(1000);
                const fileInput = await this.driver.wait(until.elementLocated(By.xpath("//input[@type='file']")), 5000);
                await fileInput.sendKeys(path.resolve(imgFilename));
                console.log("✅ Archivo seleccionado");
                await delay(2000);
                // Intentar enviar con Enter
                await this.driver.actions().sendKeys(Key.ENTER).perform();
                await delay(1500);
                console.log(`✅ Imagen enviada con Enter para: ${imageName}`);
                return true;
            }
            catch (e) {
                console.warn(`⚠️ Método 2 (botones de interfaz) falló: ${e.message}`);
            }
            // Si todos los métodos fallan, enviar el enlace como último recurso
            try {
                console.log("🔄 Método de respaldo: Enviar enlace a la imagen");
                const textSelectors = [
                    "//div[@role='textbox' and (@aria-label='Mensaje' or @aria-label='Message')]",
                    "//div[@contenteditable='true'][@role='textbox']",
                    "//div[@data-lexical-editor='true']"
                ];
                let messageInput = null;
                for (const selector of textSelectors) {
                    try {
                        messageInput = await this.driver.wait(until.elementLocated(By.xpath(selector)), 5000);
                        break;
                    }
                    catch (e) {
                        continue;
                    }
                }
                if (messageInput) {
                    await messageInput.click();
                    await messageInput.clear(); // Limpiar cualquier texto previo
                    await messageInput.sendKeys(`${imageName}\n${imageUrl}`);
                    await delay(500);
                    await messageInput.sendKeys(Key.RETURN);
                    console.warn(`⚠️ Enviado enlace a la imagen como alternativa`);
                    return false;
                }
                else {
                    console.error("❌ No se pudo encontrar el campo de texto para enviar el enlace.");
                    return false;
                }
            }
            catch (e) {
                console.error(`❌ Todos los métodos para enviar imagen fallaron: ${e.message}`);
                return false;
            }
        }
        catch (e) {
            console.error(`❌ Error general en sendImage: ${e.message}`);
            return false;
        }
        finally {
            // Limpiar archivos temporales
            try {
                if (typeof imgFilename !== 'undefined' && fs.existsSync(imgFilename)) {
                    fs.unlinkSync(imgFilename);
                    console.log(`🗑️ Archivo temporal eliminado: ${imgFilename}`);
                }
            }
            catch (e) {
                console.error(`⚠️ Error en la limpieza final: ${e.message}`);
            }
        }
    }
}
