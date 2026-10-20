// GET  /api/estado          -> o painel guardado (para quem tem o link ou a senha)
// GET  /api/estado?so=em    -> só a hora da última atualização (para saber se mudou)
// POST /api/estado {estado} -> grava o painel (só analistas com senha)
const { pipe, cmd, acesso, lerCorpo, erro } = require("./_db");
const PARTE = 400000;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const a = await acesso(req);
    if (!a.leitor) return res.status(401).json({ erro: a.tentouSenha ? "Nome ou senha incorretos." : "Acesso restrito. Use o link enviado pela equipe.", configurado: a.configurado });
    if (req.method === "GET") {
      const meta = JSON.parse((await cmd("GET", "painel:meta")) || "null");
      if ((req.query || {}).so === "em") return res.status(200).json({ em: meta ? meta.em : 0, por: meta ? meta.por : "", editor: a.editor, nome: a.nome || "" });
      if (!meta) return res.status(200).json({ estado: null, em: 0, editor: a.editor, nome: a.nome || "" });
      const partes = await pipe(Array.from({ length: meta.partes }, (_, i) => ["GET", "painel:" + meta.v + ":" + i]));
      const estado = JSON.parse(partes.join(""));
      return res.status(200).json({ estado, em: meta.em, por: meta.por, editor: a.editor, nome: a.nome || "" });
    }
    if (req.method === "POST") {
      if (!a.editor) return res.status(403).json({ erro: "Só os analistas podem atualizar o painel." });
      const b = await lerCorpo(req);
      if (!b.estado || !Array.isArray(b.estado.dias)) return res.status(400).json({ erro: "Painel inválido." });
      const txt = JSON.stringify(b.estado);
      const antigo = JSON.parse((await cmd("GET", "painel:meta")) || "null");
      const n = Math.ceil(txt.length / PARTE) || 1;
      const v = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      // grava a versão nova inteira antes de trocar o ponteiro, para ninguém ler pela metade
      for (let i = 0; i < n; i++) await cmd("SET", "painel:" + v + ":" + i, txt.slice(i * PARTE, (i + 1) * PARTE));
      const meta = { v, partes: n, em: Date.now(), por: a.nome, tamanho: txt.length };
      await cmd("SET", "painel:meta", JSON.stringify(meta));
      if (antigo && antigo.v) {
        const del = Array.from({ length: antigo.partes }, (_, i) => ["EXPIRE", "painel:" + antigo.v + ":" + i, 120]);
        if (del.length) await pipe(del);
      }
      return res.status(200).json({ ok: true, em: meta.em, por: meta.por });
    }
    res.status(405).json({ erro: "Método não aceito." });
  } catch (e) { erro(res, e); }
};
