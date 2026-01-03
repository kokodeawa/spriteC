
import { GoogleGenAI } from "@google/genai";

export const generateGameAsset = async (
  userPrompt: string, 
  previousImageBase64: string | null,
  resolution: number,
  setApiError: (message: string | null) => void // Nuevo parámetro para manejar errores de API
): Promise<string | null> => {
  // Siempre crear una nueva instancia justo antes de la llamada
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY }); 
  
  const basePrompt = `A single isolated ${resolution}x${resolution} pixel art of a ${userPrompt} for a 2D video game. 
    Centered game asset, high contrast, clean edges, solid black background, 
    16-bit console style, vivid colors, flat solid colors, strict pixel grid, no anti-aliasing, no smooth gradients.`;

  const progressivePrompt = `This is the previous frame of an animation. 
    Generate the NEXT logically following frame for: a ${resolution}x${resolution} pixel art of ${userPrompt}. 
    Maintain strict consistency in size, colors, and style based on the provided image. 
    Slightly change the posture or effect to create a smooth animation sequence.
    Keep it as a single isolated asset on solid black background. Must be pixel-perfect with no anti-aliasing.`;

  try {
    const parts: any[] = [];
    
    if (previousImageBase64) {
      // Si hay una imagen previa, la enviamos para contexto de animación
      const base64Data = previousImageBase64.split(',')[1];
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64Data,
        },
      });
      parts.push({ text: progressivePrompt });
    } else {
      parts.push({ text: basePrompt });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ parts }],
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    if (!response.candidates || response.candidates.length === 0) {
      setApiError("API did not return any candidates.");
      return null;
    }

    const firstCandidate = response.candidates[0];
    if (!firstCandidate.content || !firstCandidate.content.parts) {
      setApiError("API candidate did not contain content parts.");
      return null;
    }

    for (const part of firstCandidate.content.parts) {
      if (part.inlineData) {
        setApiError(null); // Clear any previous API errors on success
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    setApiError("API response did not contain an image.");
    return null; // No image part found
  } catch (error: any) {
    console.error("Error generating sequential asset:", error);

    // Verificar errores específicos de la API
    if (error.code === 429 && error.status === "RESOURCE_EXHAUSTED") {
      setApiError("You have exceeded your API quota. Please check your plan and billing, or select a paid API key for higher limits. For more info: ai.google.dev/gemini-api/docs/billing");
    } else if (error.message && error.message.includes("Requested entity was not found.")) {
      setApiError("There was an issue with your API key. Please re-select a paid API key. For more info: ai.google.dev/gemini-api/docs/billing");
    } else {
      setApiError(`An unexpected API error occurred: ${error.message || error.toString()}`);
    }
    return null;
  }
};

// Mantener por compatibilidad si es necesario, pero redirigir a la nueva lógica
export const generatePotionImage = generateGameAsset;
