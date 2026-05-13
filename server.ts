
import express, { Request, Response } from "express";
import path from "path";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Gemini API Setup
const rawKeys = process.env.GEMINI_API_KEYS || "";
const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
let currentKeyIndex = 0;

function getAI() {
  if (apiKeys.length === 0) throw new Error("GEMINI_API_KEYS not configured on server.");
  const apiKey = apiKeys[currentKeyIndex];
  return new GoogleGenAI({ apiKey });
}

function rotateKey() {
  if (apiKeys.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    return true;
  }
  return false;
}

// Initialize Supabase Admin client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
);

app.use(bodyParser.json());

// Payme Error Interface
interface PaymeError {
  code: number;
  message: {
    ru: string;
    uz: string;
    en: string;
  };
  data?: string;
}

function createError(code: number, ru: string, uz: string, en: string, data?: string): PaymeError {
  return {
    code,
    message: { ru, uz, en },
    data
  };
}

// API routes go here
app.get("/api/health", (req, res) => {
  let paymeKey = (process.env.PAYME_KEY || process.env.VITE_PAYME_KEY || "").trim();
  paymeKey = paymeKey.replace(/['"\s\r\n]/g, '');
  paymeKey = paymeKey.replace(/\\%/g, '%');
  paymeKey = paymeKey.replace(/\\&/g, '&');
  paymeKey = paymeKey.replace(/\\\?/g, '?');

  const authHeader = (req.headers.authorization || 
                    req.headers['x-authorization'] || 
                    req.headers['http-authorization'] || '') as string;
  
  res.json({ 
    status: "ok", 
    environment: process.env.NODE_ENV, 
    port: PORT,
    paymeKeySet: !!paymeKey,
    paymeKeyLen: paymeKey.length,
    hasAuthHeader: !!authHeader,
    authHeaderReceived: typeof authHeader === 'string' ? `${authHeader.substring(0, 15)}...` : null
  });
});

// Payme Merchant API Handler
/**
 * PAYME MERCHANT API HANDLER
 */
app.post("/api/generate", async (req: Request, res: Response) => {
  const { prompt, type, config: clientConfig, contents: clientContents } = req.body;
  
  if (!type) {
    return res.status(400).json({ error: "Type is required" });
  }

  const handleGeneration = async () => {
    const ai = getAI();
    let modelName = "gemini-3-flash-preview"; 
    let contents = clientContents || prompt;
    let config = clientConfig || {};

    if (type === 'image') modelName = 'gemini-2.5-flash-image';
    if (type === 'tts') modelName = 'gemini-2.5-flash-preview-tts';

    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents,
      config: config
    });

    return response;
  };

  try {
    let response;
    let success = false;
    let attempts = 0;
    const maxAttempts = apiKeys.length || 1;

    while (!success && attempts < maxAttempts) {
      try {
        response = await handleGeneration();
        success = true;
      } catch (error: any) {
        attempts++;
        const status = error?.status || error?.error?.code || 500;
        if (status === 429 && rotateKey()) {
          console.warn(`Quota exceeded, rotated key to index ${currentKeyIndex}`);
          continue;
        }
        throw error;
      }
    }

    res.json(response);
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(error?.status || 500).json({ 
      error: error?.message || "Internal server error during generation",
      status: error?.status
    });
  }
});

