// Banco (Upstash Redis pela API REST) e checagem de acesso.
// aceita qualquer prefixo que a Vercel tenha dado ao conectar o Upstash (KV_, STORAGE_, ARMAZENAR_...)
const acharEnv = (fim) => process.env["KV_" + fim] || process.env["UPSTASH_REDIS_" + fim.replace("_API", "")] ||
  Object.entries(process.env).filter(([k, v]) => k.endsWith(fim) && !k.includes("READ_ONLY") && v).map(([, v]) => v)[0];
const URL_DB = acharEnv("REST_API_URL");
const TOKEN = acharEnv("REST_API_TOKEN");

async function pipe(cmds) {
  if (!URL_DB || !TOKEN) throw Object.assign(new Error("Banco não configurado no Vercel (falta conectar o Upstash Redis em Storage)."), { status: 500 });
  const r = await fetch(URL_DB.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw Object.assign(new Error("Erro no banco: " + r.status + " " + (await r.text()).slice(0, 200)), { status: 502 });
  const out = await r.json();
  return out.map((x) => {
    if (x.error) throw Object.assign(new Error("Erro no banco: " + x.error), { status: 502 });
    return x.result;
  });
}
const cmd = async (...c) => (await pipe([c]))[0];

const crypto = require("crypto");
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
const hashSenha = (senha, sal) => crypto.scryptSync(String(senha), sal, 32).toString("hex");
const iguais = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// As senhas e a chave do link ficam no próprio banco (configuradas pelo painel na primeira vez).
// Se existirem as variáveis SENHAS / LEITURA no Vercel, elas valem também.
async function lerConfig() {
  const cfg = JSON.parse((await cmd("GET", "painel:acesso")) || "null") || { analistas: {}, leitura: "" };
  for (const par of String(process.env.SENHAS || "").split(/[;\n]/)) {
    const i = par.indexOf(":");
    if (i > 0) { const nome = par.slice(0, i).trim(), sal = "env"; cfg.analistas[norm(nome)] = { nome, sal, hash: hashSenha(par.slice(i + 1).trim(), sal) }; }
  }
  if (process.env.LEITURA) cfg.leitura = String(process.env.LEITURA).trim();
  cfg.configurado = Object.keys(cfg.analistas).length > 0;
  return cfg;
}
async function gravarConfig(senhas, novaChave) {
  const atual = JSON.parse((await cmd("GET", "painel:acesso")) || "null") || { analistas: {}, leitura: "" };
  for (const [nome, senha] of Object.entries(senhas || {})) {
    if (!String(senha || "").trim()) continue;
    const sal = crypto.randomBytes(8).toString("hex");
    atual.analistas[norm(nome)] = { nome: nome.trim(), sal, hash: hashSenha(String(senha).trim(), sal) };
  }
  if (!atual.leitura || novaChave) atual.leitura = "v" + crypto.randomBytes(6).toString("hex");
  await cmd("SET", "painel:acesso", JSON.stringify(atual));
  return atual;
}
async function acesso(req) {
  const h = req.headers || {};
  const dec = (v) => { try { return decodeURIComponent(v || ""); } catch (e) { return v || ""; } };
  const nome = dec(h["x-nome"]), senha = dec(h["x-senha"]), chave = dec(h["x-chave"]);
  const cfg = await lerConfig();
  const a = cfg.analistas[norm(nome)];
  if (a && senha && iguais(hashSenha(senha, a.sal), a.hash)) return { editor: true, leitor: true, nome: a.nome, cfg };
  if (cfg.leitura && chave && iguais(chave, cfg.leitura)) return { editor: false, leitor: true, cfg };
  return { editor: false, leitor: false, tentouSenha: !!senha, configurado: cfg.configurado, cfg };
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const txt = Buffer.concat(chunks).toString("utf8");
  return txt ? JSON.parse(txt) : {};
}
function erro(res, e) { res.status(e.status || 500).json({ erro: e.message || "Erro inesperado." }); }

module.exports = { pipe, cmd, acesso, lerCorpo, erro, gravarConfig };
