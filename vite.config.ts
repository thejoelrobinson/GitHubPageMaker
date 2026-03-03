import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import type { Plugin } from 'vite';

// The ort.bundle.min.mjs (ONNX runtime bundled with @huggingface/transformers)
// contains `new URL("ort-wasm-simd-threaded.jsep.wasm", import.meta.url)`.
// With vite-plugin-singlefile's assetsInlineLimit:100MB that 21 MB WASM would
// be base64-inlined into the HTML. Instead we redirect it to the jsDelivr CDN
// so the binary is fetched on first use and cached by the browser.
const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';

const wasmCdnRedirect: Plugin = {
  name: 'wasm-cdn-redirect',
  enforce: 'pre',
  transform(code, id) {
    if (
      (id.includes('ort.bundle.min') || id.includes('ort.wasm.bundle')) &&
      code.includes('ort-wasm-simd-threaded.jsep.wasm')
    ) {
      // Replace `new URL("...jsep.wasm", import.meta.url)` with a plain object
      // that has the same `.href` shape — prevents Vite from treating it as a
      // local asset and inlining the 21 MB binary.
      return {
        code: code.split('new URL("ort-wasm-simd-threaded.jsep.wasm",import.meta.url)')
          .join(`{href:"${WASM_CDN}ort-wasm-simd-threaded.jsep.wasm"}`),
        map: null,
      };
    }
  },
};

export default defineConfig({
  plugins: [wasmCdnRedirect, viteSingleFile()],
  optimizeDeps: {
    // Don't pre-bundle the large Transformers.js package — it's too big for
    // esbuild to handle cleanly and the transform plugin needs to see its raw
    // dist files during the build.
    exclude: ['@huggingface/transformers', 'onnxruntime-web'],
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    outDir: 'dist',
  },
});
