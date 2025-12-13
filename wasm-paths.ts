import { app } from 'electron';
import * as path from 'path';

export function getWasmPaths(): {
  onnxWasm: string;
  piperData: string;
  piperWasm: string;
} {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    const basePath = path.join(__dirname, '../../');
    // Dev paths
    return {
      onnxWasm: path.join(basePath, 'node_modules/onnxruntime-web/dist/'),
      piperWasm: path.join(basePath, 'wasm-files/piper/piper_phonemize.wasm'),
      piperData: path.join(basePath, 'wasm-files/piper/piper_phonemize.data'),
    };
  } else {
    // Production paths (inside AppImage resources)
    const resourcesPath = process.resourcesPath;
    const wasmBase = path.join(resourcesPath, 'wasm-files');
    
    return {
      onnxWasm: path.join(wasmBase, 'onnx/'),
      piperWasm: path.join(wasmBase, 'piper/piper_phonemize.wasm'),
      piperData: path.join(wasmBase, 'piper/piper_phonemize.data'),
    };
  }
}

export function setupWasmPathIPC(ipcMain: any) {
  ipcMain.handle('get-wasm-paths', () => {
    return getWasmPaths();
  });
}
