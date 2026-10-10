/* -------------------------------------------------------------------------- */
/*  "Have we seen this IP before?" store                                      */
/*                                                                            */
/*  claimIp(ip)  -> true  if the IP is NEW (and remembers it, atomically)     */
/*               -> false if the IP was already seen (skip the email)         */
/*  releaseIp(ip) forgets an IP (used when the email fails to send, so the    */
/*                visitor can trigger a notification again next time).        */
/*                                                                            */
/*  Storage, in order of preference:                                          */
/*   1. Upstash Redis / Vercel KV over REST (needed on Vercel, because        */
/*      serverless functions have no persistent disk). Env vars:              */
/*        UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN                   */
/*        (or KV_REST_API_URL + KV_REST_API_TOKEN from Vercel KV)             */
/*   2. A local JSON file (.seen-ips.json) - fine for `node server.js`.       */
/*                                                                            */
/*  Optional env: VISITOR_IP_TTL_DAYS - forget an IP after N days so a        */
/*  returning visitor eventually notifies you again. Default 0 = never.       */
/* -------------------------------------------------------------------------- */
import fs from 'fs';
import path from 'path';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const TTL_DAYS = Number(process.env.VISITOR_IP_TTL_DAYS || 0);
const KEY_PREFIX = 'portfolio:seen-ip:';
const FILE = path.join(process.cwd(), '.seen-ips.json');

const redis = async (command) => {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
};

/* ---- local file fallback ---- */
const readFile = () => {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return {}; }
};
const writeFile = (data) => {
  try { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); } catch (err) {
    console.error('Could not write', FILE, err.message);
  }
};

let warned = false;
const warnOnce = () => {
  if (warned) return;
  warned = true;
  console.warn(
    '[seen-ip] No Redis/KV configured - using a local file. On Vercel this does NOT persist, ' +
    'so set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.'
  );
};

export async function claimIp(ip) {
  const clean = String(ip || '').trim();
  // Can't dedupe without an address - let the email through.
  if (!clean || clean.toLowerCase() === 'unknown') return true;

  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const cmd = ['SET', KEY_PREFIX + clean, new Date().toISOString(), 'NX'];
      if (TTL_DAYS > 0) cmd.push('EX', String(Math.round(TTL_DAYS * 86400)));
      // SET ... NX returns "OK" only when the key did not exist yet.
      return (await redis(cmd)) === 'OK';
    } catch (err) {
      console.error('[seen-ip] Redis failed, falling back to local file:', err.message);
    }
  } else {
    warnOnce();
  }

  const data = readFile();
  const seenAt = data[clean] ? new Date(data[clean]).getTime() : 0;
  const expired = TTL_DAYS > 0 && seenAt && Date.now() - seenAt > TTL_DAYS * 86400000;
  if (seenAt && !expired) return false;
  data[clean] = new Date().toISOString();
  writeFile(data);
  return true;
}

export async function releaseIp(ip) {
  const clean = String(ip || '').trim();
  if (!clean) return;
  if (REDIS_URL && REDIS_TOKEN) {
    try { await redis(['DEL', KEY_PREFIX + clean]); return; } catch (_) { /* fall through */ }
  }
  const data = readFile();
  if (data[clean]) {
    delete data[clean];
    writeFile(data);
  }
}