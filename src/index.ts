import "@vibecodeapp/proxy"; // DO NOT REMOVE OTHERWISE VIBECODE PROXY WILL NOT WORK
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";

import { auth } from "./auth";
import { env } from "./env";
import { uploadRouter } from "./routes/upload";
import { sampleRouter } from "./routes/sample";
import { notesRouter } from "./routes/notes";
import { type AppType } from "./types";
import { db } from "./db";
import { startCleanupJob } from "./lib/noteCleanup";

// Start the cleanup job for expired notes
startCleanupJob();

// AppType context adds user and session to the context, will be null if the user or session is null
const app = new Hono<AppType>();

console.log("🔧 Initializing Hono application...");
app.use("*", logger());
app.use(
  "/*",
  cors({
    origin: (origin) => origin || "*", // Allow the requesting origin or fallback to *
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "expo-origin"], // expo-origin is required for Better Auth Expo plugin
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

/** Authentication middleware
 * Extracts session from request headers and attaches user/session to context
 * All routes can access c.get("user") and c.get("session")
 */
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null); // type: typeof auth.$Infer.Session.user | null
  c.set("session", session?.session ?? null); // type: typeof auth.$Infer.Session.session | null
  return next();
});

// Better Auth handler
// Handles all authentication endpoints: /api/auth/sign-in, /api/auth/sign-up, etc.
console.log("🔐 Mounting Better Auth handler at /api/auth/*");
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const request = c.req.raw;
  // Workaround for Expo/React Native: native apps don't send Origin header,
  // but the expo client plugin sends expo-origin instead. We need to create
  // a new request with the origin header set from expo-origin.
  const expoOrigin = request.headers.get("expo-origin");
  if (!request.headers.get("origin") && expoOrigin) {
    const headers = new Headers(request.headers);
    headers.set("origin", expoOrigin);
    const modifiedRequest = new Request(request, { headers });
    return auth.handler(modifiedRequest);
  }
  return auth.handler(request);
});

// Serve uploaded images statically
// Files in uploads/ directory are accessible at /uploads/* URLs
console.log("📁 Serving static files from uploads/ directory");
app.use("/uploads/*", serveStatic({ root: "./" }));

// Mount route modules
console.log("📤 Mounting upload routes at /api/upload");
app.route("/api/upload", uploadRouter);

console.log("📝 Mounting sample routes at /api/sample");
app.route("/api/sample", sampleRouter);

console.log("📝 Mounting notes routes at /api/notes");
app.route("/api/notes", notesRouter);

