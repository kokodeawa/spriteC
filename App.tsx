

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateGameAsset } from './services/gemini';
import { convertToCArray, cArrayToImage, CArrayResult as CArrayFullResult } from './utils/imageToC';

// CArrayResult ahora es solo la parte de datos que guardamos en el frame.
interface CArrayResult {
  code: string;
  pixels: string[];
}

interface Frame {
  id: string;
  image: string; // Esta será la imagen limpia, cuantificada
  cResult: CArrayResult;
  prompt: string;
}

// Define the AIStudio interface as expected by TypeScript.
// This resolves the error: "Property 'aistudio' must be of type 'AIStudio', but here has type '{ ... }'".
interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

declare global {
  interface Window {
    aistudio: AIStudio;
  }
}

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('pocion de curación estilo pixel art');
  const [resolution, setResolution] = useState<number>(32);
  const [isGenerating, setIsGenerating] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOnionSkin, setShowOnionSkin] = useState(true);
  
  const resolutions = [16, 32, 64, 128];
  
  const [activeTab, setActiveTab] = useState<'generator' | 'decoder'>('generator');
  const [cCodeInput, setCCodeInput] = useState('');
  const [decodeResolution, setDecodeResolution] = useState<number>(32);
  const [decodedImage, setDecodedImage] = useState<string | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const [hasUserSelectedApiKey, setHasUserSelectedApiKey] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    let interval: any;
    if (isPlaying && frames.length > 1) {
      interval = setInterval(() => {
        setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isPlaying, frames.length]);

  const checkApiKeyStatus = useCallback(async () => {
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasUserSelectedApiKey(selected);
      if (!selected && !apiError) { // Only set generic error if no specific API error is already present
        setApiError("Please select a paid API key to use advanced features and avoid quota limits. (ai.google.dev/gemini-api/docs/billing)");
      } else if (selected && apiError === "Please select a paid API key to use advanced features and avoid quota limits. (ai.google.dev/gemini-api/docs/billing)") {
        // Clear generic key error if key is now selected
        setApiError(null); 
      }
    } else {
      // If aistudio is not available, assume key is managed externally or not needed for basic ops
      setHasUserSelectedApiKey(true);
      setApiError(null);
    }
  }, [apiError]);

  useEffect(() => {
    checkApiKeyStatus();
  }, [checkApiKeyStatus]);

  const handleSelectApiKey = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        // Assume success after opening the dialog, as per guidelines
        setHasUserSelectedApiKey(true);
        setApiError(null); // Clear any previous API errors after successful selection
      } catch (e) {
        console.error("Error opening API key selection dialog:", e);
        setApiError("Failed to open API key selection. Please try again.");
      }
    } else {
      alert("API Key selection utility not available in this environment.");
    }
  };


  const handleForge = async (isNextFrame: boolean = false) => {
    if (!prompt) return;
    if (!hasUserSelectedApiKey) {
        setApiError("An API key is required to generate assets. Please select one.");
        return;
    }

    setIsGenerating(true);
    setIsPlaying(false);
    setApiError(null); // Clear previous API errors on new forge attempt

    const prevImage = isNextFrame && frames.length > 0 ? frames[frames.length - 1].image : null;
    // Pass setApiError to the service function
    const imageUrl = await generateGameAsset(prompt, prevImage, resolution, setApiError);

    if (imageUrl) {
      const tempImg = new Image();
      tempImg.src = imageUrl;
      tempImg.onload = async () => {
        const result: CArrayFullResult = await convertToCArray(tempImg, resolution, `${prompt}_f${frames.length}`);
        
        const newFrame: Frame = {
          id: Math.random().toString(36).substr(2, 9),
          image: result.image, // Usar la imagen limpia y cuantificada
          cResult: {
            code: result.code,
            pixels: result.pixels,
          },
          prompt: prompt
        };
        
        const updatedFrames = [...frames, newFrame];
        setFrames(updatedFrames);
        setCurrentFrameIndex(updatedFrames.length - 1);
        setIsGenerating(false);
      };
      tempImg.onerror = () => {
        console.error("Error al cargar la imagen generada.");
        setIsGenerating(false);
        setApiError("Failed to load generated image.");
      }
    } else {
      setIsGenerating(false);
      // If imageUrl is null, generateGameAsset already set an API error if applicable.
    }
  };

  const deleteFrame = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const indexToDelete = frames.findIndex(f => f.id === id);
    const newFrames = frames.filter(f => f.id !== id);
    setFrames(newFrames);
    
    if (newFrames.length === 0) {
      setCurrentFrameIndex(-1);
    } else if (currentFrameIndex >= indexToDelete) {
      setCurrentFrameIndex(Math.max(0, currentFrameIndex - 1));
    }
    setIsPlaying(false);
  };

  const clearFrames = () => {
    if (confirm("¿Borrar toda la secuencia?")) {
      setFrames([]);
      setCurrentFrameIndex(-1);
      setIsPlaying(false);
    }
  };

  const exportAllToC = () => {
    if (frames.length === 0) return;
    let fullCode = `/* ANIMATION SEQUENCE: ${prompt.toUpperCase()} */\n`;
    fullCode += `/* Frames: ${frames.length} | Resolution: ${resolution}x${resolution} */\n\n`;
    
    frames.forEach((f, i) => {
      const safeName = f.prompt.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      const frameCode = f.cResult.code.replace(`${safeName}_F${i}_DATA`, `${safeName}_F${i}_DATA`);
      fullCode += frameCode + "\n";
    });
    
    const safeName = prompt.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    fullCode += `\nconst uint16_t* const ${safeName}_ANIMATION[] PROGMEM = {\n  `;
    frames.forEach((f, i) => {
      const safeNameFrame = f.prompt.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      fullCode += `${safeNameFrame}_F${i}_DATA${i === frames.length - 1 ? "" : ", "}`;
    });
    fullCode += `\n};\n`;
    
    navigator.clipboard.writeText(fullCode);
    alert("Full Animation C-Code copied to clipboard!");
  };
  
  const downloadCurrentFrameAsPNG = () => {
    if (currentFrameIndex < 0) return;

    const frame = frames[currentFrameIndex];
    const safePrompt = frame.prompt.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${safePrompt}_frame_${currentFrameIndex}.png`;

    const link = document.createElement('a');
    link.href = frame.image;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const exportSpriteSheet = async () => {
    if (frames.length === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = resolution * frames.length;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        alert("Failed to create canvas context for sprite sheet.");
        return;
    }
    
    ctx.imageSmoothingEnabled = false; 

    const imagePromises = frames.map(frame => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = frame.image;
        });
    });

    try {
        const loadedImages = await Promise.all(imagePromises);
        
        loadedImages.forEach((img, index) => {
            ctx.drawImage(img, index * resolution, 0, resolution, resolution);
        });

        const dataUrl = canvas.toDataURL('image/png');
        const safePrompt = prompt.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fileName = `${safePrompt}_spritesheet_${resolution}x${resolution}_${frames.length}f.png`;

        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (error) {
        console.error("Failed to load images for sprite sheet:", error);
        alert("An error occurred while creating the sprite sheet.");
    }
  };


  const handleDecode = async () => {
    if (!cCodeInput) return;
    setIsDecoding(true);
    setDecodeError(null);
    setDecodedImage(null);

    try {
      const imageUrl = await cArrayToImage(cCodeInput, decodeResolution);
      setDecodedImage(imageUrl);

      const tempImg = new Image();
      tempImg.src = imageUrl;

      await new Promise<void>((resolve, reject) => {
        tempImg.onload = async () => {
          try {
            const assetNameMatch = cCodeInput.match(/const\s+uint16_t\s+([A-Za-z0-9_]+)/);
            const assetName = assetNameMatch ? assetNameMatch[1].replace('_DATA', '') : 'DECODED_ASSET';
            const result: CArrayFullResult = await convertToCArray(tempImg, decodeResolution, assetName);
            
            setCCodeInput(result.code);
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        tempImg.onerror = () => {
          reject(new Error("No se pudo cargar la imagen decodificada para volver a procesarla."));
        };
      });

    } catch (err: any) {
      setDecodeError(err.toString());
    } finally {
      setIsDecoding(false);
    }
  };

  const TabButton = ({ name, id }: { name: string, id: 'generator' | 'decoder' }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${
        activeTab === id
          ? 'bg-[#12121d] border-t-2 border-cyan-500 text-cyan-400'
          : 'bg-transparent text-slate-600 hover:text-slate-300'
      }`}
    >
      {name}
    </button>
  );

  return (
    <main className="min-h-screen bg-[#08080c] text-slate-300 font-mono p-4 md:p-6 flex flex-col gap-4">
      <header className="flex justify-between items-center border-b border-slate-800 pb-2">
        <div className="flex items-center gap-4">
          <div className="bg-cyan-600 text-black px-2 py-1 font-black italic text-xl">SF</div>
          <div>
            <h1 className="text-lg font-black text-white uppercase tracking-tighter">SPRITE_FORGE_V2</h1>
            <p className="text-[9px] text-cyan-500 font-bold uppercase tracking-[0.2em]">ASSET_WORKBENCH</p>
          </div>
        </div>
        <div className="text-[9px] text-slate-600 flex gap-4">
          <button 
            onClick={() => setShowOnionSkin(!showOnionSkin)}
            className={`px-2 py-0.5 rounded border ${showOnionSkin ? 'border-cyan-500 text-cyan-400' : 'border-slate-800 text-slate-700'}`}
          >
            ONION_SKIN: {showOnionSkin ? 'ON' : 'OFF'}
          </button>
        </div>
      </header>

      <div className="flex border-b border-slate-800 -mt-4">
        <TabButton name="Generator" id="generator" />
        <TabButton name="Decoder" id="decoder" />
      </div>

      {apiError && (
        <div className="bg-red-900/20 border border-red-500/30 text-red-300 p-3 rounded-lg flex items-center justify-between text-sm shadow-md transition-all duration-300 ease-in-out transform scale-100 hover:scale-[1.01]">
          <span className="flex-1 mr-4">{apiError}</span>
          {!hasUserSelectedApiKey && (
            <button
              onClick={handleSelectApiKey}
              className="bg-red-600 hover:bg-red-500 text-white font-bold py-1 px-3 rounded-md text-xs uppercase tracking-wider transition-colors shadow-sm"
              title="Select a paid API key from a GCP project to avoid quota limits."
            >
              Select API Key
            </button>
          )}
        </div>
      )}

      {activeTab === 'generator' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-[#12121d] border border-slate-800 p-4 rounded-lg space-y-4 shadow-xl">
              <div className="space-y-2">
                <label className="text-[10px] text-cyan-500 uppercase font-bold tracking-widest">Resolution</label>
                <div className="grid grid-cols-4 gap-1">
                  {resolutions.map(res => (
                    <button
                      key={res}
                      onClick={() => { setResolution(res); clearFrames(); }}
                      className={`py-1.5 text-[10px] font-bold rounded border transition-all ${
                        resolution === res ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'bg-black border-slate-800 text-slate-600'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-cyan-500 uppercase font-bold tracking-widest">Global_Prompt</label>
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full h-24 bg-black border border-slate-700 rounded p-2 text-xs focus:border-cyan-500 outline-none text-cyan-100 resize-none"
                  placeholder="Describe the asset..."
                />
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => handleForge(false)}
                  disabled={isGenerating || !hasUserSelectedApiKey || !!apiError}
                  className="bg-slate-200 hover:bg-white text-black font-black py-2 rounded text-[10px] uppercase tracking-widest disabled:opacity-50"
                >
                  {isGenerating ? "FORGING..." : "FORGE_INITIAL"}
                </button>
                <button 
                  onClick={() => handleForge(true)}
                  disabled={isGenerating || frames.length === 0 || !hasUserSelectedApiKey || !!apiError}
                  className="bg-cyan-600 hover:bg-cyan-500 text-black font-black py-2 rounded text-[10px] uppercase tracking-widest disabled:opacity-50 shadow-[0_3px_0_#0891b2]"
                >
                  {isGenerating ? "EVOLVING..." : "FORGE_NEXT_FRAME"}
                </button>
                <button 
                  onClick={clearFrames}
                  className="text-[9px] text-red-500/50 hover:text-red-500 uppercase font-bold pt-2 transition-colors"
                >
                  Reset_Sequence
                </button>
              </div>
            </div>

            <div className="bg-[#0c0c14] border border-slate-800 rounded-lg p-3">
               <div className="text-[10px] text-slate-500 uppercase font-bold mb-2 border-b border-slate-800 pb-1">AI_Context_Reference</div>
               <div className="aspect-square bg-black rounded border border-slate-800 flex items-center justify-center relative overflow-hidden">
                  {frames.length > 0 ? (
                    <img src={frames[frames.length - 1].image} className="w-full h-full pixel-art opacity-60" alt="Last Frame Context" />
                  ) : (
                    <div className="text-[8px] text-slate-800 uppercase text-center p-4">Waiting for initial seed</div>
                  )}
                  <div className="absolute top-1 left-1 bg-black/80 px-1 text-[7px] text-cyan-500 border border-cyan-900 rounded">FRAME: {frames.length - 1}</div>
               </div>
               <p className="text-[8px] text-slate-600 mt-2 italic">*This is what the AI sees as the "previous frame" for evolution.</p>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="flex-1 bg-black rounded-xl border-4 border-slate-800 relative flex items-center justify-center overflow-hidden shadow-inner group">
              <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)', backgroundSize: '10% 10%' }} />
              
              {showOnionSkin && !isPlaying && currentFrameIndex > 0 && (
                 <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
                    <div className="grid w-full h-full pixel-art" style={{ gridTemplateColumns: `repeat(${resolution}, 1fr)` }}>
                      {frames[currentFrameIndex - 1].cResult.pixels.map((p, i) => (
                        <div key={i} className="w-full h-full" style={{ backgroundColor: p === 'TRANSPARENT' ? 'transparent' : p }} />
                      ))}
                    </div>
                 </div>
              )}

              {isGenerating ? (
                <div className="text-center animate-pulse z-10">
                  <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">Synthesizing_Frame_{frames.length}...</span>
                </div>
              ) : currentFrameIndex >= 0 ? (
                <div 
                  className="grid w-full h-full pixel-art transition-opacity duration-75 relative z-10" 
                  style={{ gridTemplateColumns: `repeat(${resolution}, 1fr)` }}
                >
                  {frames[currentFrameIndex].cResult.pixels.map((p, i) => (
                    <div key={i} className="w-full h-full" style={{ backgroundColor: p === 'TRANSPARENT' ? 'transparent' : p }} />
                  ))}
                </div>
              ) : (
                <div className="text-center text-slate-800 opacity-20">
                  <svg className="mx-auto mb-2" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M12 2v20M2 12h20"/><path d="M12 2l4 4-4 4-4-4 4-4zM12 22l4-4-4-4-4 4 4 4z"/></svg>
                  <span className="text-[12px] font-black uppercase tracking-[0.5em]">BUFFER_EMPTY</span>
                </div>
              )}

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-800 shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity z-20">
                 <button onClick={() => setIsPlaying(!isPlaying)} className="text-cyan-400 hover:text-cyan-300">
                    {isPlaying ? <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                 </button>
                 <div className="w-[1px] h-4 bg-slate-800"></div>
                 <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Frame: {currentFrameIndex + 1} / {frames.length}</span>
              </div>
            </div>

            <div className="h-28 bg-[#0c0c14] border border-slate-800 rounded-lg flex gap-2 p-2 overflow-x-auto custom-scrollbar">
               {frames.map((frame, idx) => (
                 <div key={frame.id} className="relative group/frame">
                   <button 
                     onClick={() => { setIsPlaying(false); setCurrentFrameIndex(idx); }}
                     className={`flex-shrink-0 w-20 h-20 border-2 transition-all relative overflow-hidden bg-black ${currentFrameIndex === idx ? 'border-cyan-500 scale-105' : 'border-slate-800 opacity-50 hover:opacity-100'}`}
                   >
                     <img src={frame.image} className="w-full h-full pixel-art" />
                     <div className="absolute bottom-0 right-0 bg-black/80 text-[8px] px-1 text-slate-500 font-bold">{idx}</div>
                   </button>
                   <button 
                     onClick={(e) => deleteFrame(frame.id, e)}
                     className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover/frame:opacity-100 transition-opacity hover:bg-red-500 z-10 shadow-lg"
                   >
                     <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
                   </button>
                 </div>
               ))}
               {!isGenerating && <button onClick={() => handleForge(true)} className="flex-shrink-0 w-20 h-20 border-2 border-dashed border-slate-800 flex items-center justify-center text-slate-800 hover:border-cyan-500/50 hover:text-cyan-500 transition-all"><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14"/></svg></button>}
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-4">
             <div className="bg-[#0a0a0f] border border-slate-800 rounded-lg flex flex-col flex-1 relative overflow-hidden shadow-2xl">
                <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-[#161625]">
                  <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">{currentFrameIndex >= 0 ? `FRAME_${currentFrameIndex}` : 'BUFFER_VOID'}</span>
                  <div className="flex gap-2 flex-wrap justify-end">
                     <button title="Download current frame as PNG" onClick={downloadCurrentFrameAsPNG} disabled={currentFrameIndex < 0} className="text-[8px] bg-slate-600/10 border border-slate-500/30 text-slate-400 px-2 py-1 rounded uppercase font-bold hover:bg-slate-600/20 disabled:opacity-20">DL .PNG</button>
                     <button title="Copy C-Array for current frame" onClick={() => currentFrameIndex >= 0 && navigator.clipboard.writeText(frames[currentFrameIndex].cResult.code)} disabled={currentFrameIndex < 0} className="text-[8px] bg-cyan-600/10 border border-cyan-500/30 text-cyan-400 px-2 py-1 rounded uppercase font-bold hover:bg-cyan-600/20 disabled:opacity-20">Copy .C</button>
                     <div className="w-[1px] h-4 bg-slate-700 self-center"></div>
                     <button title="Export all frames as a single PNG spritesheet" onClick={exportSpriteSheet} disabled={frames.length === 0} className="text-[8px] bg-slate-500 text-black px-2 py-1 rounded uppercase font-bold hover:bg-white disabled:opacity-20">Sheet .PNG</button>
                     <button title="Export all frames as a C-Array animation" onClick={exportAllToC} disabled={frames.length === 0} className="text-[8px] bg-cyan-500 text-black px-2 py-1 rounded uppercase font-bold hover:bg-white disabled:opacity-20">All .C</button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-black/40 text-[10px] font-mono leading-tight">
                  {currentFrameIndex >= 0 ? <pre className="text-cyan-800/80"><code>{frames[currentFrameIndex].cResult.code}</code></pre> : <div className="h-full flex flex-col items-center justify-center text-slate-800 opacity-20 uppercase font-black text-center p-8"><svg className="mb-4" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Ready for data transmission</div>}
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'decoder' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
          <div className="lg:col-span-7 flex flex-col">
            <div className="bg-[#12121d] border border-slate-800 p-4 rounded-lg space-y-4 shadow-xl flex-1 flex flex-col">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-cyan-500 uppercase font-bold tracking-widest">C-Array Source (RGB565)</label>
                <div className="flex items-center gap-4">
                  <select
                    value={decodeResolution}
                    onChange={(e) => setDecodeResolution(parseInt(e.target.value))}
                    className="bg-black border border-slate-700 rounded px-2 py-1 text-xs outline-none text-slate-300"
                  >
                    {resolutions.map(r => <option key={r} value={r}>{r}x{r}</option>)}
                  </select>
                  <button 
                    onClick={handleDecode} 
                    disabled={isDecoding}
                    className="bg-cyan-600 hover:bg-cyan-500 text-black font-black py-2 px-4 rounded text-[10px] uppercase tracking-widest disabled:opacity-50"
                  >
                    {isDecoding ? "CLEANING..." : "CLEAN & DECODE"}
                  </button>
                </div>
              </div>
              <textarea 
                value={cCodeInput}
                onChange={(e) => setCCodeInput(e.target.value)}
                className="w-full flex-1 bg-black/80 border border-slate-700 rounded p-3 text-[11px] focus:border-cyan-500 outline-none text-cyan-200 resize-none font-mono custom-scrollbar"
                placeholder="const uint16_t ASSET_DATA[] PROGMEM = { 0x1234, 0x5678, ... };"
              />
            </div>
          </div>
          <div className="lg:col-span-5 flex flex-col">
             <div className="flex-1 bg-black rounded-xl border-4 border-slate-800 relative flex items-center justify-center overflow-hidden shadow-inner p-4">
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)', backgroundSize: '10% 10%' }} />
                {isDecoding && <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>}
                {decodeError && <div className="text-center text-red-500 text-xs font-bold p-4 bg-red-900/20 border border-red-500/30 rounded"><p className="font-black uppercase mb-2">Decode Error</p>{decodeError}</div>}
                {decodedImage && !isDecoding && !decodeError && <img src={decodedImage} alt="Decoded Asset" className="pixel-art w-full h-full object-contain" />}
                {!decodedImage && !isDecoding && !decodeError && <div className="text-center text-slate-800 opacity-20"><svg className="mx-auto mb-2" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M10 21.5c.32.3.68.5.9.8.48.52 1.17 1.2 1.1 2.2 0 .8-.4 1.5-1.1 1.5-.7 0-1.1-.7-1.1-1.5 0-.9.4-1.5.8-2 .3-.4.6-.7.8-.9.4-.4.8-.8 1-1.1.2-.3.4-.6.5-.8.2-.3.4-.6.4-.9.2-.5.1-1-.1-1.5-.2-.4-.4-.8-.6-1.2l-.2-.5c-.2-.4-.3-.8-.3-1.2s.1-.8.2-1.2l-.2-.5c-.2-.4-.4-.8-.6-1.2-.2-.5-.3-1-.1-1.5s.2-.9.4-.9c-.1-.3-.3-.6-.5-.8-.2-.3-.6-.7-1-1.1-.2-.3-.5-.6-.8-.9-.4-.5-.8-1.1-.8-2 0-.8.4-1.5 1.1-1.5s1.1.7 1.1 1.5c-.07 1-.76 1.68-1.1 2.2-.2.3-.5.5-.9.8zm4 0c-.32.3-.68.5-.9.8-.48.52-1.17 1.2-1.1 2.2 0 .8.4 1.5 1.1 1.5.7 0 1.1-.7 1.1-1.5 0-.9-.4-1.5-.8-2-.3-.4-.6-.7-.8-.9-.4-.4-.8-.8-1-1.1-.2-.3-.4-.6-.5-.8-.2-.3-.4-.6-.4-.9-.2-.5-.1-1 .1-1.5.2-.4.4-.8.6-1.2l.2-.5c.2-.4.3-.8.3-1.2s-.1-.8-.2-1.2l-.2-.5c-.2-.4-.4-.8-.6-1.2-.2-.5-.3-1-.1-1.5s.2-.9.4-.9c-.1-.3-.3-.6-.5-.8-.2-.3-.6-.7 1-1.1.2-.3.5-.6.8-.9.4-.5.8-1.1.8-2 0-.8-.4-1.5-1.1-1.5s-1.1.7-1.1 1.5c.07 1 .76 1.68 1.1 2.2.2.3.5.5.9.8z"/></svg><span className="text-[12px] font-black uppercase tracking-[0.5em]">DECODER_IDLE</span></div>}
             </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a2e; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #06b6d4; }
        .pixel-art { image-rendering: pixelated; }
      `}</style>
    </main>
  );
};

export default App;
