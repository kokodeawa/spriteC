
export interface CArrayResult {
  code: string;
  pixels: string[];
  image: string; // Devuelve la URL de la imagen limpia y cuantificada
}

const rgbTo565 = (r: number, g: number, b: number): string => {
  const r5 = (r >> 3) & 0x1F;
  const g6 = (g >> 2) & 0x3F;
  const b5 = (b >> 3) & 0x1F;
  const val = (r5 << 11) | (g6 << 5) | b5;
  return `0x${val.toString(16).toUpperCase().padStart(4, '0')}`;
};

export const convertToCArray = (
  imgElement: HTMLImageElement, 
  size: number = 32,
  assetName: string = "game_asset"
): Promise<CArrayResult> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!ctx) return resolve({ code: "", pixels: [], image: "" });

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imgElement, 0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size).data;
    
    // --- NUEVO ALGORITMO DE DETECCIÓN DE FONDO ---
    const getPixelColor = (x: number, y: number, data: Uint8ClampedArray, width: number): number[] => {
      const index = (y * width + x) * 4;
      return [data[index], data[index+1], data[index+2]];
    };

    const areColorsSimilar = (color1: number[], color2: number[], tolerance = 15): boolean => {
      return (
        Math.abs(color1[0] - color2[0]) < tolerance &&
        Math.abs(color1[1] - color2[1]) < tolerance &&
        Math.abs(color1[2] - color2[2]) < tolerance
      );
    };

    const corner1 = getPixelColor(0, 0, imageData, size);
    const corner2 = getPixelColor(size - 1, 0, imageData, size);
    const corner3 = getPixelColor(0, size - 1, imageData, size);
    const corner4 = getPixelColor(size - 1, size - 1, imageData, size);

    let backgroundColor: number[] | null = null;
    // Si todas las esquinas son del mismo color, asumimos que es el fondo.
    if (areColorsSimilar(corner1, corner2) && areColorsSimilar(corner1, corner3) && areColorsSimilar(corner1, corner4)) {
        backgroundColor = corner1;
    }
    // --- FIN DEL NUEVO ALGORITMO ---

    const hexArray: string[] = [];
    const pixels: string[] = [];

    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const a = imageData[i + 3];
      
      let isBackground = false;
      if (backgroundColor) {
        // Modo preciso: El color del píxel coincide con el color de fondo detectado en las esquinas.
        isBackground = areColorsSimilar([r, g, b], backgroundColor);
      } else {
        // Modo de respaldo seguro: Si no hay un fondo claro, solo eliminar píxeles casi negros.
        isBackground = r < 10 && g < 10 && b < 10;
      }

      if (a < 128 || isBackground) {
        hexArray.push("0x0000");
        pixels.push("TRANSPARENT");
      } else {
        const hex16 = rgbTo565(r, g, b);
        hexArray.push(hex16);
        pixels.push(`rgb(${r},${g},${b})`);
      }
    }

    const safeName = assetName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    let code = `/* Asset: ${safeName} | Resolution: ${size}x${size} | Format: RGB565 */\n`;
    code += `const uint16_t ${safeName}_DATA[] PROGMEM = {\n  `;
    
    for (let i = 0; i < hexArray.length; i++) {
      code += hexArray[i] + (i === hexArray.length - 1 ? "" : ", ");
      if ((i + 1) % 16 === 0 && i < hexArray.length - 1) code += "\n  ";
    }
    code += `\n};\n`;
    
    const cleanImageUrl = canvas.toDataURL('image/png');

    resolve({ code, pixels, image: cleanImageUrl });
  });
};

// --- DECODING FUNCTIONS ---

const rgb565ToRgb = (hex: number): string => {
  const r5 = (hex >> 11) & 0x1F;
  const g6 = (hex >> 5) & 0x3F;
  const b5 = hex & 0x1F;

  const r8 = Math.round((r5 * 255) / 31);
  const g8 = Math.round((g6 * 255) / 63);
  const b8 = Math.round((b5 * 255) / 31);

  return `rgb(${r8},${g8},${b8})`;
};

export const cArrayToImage = (
  cCode: string,
  size: number
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hexMatches = cCode.match(/0x[0-9A-Fa-f]{1,4}/g);

    if (!hexMatches || hexMatches.length === 0) {
      return reject("No valid RGB565 (0x...) values found in the code.");
    }
    
    if (hexMatches.length !== size * size) {
       return reject(`Found ${hexMatches.length} color values, but expected ${size*size} for a ${size}x${size} image.`);
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return reject("Could not create canvas context.");

    hexMatches.forEach((hexString, index) => {
      const hexValue = parseInt(hexString, 16);
      
      if (hexValue !== 0x0000) {
        const x = index % size;
        const y = Math.floor(index / size);
        ctx.fillStyle = rgb565ToRgb(hexValue);
        ctx.fillRect(x, y, 1, 1);
      }
    });
    
    resolve(canvas.toDataURL('image/png'));
  });
};