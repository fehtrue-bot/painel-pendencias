// POST /api/baixas {itens:[{os,end}]} -> o que a carteira (acatados, executados, carteira) tem de cada OS e endereço.
// Só a Fernanda. A carteira vem da cópia publicada pelo painel da carteira (link da coordenação), no mesmo banco.
const zlib = require("zlib");
const { pipe, cmd, acesso, lerCorpo, erro } = require("./_db");
const U = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const keyOS = (v) => String(v ?? "").trim().split(".")[0].replace(/\D/g, "").replace(/^0+/, "");
const TIPOS = /^(RUA|R|AVENIDA|AV|TRAVESSA|TV|TRAV|ESTRADA|ESTR|EST|ALAMEDA|AL|PRACA|PCA|VIELA|RODOVIA|ROD|LARGO|PASSAGEM|BECO|VILA)$/;
function chaveEnd(s) {
  const w = U(s).replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const i = w.findIndex((x) => /^\d+$/.test(x));
  if (i < 1) return "";
  const rua = w.slice(0, i).filter((x, j) => !(j === 0 && TIPOS.test(x)) && !/^(DE|DA|DO|DOS|DAS|E)$/.test(x));
  return rua.join(" ") + "|" + String(Number(w[i]));
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const a = await acesso(req);
    if (!a.editor || U(a.nome).trim() !== "FERNANDA") return res.status(403).json({ erro: "Só a Fernanda usa esta parte." });
    const b = await lerCorpo(req);
    const itens = (b.itens || []).slice(0, 400);
    const meta = JSON.parse((await cmd("GET", "cart:meta")) || "null");
    if (!meta) return res.status(200).json({ carteira: null, res: {} });
    const partes = await pipe(Array.from({ length: meta.partes }, (_, i) => ["GET", `cart:p:${meta.v}:${i}`]));
    if (partes.some((p) => p == null)) return res.status(200).json({ carteira: null, res: {} });
    const z = partes.join("");
    const buf = Buffer.from(z.slice(1), "base64");
    const S = JSON.parse((z[0] === "G" ? zlib.gunzipSync(buf) : buf).toString("utf8"));
    const u = S.ult || {};
    const porOS = {}, porEnd = {};
    const add = (r, fonte) => {
      const o = { fonte, os: r.os, tss: r.tss, end: r.end, bai: r.bai, dt: r.dt, ins: r.ins, ini: r.ini, cod: r.cod, res: r.res, conta: r.conta, tr: r.tr, fora: r.fora, st: r.st };
      (porOS[keyOS(r.os)] = porOS[keyOS(r.os)] || []).push(o);
      const k = chaveEnd(r.end); if (k) (porEnd[k] = porEnd[k] || []).push(o);
    };
    (u.ex || []).forEach((r) => add(r, "ex")); (u.ca || []).forEach((r) => add(r, "ca")); (u.ac || []).forEach((r) => add(r, "ac"));
    const out = {};
    for (const it of itens) {
      const k = keyOS(it.os); const ke = chaveEnd(it.end);
      out[k] = { os: porOS[k] || [], end: ke ? (porEnd[ke] || []).filter((x) => keyOS(x.os) !== k).slice(0, 8) : [] };
    }
    return res.status(200).json({ carteira: { dc: u.dc || "", em: meta.em }, res: out });
  } catch (e) { res.status(e.status || 500).json({ erro: e.message || "Erro inesperado." }); }
};