app.post(["/api/payme", "/api/webhooks/payme"], async (req: Request, res: Response) => {
  const { method, params, id } = req.body || {};

  if (!method) {
    return res.json({ jsonrpc: "2.0", id: id || null, error: createError(-32600, "Invalid Request", "Noto'g'ri so'rov", "Invalid Request") });
  }

  // Basic Auth Check
  // Check both PAYME_KEY and VITE_PAYME_KEY for flexibility
  let paymeKey = (process.env.PAYME_KEY || process.env.VITE_PAYME_KEY || "").trim();
  
  // Aggressive cleanup: remove all spaces, newlines, and quotes that panels often add
  paymeKey = paymeKey.replace(/['"\s\r\n]/g, '');
  
  // Hostinger/hPanel fix: unescape backslashed special characters (e.g. \% -> %)
  paymeKey = paymeKey.replace(/\\%/g, '%');
  paymeKey = paymeKey.replace(/\\&/g, '&');
  paymeKey = paymeKey.replace(/\\\?/g, '?');

  if (!paymeKey) {
    console.error("[Payme] Error: PAYME_KEY is not defined in environment");
    return res.json({ 
      jsonrpc: "2.0", id, 
      error: createError(-32504, "Ошибка конфигурации сервера", "Server konfiguratsiyasi xatosi", "Server configuration error")
    });
  }

  // Support fallbacks for headers that proxies like Hostinger/Nginx might rename
  const authHeaderRaw = req.headers.authorization || 
                        req.headers['x-authorization'] || 
                        req.headers['http-authorization'] || "";
  
  const authHeader = Array.isArray(authHeaderRaw) ? authHeaderRaw[0] : (authHeaderRaw as string);

  const expectedToken = Buffer.from(`Paycom:${paymeKey}`).toString('base64');
  const receivedToken = (authHeader || "").split(/\s+/).pop() || "";

  if (!authHeader || receivedToken !== expectedToken) {
    const received = receivedToken ? `${receivedToken.substring(0, 10)}...` : "none";
    const expected = `${expectedToken.substring(0, 10)}...`;
    console.warn(`[Payme] Auth Failure. Method: ${method}, Expected Token: ${expected}, Received Token: ${received}`);
    
    return res.json({ 
      jsonrpc: "2.0", id, 
      error: createError(-32504, "Ошибка авторизации", "Avtorizatsiya xatosi", "Error auth")
    });
  }

  try {
    switch (method) {
      case "CheckPerformTransaction": return await handleCheckPerform(params, id, res);
      case "CreateTransaction": return await handleCreateTransaction(params, id, res);
      case "PerformTransaction": return await handlePerformTransaction(params, id, res);
      case "CancelTransaction": return await handleCancelTransaction(params, id, res);
      case "CheckTransaction": return await handleCheckTransaction(params, id, res);
      case "GetStatement": return await handleGetStatement(params, id, res);
      default:
        return res.json({ 
          jsonrpc: "2.0", id, 
          error: createError(-32601, "Метод не найден", "Metod topilmadi", "Method not found")
        });
    }
  } catch (err) {
    console.error("Payme API Error:", err);
    return res.json({ 
      jsonrpc: "2.0", id, 
      error: createError(-31008, "Внутренняя ошибка сервера", "Ichki server xatosi", "Internal Server Error")
    });
  }
});

// --- Payme Protocol Method Handlers ---

async function handleCheckPerform(params: any, id: any, res: Response) {
  const { amount, account } = params || {};
  const orderId = account?.order_id;
  if (!orderId) return res.json({ jsonrpc: "2.0", id, error: createError(-31050, "Order ID missing", "Order ID topilmadi", "Order ID missing", "order_id") });

  const { data: payment } = await supabase.from('payments').select('*').eq('order_id', orderId).maybeSingle();
  if (!payment) return res.json({ jsonrpc: "2.0", id, error: createError(-31050, "Order not found", "Buyurtma topilmadi", "Order not found", "order_id") });
  if (payment.status === 'paid') return res.json({ jsonrpc: "2.0", id, error: createError(-31050, "Already paid", "Allaqachon to'langan", "Already paid", "order_id") });

  // User database already stores amount in Tiyin, so we compare directly
  if (Number(payment.amount) !== Number(amount)) {
    return res.json({ 
      jsonrpc: "2.0", id, 
      error: createError(-31050, "Incorrect amount", "Noto'g'ri summa", "Incorrect amount", "amount") 
    });
  }

  return res.json({ 
    jsonrpc: "2.0", id, 
    result: { 
      allow: true,
      detail: {
        receipt_type: 0 // Default receipt type
      }
    } 
  });
}

async function handleCreateTransaction(params: any, id: any, res: Response) {
  const { id: paymeId, time, account } = params || {};
  const orderId = account?.order_id;
  if (!orderId) return res.json({ jsonrpc: "2.0", id, error: createError(-31050, "Order ID missing", "Order ID topilmadi", "Order ID missing", "order_id") });
  
  const { data: payment } = await supabase.from('payments').select('*').eq('order_id', orderId).maybeSingle();
  if (!payment) return res.json({ jsonrpc: "2.0", id, error: createError(-31050, "Order not found", "Buyurtma topilmadi", "Order not found", "order_id") });

  if (payment.payme_transaction_id === paymeId) {
    if (payment.status === 'cancelled') return res.json({ jsonrpc: "2.0", id, error: createError(-31008, "Cancelled", "Bekor qilingan", "Cancelled") });
    return res.json({ 
      jsonrpc: "2.0", id, 
      result: { 
        create_time: Number(payment.payme_time), 
        transaction: payment.id.toString(), 
        state: payment.status === 'paid' ? 2 : 1 
      } 
    });
  }

  if (payment.payme_transaction_id) return res.json({ jsonrpc: "2.0", id, error: createError(-31099, "Occupied", "Band", "Occupied") });

  await supabase.from('payments').update({ payme_transaction_id: paymeId, status: 'pending', payme_time: time }).eq('order_id', orderId);
  return res.json({ jsonrpc: "2.0", id, result: { create_time: Number(time), transaction: payment.id.toString(), state: 1 } });
}

async function handlePerformTransaction(params: any, id: any, res: Response) {
  const { id: paymeId } = params;
  const { data: payment } = await supabase.from('payments').select('*').eq('payme_transaction_id', paymeId).maybeSingle();
  if (!payment) return res.json({ jsonrpc: "2.0", id, error: createError(-31003, "Not found", "Topilmadi", "Not found") });

  if (payment.status === 'paid') return res.json({ jsonrpc: "2.0", id, result: { perform_time: new Date(payment.updated_at).getTime(), transaction: payment.id.toString(), state: 2 } });
  if (payment.status === 'cancelled') return res.json({ jsonrpc: "2.0", id, error: createError(-31008, "Cancelled", "Bekor qilingan", "Cancelled") });

  const months = payment.package_type === '1_month' ? 1 : payment.package_type === '3_months' ? 3 : 6;
  const { data: profile } = await supabase.from('profiles').select('subscription_expires_at').eq('id', payment.user_id).single();
  let newExpiry = new Date();
  if (profile?.subscription_expires_at && new Date(profile.subscription_expires_at) > new Date()) newExpiry = new Date(profile.subscription_expires_at);
  newExpiry.setMonth(newExpiry.getMonth() + months);

  await supabase.from('profiles').update({ 
    subscription_tier: 'PREMIUM', 
    subscription_expires_at: newExpiry.toISOString(), 
    subscription_id: payment.id,
    is_pro: true 
  }).eq('id', payment.user_id);
  const now = Date.now();
  await supabase.from('payments').update({ 
    status: 'paid', 
    perform_time: now, 
    updated_at: new Date(now).toISOString() 
  }).eq('id', payment.id);

  return res.json({ jsonrpc: "2.0", id, result: { perform_time: now, transaction: payment.id.toString(), state: 2 } });
}

async function handleCancelTransaction(params: any, id: any, res: Response) {
  const { id: paymeId, reason } = params;
  const { data: payment } = await supabase.from('payments').select('*').eq('payme_transaction_id', paymeId).maybeSingle();
  if (!payment) return res.json({ jsonrpc: "2.0", id, error: createError(-31003, "Not found", "Topilmadi", "Not found") });

  if (payment.status === 'cancelled') {
    const s = (payment.cancel_reason >= 4) ? -2 : -1;
    return res.json({ jsonrpc: "2.0", id, result: { cancel_time: new Date(payment.updated_at).getTime(), transaction: payment.id.toString(), state: s } });
  }

  if (payment.status === 'paid') {
    await supabase.from('profiles').update({ 
      subscription_tier: 'FREE', 
      subscription_expires_at: null, 
      subscription_id: null,
      is_pro: false 
    }).eq('id', payment.user_id);
    const now = Date.now();
    await supabase.from('payments').update({ 
      status: 'cancelled', 
      cancel_reason: reason, 
      cancel_time: now, 
      updated_at: new Date(now).toISOString() 
    }).eq('id', payment.id);
    return res.json({ jsonrpc: "2.0", id, result: { cancel_time: now, transaction: payment.id.toString(), state: -2 } });
  }

  const now = Date.now();
  await supabase.from('payments').update({ 
    status: 'cancelled', 
    cancel_reason: reason, 
    cancel_time: now, 
    updated_at: new Date(now).toISOString() 
  }).eq('id', payment.id);
  return res.json({ jsonrpc: "2.0", id, result: { cancel_time: now, transaction: payment.id.toString(), state: -1 } });
}

async function handleCheckTransaction(params: any, id: any, res: Response) {
  const { id: paymeId } = params;
  const { data: payment } = await supabase.from('payments').select('*').eq('payme_transaction_id', paymeId).maybeSingle();
  if (!payment) return res.json({ jsonrpc: "2.0", id, error: createError(-31003, "Not found", "Topilmadi", "Not found") });

  let s = 1;
  let performTime = 0;
  let cancelTime = 0;
  let reason = null;

  if (payment.status === 'paid') {
    s = 2;
    performTime = Number(payment.perform_time || new Date(payment.updated_at).getTime());
  } else if (payment.status === 'cancelled') {
    const cReason = Number(payment.cancel_reason || 0);
    s = (cReason >= 4) ? -2 : -1;
    cancelTime = Number(payment.cancel_time || new Date(payment.updated_at).getTime());
    reason = cReason;
    
    // Payme Sandbox fix: if state is -2 (performed then cancelled), 
    // perform_time MUST NOT be 0. We'll use the stored perform_time or fallback.
    if (s === -2) {
      performTime = Number(payment.perform_time || (cancelTime - 1)); 
    }
  }

  return res.json({
    jsonrpc: "2.0", id, result: {
      create_time: Number(payment.payme_time || 0),
      perform_time: performTime,
      cancel_time: cancelTime,
      transaction: payment.id.toString(),
      state: s,
      reason: reason
    }
  });
}

async function handleGetStatement(params: any, id: any, res: Response) {
  const { from, to } = params;
  const { data: ps } = await supabase.from('payments').select('*').gte('payme_time', from).lte('payme_time', to);
  const trans = (ps || []).map(p => {
    let s = 1;
    let pt = 0;
    let ct = 0;
    let r = null;
    
    if (p.status === 'paid') {
      s = 2;
      pt = Number(p.perform_time || new Date(p.updated_at).getTime());
    } else if (p.status === 'cancelled') {
      const cReason = Number(p.cancel_reason || 0);
      s = (cReason >= 4) ? -2 : -1;
      ct = Number(p.cancel_time || new Date(p.updated_at).getTime());
      r = cReason;
      if (s === -2) pt = Number(p.perform_time || (ct - 1));
    }
    
    return {
      id: p.payme_transaction_id, 
      time: Number(p.payme_time), 
      amount: Number(p.amount), // Amount in tiyin from DB
      account: { order_id: p.order_id },
      create_time: Number(p.payme_time), 
      perform_time: pt,
      cancel_time: ct,
      transaction: p.id.toString(), 
      state: s, 
      reason: r
    };
  });
  return res.json({ jsonrpc: "2.0", id, result: { transactions: trans } });
}

// --- Vite and SPA Fallback ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    console.log(`[Server] Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("(.*)", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`[Server] Listening on 0.0.0.0:${PORT} (NODE_ENV=${process.env.NODE_ENV})`);
  });
}

startServer();