// ============================================
// Web view for notes - renders HTML page with Neo-Brutalist style
// Includes client-side decryption using AES-256-CTR
// ============================================
app.get("/note/:id", async (c) => {
  const id = c.req.param("id");
  console.log(`🌐 [Notes] Web view requested for note: ${id}`);

  const renderPage = (title: string, content: string, bgColor: string, includeDecryption = false, encryptedContent = '', noteId = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - DestructNote</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${bgColor};
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .container {
      max-width: 480px;
      width: 100%;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }
    .logo-box {
      width: 64px;
      height: 64px;
      background: #FFE600;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 4px solid #000000;
      box-shadow: 4px 4px 0 #000000;
      flex-shrink: 0;
    }
    .logo-box img {
      width: 48px;
      height: 48px;
      object-fit: contain;
    }
    .header-text {
      flex: 1;
    }
    h1 {
      color: #000000;
      font-size: 24px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 4px;
    }
    .subtitle {
      color: rgba(0, 0, 0, 0.7);
      font-size: 13px;
      font-weight: 700;
    }
    .encryption-badge {
      background: #00D4FF;
      padding: 12px;
      margin-bottom: 16px;
      border: 3px solid #000000;
      box-shadow: 3px 3px 0 #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .encryption-badge-text {
      color: #000000;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .note-box {
      background: #FFFFFF;
      padding: 24px;
      margin-bottom: 24px;
      border: 4px solid #000000;
      box-shadow: 6px 6px 0 #000000;
    }
    .note-content {
      color: #000000;
      font-size: 16px;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
      font-weight: 500;
    }
    .note-content a {
      color: #00D4FF;
      text-decoration: underline;
      font-weight: 700;
    }
    .warning-box {
      background: #FF8A00;
      padding: 16px;
      margin-bottom: 24px;
      border: 3px solid #000000;
      box-shadow: 4px 4px 0 #000000;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .warning-text {
      color: #000000;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .destroyed-box {
      background: #FF6B9D;
      padding: 16px;
      margin-bottom: 24px;
      border: 3px solid #000000;
      box-shadow: 4px 4px 0 #000000;
    }
    .destroyed-text {
      color: #000000;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      text-align: center;
    }
    .error-box {
      background: #FFFFFF;
      padding: 16px;
      margin-bottom: 24px;
      border: 3px solid #000000;
      box-shadow: 4px 4px 0 #000000;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .error-text {
      color: #000000;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #FFE600;
      color: #000000;
      padding: 16px 32px;
      border: 4px solid #000000;
      box-shadow: 4px 4px 0 #000000;
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      text-decoration: none;
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.1s;
    }
    .button:hover {
      transform: translate(2px, 2px);
      box-shadow: 2px 2px 0 #000000;
    }
    .button:active {
      transform: translate(4px, 4px);
      box-shadow: 0 0 0 #000000;
    }
    .center {
      text-align: center;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
    }
    .footer-logo {
      display: inline-block;
      background: #000000;
      color: #FFE600;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      border: 3px solid #000000;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: #000;
      font-weight: 700;
    }
    .info-box {
      background: #FFFFFF;
      padding: 20px;
      margin-bottom: 24px;
      border: 3px solid #000000;
      box-shadow: 4px 4px 0 #000000;
    }
    .info-text {
      color: #000000;
      font-size: 14px;
      line-height: 1.6;
      font-weight: 500;
      text-align: center;
    }
    .reveal-button {
      background: #FF6B9D;
      width: 100%;
      font-size: 16px;
      padding: 20px 32px;
      position: relative;
      overflow: hidden;
      animation: pulse-attention 2s ease-in-out infinite, glow-border 1.5s ease-in-out infinite alternate;
    }
    .reveal-button::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
      animation: shimmer 2s ease-in-out infinite;
    }
    .reveal-button:hover {
      background: #FF5A8A;
      animation: none;
      transform: translate(2px, 2px);
      box-shadow: 2px 2px 0 #000000;
    }
    .reveal-button:hover::before {
      animation: none;
    }
    @keyframes pulse-attention {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.03); }
    }
    @keyframes shimmer {
      0% { left: -100%; }
      50%, 100% { left: 100%; }
    }
    @keyframes glow-border {
      0% { box-shadow: 4px 4px 0 #000000, 0 0 0 rgba(255,107,157,0); }
      100% { box-shadow: 4px 4px 0 #000000, 0 0 20px rgba(255,107,157,0.6); }
    }
  </style>
</head>
<body>
  <div class="container">
    ${content}
    <div class="footer">
      <div class="footer-logo">DestructNote</div>
    </div>
  </div>
  ${includeDecryption ? `
  <script>
    // AES-256-CTR Decryption in JavaScript (same implementation as mobile app)
    const SBOX = new Uint8Array([
      0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
      0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
      0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
      0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
      0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
      0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
      0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
      0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
      0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
      0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
      0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
      0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
      0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
      0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
      0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
      0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
    ]);
    const RCON = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]);

    const gmul = (a, b) => {
      let p = 0;
      for (let i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        const hi = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi) a ^= 0x1b;
        b >>= 1;
      }
      return p;
    };

    const expandKey = (key) => {
      const Nk = 8, Nr = 14, Nb = 4;
      const W = new Array((Nr + 1) * Nb);
      for (let i = 0; i < Nk; i++) {
        W[i] = new Uint8Array([key[4*i], key[4*i+1], key[4*i+2], key[4*i+3]]);
      }
      for (let i = Nk; i < (Nr + 1) * Nb; i++) {
        let temp = new Uint8Array(W[i-1]);
        if (i % Nk === 0) {
          const t = temp[0];
          temp[0] = SBOX[temp[1]] ^ RCON[i/Nk - 1];
          temp[1] = SBOX[temp[2]];
          temp[2] = SBOX[temp[3]];
          temp[3] = SBOX[t];
        } else if (Nk > 6 && i % Nk === 4) {
          for (let j = 0; j < 4; j++) temp[j] = SBOX[temp[j]];
        }
        W[i] = new Uint8Array(4);
        for (let j = 0; j < 4; j++) W[i][j] = W[i-Nk][j] ^ temp[j];
      }
      return W;
    };

    const aesBlock = (block, roundKeys) => {
      const state = new Uint8Array(16);
      for (let i = 0; i < 16; i++) state[i] = block[i];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) state[i * 4 + j] ^= roundKeys[i][j];
      for (let round = 1; round <= 14; round++) {
        for (let i = 0; i < 16; i++) state[i] = SBOX[state[i]];
        let t = state[1]; state[1] = state[5]; state[5] = state[9]; state[9] = state[13]; state[13] = t;
        t = state[2]; state[2] = state[10]; state[10] = t; t = state[6]; state[6] = state[14]; state[14] = t;
        t = state[15]; state[15] = state[11]; state[11] = state[7]; state[7] = state[3]; state[3] = t;
        if (round < 14) {
          for (let i = 0; i < 4; i++) {
            const s0 = state[i*4], s1 = state[i*4+1], s2 = state[i*4+2], s3 = state[i*4+3];
            state[i*4] = gmul(s0, 2) ^ gmul(s1, 3) ^ s2 ^ s3;
            state[i*4+1] = s0 ^ gmul(s1, 2) ^ gmul(s2, 3) ^ s3;
            state[i*4+2] = s0 ^ s1 ^ gmul(s2, 2) ^ gmul(s3, 3);
            state[i*4+3] = gmul(s0, 3) ^ s1 ^ s2 ^ gmul(s3, 2);
          }
        }
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) state[i * 4 + j] ^= roundKeys[round * 4 + i][j];
      }
      return state;
    };

    const incrementCounter = (counter) => {
      for (let i = 15; i >= 0; i--) { counter[i]++; if (counter[i] !== 0) break; }
    };

    const aesCtr = (data, key, nonce) => {
      const roundKeys = expandKey(key);
      const result = new Uint8Array(data.length);
      const counter = new Uint8Array(16);
      for (let i = 0; i < 12; i++) counter[i] = nonce[i];
      for (let i = 0; i < data.length; i += 16) {
        const keystream = aesBlock(counter, roundKeys);
        const blockSize = Math.min(16, data.length - i);
        for (let j = 0; j < blockSize; j++) result[i + j] = data[i + j] ^ keystream[j];
        incrementCounter(counter);
      }
      return result;
    };

    const base64ToUint8Array = (base64) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    };

    const uint8ArrayToString = (bytes) => new TextDecoder().decode(bytes);

    const decryptContent = (encryptedBase64, keyBase64) => {
      const key = base64ToUint8Array(keyBase64);
      const combined = base64ToUint8Array(encryptedBase64);
      const nonce = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      const plaintext = aesCtr(ciphertext, key, nonce);
      return uint8ArrayToString(plaintext);
    };

    const escapeHtml = (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    const linkifyText = (text) => {
      const escaped = escapeHtml(text);
      const urlRegex = /(https?:\\/\\/[^\\s<>"']+)/g;
      return escaped.replace(urlRegex, (url) => '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>');
    };

    // Main reveal and decryption logic
    window.onload = function() {
      const noteId = '${noteId}';
      const encryptedContent = '${encryptedContent.replace(/'/g, "\\'")}';
      const encryptionKey = window.location.hash.slice(1);

      const revealSection = document.getElementById('reveal-section');
      const revealBtn = document.getElementById('reveal-btn');
      const noteContentEl = document.getElementById('note-content');
      const loadingEl = document.getElementById('loading');
      const noteBoxEl = document.getElementById('note-box');
      const errorEl = document.getElementById('decryption-error');
      const destroyedBox = document.getElementById('destroyed-box');

      // Check if we have encryption key
      if (!encryptionKey) {
        console.error('[Decryption] No encryption key found in URL hash');
        if (revealSection) revealSection.style.display = 'none';
        if (errorEl) {
          errorEl.style.display = 'block';
          errorEl.querySelector('.error-text').textContent = 'Missing decryption key in URL';
        }
        return;
      }

      // Handle reveal button click
      if (revealBtn) {
        revealBtn.addEventListener('click', async function() {
          // Disable button and show loading
          revealBtn.disabled = true;
          revealBtn.textContent = 'Revealing...';

          try {
            // Call server to mark note as viewed
            const response = await fetch('/note/' + noteId + '/reveal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
              throw new Error('Failed to reveal note');
            }

            // Hide reveal section, show loading
            if (revealSection) revealSection.style.display = 'none';
            if (loadingEl) loadingEl.style.display = 'flex';

            // Decrypt content
            const decrypted = decryptContent(encryptedContent, encryptionKey);

            // Show decrypted content
            if (noteContentEl) noteContentEl.innerHTML = linkifyText(decrypted);
            if (loadingEl) loadingEl.style.display = 'none';
            if (noteBoxEl) noteBoxEl.style.display = 'block';
            if (destroyedBox) destroyedBox.style.display = 'block';

          } catch (e) {
            console.error('[Reveal] Failed:', e);
            revealBtn.disabled = false;
            revealBtn.innerHTML = '<span>👁️</span> Reveal Secret Note';
            if (errorEl) {
              errorEl.style.display = 'block';
              errorEl.querySelector('.error-text').textContent = 'Failed to reveal note. Please try again.';
            }
          }
        });
      }
    };
  </script>
  ` : ''}
</body>
</html>
`;

  try {
    const note = await db.note.findUnique({
      where: { id },
    });

    // Note doesn't exist
    if (!note) {
      console.log(`❌ [Notes] Note not found: ${id}`);
      return c.html(renderPage("Not Found", `
        <div class="header">
          <div class="logo-box">
            <img src="/uploads/logo-destructnote.png" alt="DestructNote">
          </div>
          <div class="header-text">
            <h1>Not Found</h1>
            <p class="subtitle">This note does not exist or the link is invalid</p>
          </div>
        </div>
        <div class="error-box">
          <span>⚠️</span>
          <span class="error-text">Invalid Link</span>
        </div>
        `, "#E74C3C"), 404);
    }

    // Note has already been viewed
    if (note.viewed) {
      console.log(`🔒 [Notes] Note already viewed: ${id}`);
      return c.html(renderPage("Note Destroyed", `
        <div class="header">
          <div class="logo-box">
            <img src="/uploads/logo-destructnote.png" alt="DestructNote">
          </div>
          <div class="header-text">
            <h1>Note Destroyed</h1>
            <p class="subtitle">This note has self-destructed</p>
          </div>
        </div>
        <div class="error-box">
          <span>💥</span>
          <span class="error-text">Self-Destruct Complete</span>
        </div>
        `, "#FF8A00"), 410);
    }

    // Note exists and hasn't been viewed - show reveal button first
    // This prevents link preview bots from destroying the note
    console.log(`📝 [Notes] Showing reveal page for note: ${id}`);

    // Return page with reveal button - note is NOT marked as viewed yet
    return c.html(renderPage("Secret Note", `
      <div class="header">
        <div class="logo-box">
          <img src="/uploads/logo-destructnote.png" alt="DestructNote">
        </div>
        <div class="header-text">
          <h1>Secret Note</h1>
          <p class="subtitle">Self-destructs after viewing</p>
        </div>
      </div>
      <div class="encryption-badge">
        <span>🔒</span>
        <span class="encryption-badge-text">End-to-end encrypted</span>
      </div>
      <div class="warning-box">
        <span>⚠️</span>
        <span class="warning-text">This note will self-destruct after you read it!</span>
      </div>
      <div id="reveal-section">
        <div class="info-box">
          <p class="info-text">Someone sent you a secret note. Once you reveal it, the note will be permanently destroyed and cannot be viewed again.</p>
        </div>
        <div class="center">
          <button id="reveal-btn" class="button reveal-button">
            <span>👁️</span> Reveal Secret Note
          </button>
        </div>
      </div>
      <div id="loading" class="loading" style="display:none;">Decrypting...</div>
      <div id="note-box" class="note-box" style="display:none;">
        <p id="note-content" class="note-content"></p>
      </div>
      <div id="decryption-error" class="error-box" style="display:none;">
        <span>⚠️</span>
        <span class="error-text">Decryption failed</span>
      </div>
      <div id="destroyed-box" class="destroyed-box" style="display:none;">
        <p class="destroyed-text">This note has been destroyed</p>
      </div>
    `, "#00FF85", true, note.content, id));
  } catch (error) {
    console.error("❌ [Notes] Error retrieving note:", error);
    return c.html(renderPage("Error", `
      <div class="header">
        <div class="logo-box">
          <img src="/uploads/logo-destructnote.png" alt="DestructNote">
        </div>
        <div class="header-text">
          <h1>Error</h1>
          <p class="subtitle">Something went wrong</p>
        </div>
      </div>
    `, "#A855F7"), 500);
  }
});

// ============================================
// Reveal endpoint - marks note as viewed when user clicks reveal button
// This prevents link preview bots from destroying notes
// ============================================
app.post("/note/:id/reveal", async (c) => {
  const id = c.req.param("id");
  console.log(`👁️ [Notes] Reveal requested for note: ${id}`);

  try {
    const note = await db.note.findUnique({
      where: { id },
    });

    if (!note) {
      console.log(`❌ [Notes] Note not found for reveal: ${id}`);
      return c.json({ error: "Note not found" }, 404);
    }

    if (note.viewed) {
      console.log(`🔒 [Notes] Note already viewed: ${id}`);
      return c.json({ error: "Note already viewed" }, 410);
    }

    // Mark as viewed (self-destruct)
    await db.note.update({
      where: { id },
      data: { viewed: true },
    });

    console.log(`💥 [Notes] Note revealed and marked for destruction: ${id}`);

    // Delete the note content after a short delay
    setTimeout(async () => {
      try {
        await db.note.update({
          where: { id },
          data: { content: "[DESTROYED]" },
        });
        console.log(`🗑️ [Notes] Note content destroyed: ${id}`);
      } catch {
        // Note might have been deleted already
      }
    }, 5000);

    return c.json({ success: true });
  } catch (error) {
    console.error("❌ [Notes] Error revealing note:", error);
    return c.json({ error: "Failed to reveal note" }, 500);
  }
});

// Health check endpoint
// Used by load balancers and monitoring tools to verify service is running
app.get("/health", (c) => {
  console.log("💚 Health check requested");
  return c.json({ status: "ok" });
});

// Start the server
console.log("⚙️  Starting server...");
const server = serve({ fetch: app.fetch, port: Number(env.PORT) }, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📍 Environment: ${env.NODE_ENV}`);
  console.log(`🚀 Server is running on port ${env.PORT}`);
  console.log(`🔗 Base URL: http://localhost:${env.PORT}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n📚 Available endpoints:");
  console.log("  🔐 Auth:     /api/auth/*");
  console.log("  📤 Upload:   POST /api/upload/image");
  console.log("  📝 Sample:   GET/POST /api/sample");
  console.log("  💚 Health:   GET /health");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
});

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down server...");
  await db.$disconnect();
  await db.$connect();
  await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  await db.$disconnect();
  console.log("Successfully shutdown server");
  server.close();
  process.exit(0);
};

// Handle SIGINT (ctrl+c).
process.on("SIGINT", async () => {
  console.log("SIGINT received. Cleaning up...");
  await shutdown();
});

// Handle SIGTERM (normal shutdown).
process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Cleaning up...");
  await shutdown();
});
