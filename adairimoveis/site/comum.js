/* FUNÇÕES USADAS PELO SITE E PELO PAINEL */

var TIPOS = {
  casa: "Casa",
  apartamento: "Apartamento",
  terreno: "Terreno",
  sitio: "Sítio",
  chacara: "Chácara"
};

var UNIDADES_AREA = { m2: "m²", ha: "hectares", alq: "alqueires" };

var SITUACOES = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
  alugado: "Alugado"
};

var moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});
var numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/* ---------- Textos ---------- */

function escapar(texto) {
  return String(texto == null ? "" : texto).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* Tira acentos e deixa minúsculo, para a busca achar "Sítio" digitando "sitio" */
function normalizar(texto) {
  return String(texto == null ? "" : texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function plural(n, um, varios) {
  return n + " " + (n === 1 ? um : varios);
}

function novoId() {
  try {
    if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch (e) {}
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  var h = Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}

/* ---------- Contato, mapa e link do imóvel ---------- */

function linkLigar() {
  return "tel:+" + CONFIG.telefone;
}

function linkWhats(mensagem) {
  return "https://wa.me/" + CONFIG.telefone + "?text=" + encodeURIComponent(mensagem);
}

/* Usa o link do Google Maps cadastrado. Se não tiver, procura pelo bairro e cidade. */
function linkMapa(im) {
  var link = String(im.mapa || "").trim();
  if (/^https?:\/\//i.test(link)) return link;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(im.localizacao || im.titulo || "");
}

/* Link que abre o site direto neste imóvel (bom para mandar no WhatsApp) */
function linkDoImovel(im) {
  try {
    var base = /^https?:$/.test(location.protocol) ? "./" : "index.html";
    var u = new URL(base, location.href);
    u.hash = "imovel-" + im.codigo;
    return u.href;
  } catch (e) {
    return "#imovel-" + im.codigo;
  }
}

/* ---------- Dados do imóvel em texto ---------- */

function precoTexto(im) {
  return moeda.format(Number(im.preco) || 0);
}

function areaTexto(im) {
  if (!im.area) return "";
  return numero.format(im.area) + " " + (UNIDADES_AREA[im.area_unidade] || "m²");
}

function codigoTexto(im) {
  return im.codigo ? "Cód. " + im.codigo : "";
}

function resumoImovel(im) {
  var partes = [TIPOS[im.tipo] || "Imóvel"];
  var area = areaTexto(im);
  if (area) partes.push(area);
  if (im.quartos) partes.push(plural(im.quartos, "quarto", "quartos"));
  return partes.join(", ");
}

/* Disponível e reservado aparecem no site. Vendido e alugado ficam só no painel. */
function noSite(im) {
  return !im.situacao || im.situacao === "disponivel" || im.situacao === "reservado";
}

/* ---------- Fotos ---------- */

function fotosDe(im) {
  if (!im || !Array.isArray(im.fotos)) return [];
  return im.fotos.filter(function (f) { return f && (f.grande || f.mini); });
}

function fotoCapa(im) {
  var f = fotosDe(im)[0];
  return f ? (f.mini || f.grande) : imagemPadrao(im.tipo);
}

/* Desenho simples usado quando o imóvel ainda não tem foto */
function imagemPadrao(tipo) {
  var V = "#C8102E", P = "#000", B = "#fff";
  var fundo = '<rect width="400" height="300" fill="#e9e9e9"/>';
  var chao = '<rect y="240" width="400" height="60" fill="#d4d4d4"/>';
  var arte = "";

  if (tipo === "apartamento") {
    var janelas = "";
    for (var l = 0; l < 3; l++) {
      for (var c = 0; c < 3; c++) {
        janelas += '<rect x="' + (158 + c * 36) + '" y="' + (80 + l * 36) + '" width="22" height="22" fill="' + P + '"/>';
      }
    }
    arte =
      chao +
      '<rect x="140" y="50" width="120" height="190" fill="' + B + '" stroke="' + P + '" stroke-width="6"/>' +
      '<rect x="140" y="50" width="120" height="18" fill="' + V + '"/>' +
      janelas +
      '<rect x="188" y="205" width="24" height="35" fill="' + V + '"/>';
  } else if (tipo === "terreno") {
    arte =
      chao +
      '<polygon points="110,170 330,170 370,250 70,250" fill="' + B + '" stroke="' + V + '" stroke-width="5" stroke-dasharray="14 8"/>' +
      '<rect x="104" y="164" width="14" height="14" fill="' + P + '"/>' +
      '<rect x="322" y="164" width="14" height="14" fill="' + P + '"/>' +
      '<rect x="363" y="243" width="14" height="14" fill="' + P + '"/>' +
      '<rect x="63" y="243" width="14" height="14" fill="' + P + '"/>' +
      '<rect x="196" y="70" width="8" height="100" fill="' + P + '"/>' +
      '<rect x="145" y="50" width="110" height="44" fill="' + V + '"/>' +
      '<text x="200" y="79" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="' + B + '" text-anchor="middle">TERRENO</text>';
  } else if (tipo === "sitio") {
    arte =
      '<path d="M0 240 Q120 170 240 220 T400 200 V300 H0Z" fill="#cfcfcf"/>' +
      '<rect x="90" y="150" width="120" height="80" fill="' + B + '" stroke="' + P + '" stroke-width="6"/>' +
      '<polygon points="76,152 150,100 224,152" fill="' + V + '"/>' +
      '<rect x="138" y="182" width="24" height="48" fill="' + P + '"/>' +
      '<rect x="300" y="170" width="10" height="70" fill="' + P + '"/>' +
      '<circle cx="305" cy="150" r="42" fill="' + V + '"/>';
  } else if (tipo === "chacara") {
    var postes = "";
    for (var i = 0; i < 5; i++) {
      postes += '<rect x="' + (200 + i * 45) + '" y="190" width="8" height="50" fill="' + P + '"/>';
    }
    arte =
      chao +
      '<rect x="60" y="160" width="110" height="80" fill="' + B + '" stroke="' + P + '" stroke-width="6"/>' +
      '<polygon points="46,162 115,110 184,162" fill="' + V + '"/>' +
      '<rect x="104" y="192" width="22" height="48" fill="' + P + '"/>' +
      '<rect x="190" y="205" width="200" height="8" fill="' + P + '"/>' +
      postes;
  } else {
    arte =
      chao +
      '<polygon points="90,140 200,60 310,140" fill="' + V + '"/>' +
      '<rect x="110" y="140" width="180" height="100" fill="' + B + '" stroke="' + P + '" stroke-width="6"/>' +
      '<rect x="184" y="180" width="32" height="60" fill="' + P + '"/>' +
      '<rect x="128" y="160" width="36" height="34" fill="' + P + '"/>' +
      '<rect x="236" y="160" width="36" height="34" fill="' + P + '"/>';
  }

  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' + fundo + arte + "</svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* Se uma foto não carregar (link quebrado), troca pelo desenho padrão */
function protegerImagens(container) {
  container.querySelectorAll("img[data-tipo]").forEach(function (img) {
    img.addEventListener(
      "error",
      function () {
        img.src = imagemPadrao(img.dataset.tipo);
      },
      { once: true }
    );
  });
}

/* ---------- Avisos e copiar link ---------- */

var temporizadorAviso = null;

function mostrarAviso(texto, erro) {
  var el = document.getElementById("toast");
  if (!el) return;
  el.textContent = texto;
  el.className = "toast" + (erro ? " toast--erro" : "");
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(function () { el.hidden = true; }, erro ? 7000 : 4000);
}

function copiarTexto(texto) {
  function jeitoAntigo() {
    return new Promise(function (ok, falha) {
      var campo = document.createElement("textarea");
      campo.value = texto;
      campo.setAttribute("readonly", "");
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      try {
        if (document.execCommand("copy")) ok();
        else falha(new Error("Não foi possível copiar"));
      } catch (e) {
        falha(e);
      } finally {
        campo.remove();
      }
    });
  }
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(texto).catch(jeitoAntigo);
  }
  return jeitoAntigo();
}
