// GET  /api/acesso -> se o painel já tem senhas; para analista logado, devolve também a chave do link
// POST /api/acesso {senhas:{Fernanda,Adriano,Rolison}, novaChave} -> define as senhas
//      (na primeira vez qualquer um configura; depois, só um analista logado)
const { acesso, lerCorpo, erro, gravarConfig } = require("./_db");
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const a = await acesso(req);
    if (req.method === "GET") return res.status(200).json({ configurado: a.cfg.configurado, editor: a.editor, leitura: a.editor ? a.cfg.leitura : undefined });
    if (req.method !== "POST") return res.status(405).json({ erro: "Método não aceito." });
    if (a.cfg.configurado && !a.editor) return res.status(403).json({ erro: "As senhas já foram definidas. Entre como analista para mudar." });
    const b = await lerCorpo(req);
    const senhas = b.senhas || {};
    let chave = "";
    if (b.chave) {
      chave = String(b.chave).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (chave.length < 6 || ["api", "index", "analista"].includes(chave)) return res.status(400).json({ erro: "O final do link precisa ter pelo menos 6 letras ou números." });
    }
    if (!chave && !a.cfg.configurado && !Object.values(senhas).some((x) => String(x || "").trim().length >= 4)) return res.status(400).json({ erro: "Defina pelo menos uma senha com 4 letras ou mais." });
    const cfg = await gravarConfig(senhas, !!b.novaChave, chave);
    res.status(200).json({ ok: true, leitura: cfg.leitura, analistas: Object.values(cfg.analistas).map((x) => x.nome) });
  } catch (e) { erro(res, e); }
};
