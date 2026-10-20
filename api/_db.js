// Banco (Upstash Redis pela API REST) e checagem de acesso.
const URL_DB = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
// SENHAS no Vercel: "Fernanda:senha1;Adriano:senha2;Rolison:senha3"
function analistas() {
  const out = {};
  for (const par of String(process.env.SENHAS || "").split(/[;\n]/)) {
    const i = par.indexOf(":");
    if (i > 0) out[norm(par.slice(0, i))] = { nome: par.slice(0, i).trim(), senha: par.slice(i + 1).trim() };
  }
  return out;
}
function acesso(req) {
  const h = req.headers || {};
  const dec = (v) => { try { return decodeURIComponent(v || ""); } catch (e) { return v || ""; } };
  const nome = dec(h["x-nome"]), senha = dec(h["x-senha"]), chave = dec(h["x-chave"]);
  const a = analistas()[norm(nome)];
  if (a && senha && senha === a.senha) return { editor: true, leitor: true, nome: a.nome };
  const leitura = String(process.env.LEITURA || "").trim();
  if (leitura && chave === leitura) return { editor: false, leitor: true };
  return { editor: false, leitor: false, tentouSenha: !!senha };
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

module.exports = { pipe, cmd, acesso, lerCorpo, erro };
