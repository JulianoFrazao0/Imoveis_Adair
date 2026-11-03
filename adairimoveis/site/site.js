/* SITE: busca, lista de imóveis e detalhes com fotos */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };

  var form = $("#form-busca");
  var lista = $("#lista");
  var vazio = $("#vazio");
  var caixaErro = $("#erro");
  var contagem = $("#contagem");
  var seletorOrdem = $("#ordem");
  var detalhe = $("#detalhe");
  var conteudo = $("#detalhe-conteudo");

  var imoveis = [];
  var carregado = false;
  var atual = null;
  var galeria = { fotos: [], indice: 0 };
  var toqueX = null;

  var MENSAGEM_GERAL = "Olá! Vim pelo site " + CONFIG.nomeSite + " e gostaria de mais informações.";

  /* ---------- Contatos ---------- */
  $("#btn-ligar").href = linkLigar();
  $("#btn-whats-topo").href = linkWhats(MENSAGEM_GERAL);
  document.querySelectorAll("[data-whats]").forEach(function (el) {
    el.href = linkWhats(MENSAGEM_GERAL);
  });
  document.querySelectorAll("[data-telefone]").forEach(function (el) {
    el.textContent = CONFIG.telefoneExibicao;
    el.href = linkLigar();
  });
  if (!Banco.online) $("#faixa-teste").hidden = false;

  function seta(direcao) {
    var d = direcao === "esquerda" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7";
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  function trocarEndereco(hash) {
    try {
      history.replaceState(null, "", hash || location.pathname + location.search);
    } catch (e) {}
  }

  /* ---------- Filtros ---------- */
  function lerFiltros() {
    var dados = new FormData(form);
    var min = parseFloat(dados.get("min"));
    var max = parseFloat(dados.get("max"));
    return {
      finalidade: dados.get("finalidade"),
      tipo: dados.get("tipo"),
      min: isNaN(min) ? null : min,
      max: isNaN(max) ? null : max,
      local: normalizar(dados.get("local"))
    };
  }

  function combina(im, f) {
    if (im.finalidade !== f.finalidade) return false;
    if (f.tipo !== "todos" && im.tipo !== f.tipo) return false;
    if (f.min !== null && im.preco < f.min) return false;
    if (f.max !== null && im.preco > f.max) return false;
    if (f.local) {
      var texto = normalizar(im.localizacao + " " + im.nome_condominio + " " + im.titulo);
      if (texto.indexOf(f.local) === -1) return false;
    }
    return true;
  }

  function ordenar(l) {
    var modo = seletorOrdem.value;
    var copia = l.slice();
    if (modo === "menor") return copia.sort(function (a, b) { return a.preco - b.preco; });
    if (modo === "maior") return copia.sort(function (a, b) { return b.preco - a.preco; });
    return copia.sort(function (a, b) {
      if (!!a.destaque !== !!b.destaque) return a.destaque ? -1 : 1;
      return String(b.criado_em || "").localeCompare(String(a.criado_em || ""));
    });
  }

  /* ---------- Cartões ---------- */
  function selos(im) {
    var aluguel = im.finalidade === "aluguel";
    var s = '<span class="selo' + (aluguel ? " selo--vermelho" : "") + '">' + (aluguel ? "Aluguel" : "Venda") + "</span>";
    if (im.situacao === "reservado") s += '<span class="selo selo--branco">Reservado</span>';
    else if (im.destaque) s += '<span class="selo selo--destaque">Destaque</span>';
    if (im.condominio) s += '<span class="selo selo--branco">Condomínio</span>';
    return s;
  }

  function cartao(im) {
    var qtd = fotosDe(im).length;
    return (
      '<article class="card">' +
        '<a class="card__link" href="#imovel-' + escapar(im.codigo) + '" data-codigo="' + escapar(im.codigo) + '">' +
          '<div class="card__foto">' +
            '<img src="' + escapar(fotoCapa(im)) + '" alt="' + escapar(im.titulo) + '" data-tipo="' + escapar(im.tipo) + '" loading="lazy" decoding="async">' +
            '<div class="card__selos">' + selos(im) + "</div>" +
            (qtd > 1 ? '<span class="card__qtd">' + qtd + " fotos</span>" : "") +
          "</div>" +
          '<div class="card__corpo">' +
            '<p class="card__preco">' + precoTexto(im) + (im.finalidade === "aluguel" ? " <small>por mês</small>" : "") + "</p>" +
            '<h3 class="card__titulo">' + escapar(im.titulo) + "</h3>" +
            '<p class="card__local">' + escapar(im.localizacao) + "</p>" +
            '<p class="card__meta">' + escapar(resumoImovel(im)) + "</p>" +
          "</div>" +
        "</a>" +
      "</article>"
    );
  }

  function esqueletos(n) {
    var s = "";
    for (var i = 0; i < n; i++) {
      s +=
        '<div class="card card--esqueleto" aria-hidden="true">' +
          '<div class="card__foto"></div>' +
          '<div class="card__corpo"><span class="esq esq--preco"></span><span class="esq"></span><span class="esq esq--curta"></span></div>' +
        "</div>";
    }
    return s;
  }

  function mostrar() {
    if (!carregado) return;
    var f = lerFiltros();
    var achados = ordenar(imoveis.filter(function (im) { return combina(im, f); }));
    var n = achados.length;

    lista.innerHTML = achados.map(cartao).join("");
    lista.removeAttribute("aria-busy");
    protegerImagens(lista);
    vazio.hidden = n !== 0;

    if (!imoveis.length) {
      $("#vazio-titulo").textContent = "Ainda não há imóveis no site.";
      $("#vazio-texto").textContent = "Fale com o corretor pelo WhatsApp: ele pode ter a opção que você procura.";
    } else {
      $("#vazio-titulo").textContent = "Nenhum imóvel encontrado com esses filtros.";
      $("#vazio-texto").textContent =
        "Tente aumentar o valor máximo, apagar a localização ou escolher outro tipo. O corretor também pode ter opções que ainda não estão no site.";
    }

    contagem.textContent =
      n === 0
        ? "Nenhum imóvel encontrado"
        : n + (n === 1 ? " imóvel " : " imóveis ") + (f.finalidade === "aluguel" ? "para alugar" : "para comprar");
  }

  function limpar() {
    form.reset();
    seletorOrdem.value = "relevancia";
    mostrar();
  }

  form.addEventListener("input", mostrar);
  form.addEventListener("change", mostrar);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    mostrar();
    $("#resultados").scrollIntoView({ block: "start" });
  });
  seletorOrdem.addEventListener("change", mostrar);
  $("#limpar").addEventListener("click", limpar);
  $("#limpar-vazio").addEventListener("click", limpar);

  /* ---------- Detalhes do imóvel ---------- */
  function abrir(im) {
    atual = im;
    var aluguel = im.finalidade === "aluguel";
    var fotos = fotosDe(im);
    galeria.fotos = fotos.length ? fotos.map(function (f) { return f.grande || f.mini; }) : [imagemPadrao(im.tipo)];
    galeria.indice = 0;
    var n = galeria.fotos.length;

    var linhas = [];
    if (im.codigo) linhas.push(["Código", String(im.codigo)]);
    linhas.push(["Tipo", TIPOS[im.tipo] || "Imóvel"]);
    linhas.push(["Finalidade", aluguel ? "Aluguel" : "Venda"]);
    if (im.situacao === "reservado") linhas.push(["Situação", "Reservado"]);
    linhas.push(["Localização", im.localizacao]);
    if (areaTexto(im)) linhas.push(["Área", areaTexto(im)]);
    if (im.quartos) linhas.push(["Quartos", String(im.quartos)]);
    if (im.banheiros) linhas.push(["Banheiros", String(im.banheiros)]);
    if (im.vagas) linhas.push(["Vagas de garagem", String(im.vagas)]);
    linhas.push(["Condomínio", im.condominio ? (im.nome_condominio ? "Sim, " + im.nome_condominio : "Sim") : "Não"]);

    var ficha = linhas
      .map(function (l) { return "<dt>" + escapar(l[0]) + "</dt><dd>" + escapar(l[1]) + "</dd>"; })
      .join("");

    var mensagem =
      "Olá! Tenho interesse no imóvel " + (im.codigo ? "cód. " + im.codigo + ", " : "") +
      '"' + im.titulo + '" (' + im.localizacao + "). Ainda está disponível?";

    var miniaturas = "";
    if (n > 1) {
      miniaturas =
        '<div class="galeria__miniaturas">' +
        fotos.map(function (f, i) {
          return (
            '<button type="button" class="galeria__mini" data-foto="' + i + '" aria-label="Ver foto ' + (i + 1) + '"' +
            (i === 0 ? ' aria-current="true"' : "") + ">" +
            '<img src="' + escapar(f.mini || f.grande) + '" alt="" loading="lazy" data-tipo="' + escapar(im.tipo) + '">' +
            "</button>"
          );
        }).join("") +
        "</div>";
    }

    conteudo.innerHTML =
      '<div class="galeria">' +
        '<div class="galeria__palco" id="galeria-palco">' +
          '<img id="galeria-img" src="' + escapar(galeria.fotos[0]) + '" alt="' + escapar(im.titulo) + '">' +
          (n > 1
            ? '<button type="button" class="galeria__seta galeria__seta--anterior" data-passo="-1" aria-label="Foto anterior">' + seta("esquerda") + "</button>" +
              '<button type="button" class="galeria__seta galeria__seta--proxima" data-passo="1" aria-label="Próxima foto">' + seta("direita") + "</button>" +
              '<span class="galeria__contador" id="galeria-contador">1 de ' + n + "</span>"
            : "") +
        "</div>" +
        miniaturas +
      "</div>" +
      '<div class="detalhe__corpo">' +
        "<div>" +
          '<p class="card__preco card__preco--grande">' + precoTexto(im) + (aluguel ? " <small>por mês</small>" : "") + "</p>" +
          '<h2 id="detalhe-titulo" class="detalhe__titulo">' + escapar(im.titulo) + "</h2>" +
        "</div>" +
        '<dl class="ficha">' + ficha + "</dl>" +
        (im.descricao ? '<p class="descricao">' + escapar(im.descricao) + "</p>" : "") +
        '<div class="acoes">' +
          '<a class="botao botao--vermelho" href="' + escapar(linkWhats(mensagem)) + '" target="_blank" rel="noopener">Chamar no WhatsApp</a>' +
          '<a class="botao botao--contorno" href="' + escapar(linkLigar()) + '">Ligar agora</a>' +
          '<a class="botao botao--contorno" href="' + escapar(linkMapa(im)) + '" target="_blank" rel="noopener">Ver no Google Maps</a>' +
          '<button class="botao botao--contorno" type="button" data-acao="compartilhar">Compartilhar</button>' +
        "</div>" +
      "</div>";

    var img = $("#galeria-img");
    img.addEventListener("error", function () {
      var reserva = imagemPadrao(im.tipo);
      if (img.getAttribute("src") !== reserva) img.setAttribute("src", reserva);
    });
    protegerImagens(conteudo);
    conteudo.scrollTop = 0;

    if (typeof detalhe.showModal === "function") {
      if (!detalhe.open) detalhe.showModal();
    } else {
      detalhe.setAttribute("open", "");
    }
    trocarEndereco("#imovel-" + im.codigo);
  }

  function irPara(i) {
    var n = galeria.fotos.length;
    if (n < 2) return;
    galeria.indice = (i + n) % n;
    var img = $("#galeria-img");
    if (img) img.setAttribute("src", galeria.fotos[galeria.indice]);
    var contador = $("#galeria-contador");
    if (contador) contador.textContent = galeria.indice + 1 + " de " + n;
    conteudo.querySelectorAll(".galeria__mini").forEach(function (b, j) {
      if (j === galeria.indice) {
        b.setAttribute("aria-current", "true");
        b.scrollIntoView({ block: "nearest", inline: "nearest" });
      } else {
        b.removeAttribute("aria-current");
      }
    });
  }

  function compartilhar(botao) {
    if (!atual) return;
    var url = linkDoImovel(atual);
    if (navigator.share) {
      navigator.share({ title: atual.titulo, text: atual.titulo + " | " + CONFIG.nomeSite, url: url }).catch(function () {});
      return;
    }
    copiarTexto(url).then(
      function () {
        botao.textContent = "Link copiado";
        setTimeout(function () { botao.textContent = "Compartilhar"; }, 2500);
      },
      function () { window.prompt("Copie o link do imóvel:", url); }
    );
  }

  lista.addEventListener("click", function (e) {
    var link = e.target.closest("[data-codigo]");
    if (!link) return;
    e.preventDefault();
    var im = imoveis.find(function (i) { return String(i.codigo) === link.dataset.codigo; });
    if (im) abrir(im);
  });

  conteudo.addEventListener("click", function (e) {
    var passo = e.target.closest("[data-passo]");
    if (passo) return irPara(galeria.indice + Number(passo.dataset.passo));
    var mini = e.target.closest("[data-foto]");
    if (mini) return irPara(Number(mini.dataset.foto));
    var share = e.target.closest('[data-acao="compartilhar"]');
    if (share) compartilhar(share);
  });

  /* Arrastar o dedo na foto troca de foto */
  conteudo.addEventListener("touchstart", function (e) {
    toqueX = e.target.closest("#galeria-palco") ? e.touches[0].clientX : null;
  }, { passive: true });
  conteudo.addEventListener("touchend", function (e) {
    if (toqueX === null) return;
    var dx = e.changedTouches[0].clientX - toqueX;
    toqueX = null;
    if (Math.abs(dx) > 40) irPara(galeria.indice + (dx < 0 ? 1 : -1));
  });

  detalhe.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { irPara(galeria.indice + 1); e.preventDefault(); }
    if (e.key === "ArrowLeft") { irPara(galeria.indice - 1); e.preventDefault(); }
  });

  $("#fechar").addEventListener("click", function () { detalhe.close(); });

  /* Clicar fora da janela também fecha */
  detalhe.addEventListener("click", function (e) {
    if (e.target === detalhe) detalhe.close();
  });

  detalhe.addEventListener("close", function () {
    atual = null;
    trocarEndereco("");
  });

  /* Link direto para um imóvel (ex.: site.com/#imovel-12) */
  function abrirPeloEndereco() {
    var m = location.hash.match(/^#imovel-(\d+)$/);
    if (!m || !carregado) return;
    var im = imoveis.find(function (i) { return String(i.codigo) === m[1]; });
    if (im && (!atual || atual.id !== im.id)) abrir(im);
  }
  window.addEventListener("hashchange", abrirPeloEndereco);

  /* ---------- Carregar os imóveis ---------- */
  function carregar() {
    carregado = false;
    caixaErro.hidden = true;
    vazio.hidden = true;
    contagem.textContent = "Carregando imóveis…";
    lista.setAttribute("aria-busy", "true");
    lista.innerHTML = esqueletos(6);

    Banco.listar()
      .then(function (todos) {
        imoveis = todos.filter(noSite);
        carregado = true;
        mostrar();
        abrirPeloEndereco();
      })
      .catch(function (e) {
        console.error("AdairImoveis:", Banco.mensagemDeErro(e), e);
        lista.innerHTML = "";
        lista.removeAttribute("aria-busy");
        contagem.textContent = "";
        caixaErro.hidden = false;
      });
  }

  $("#tentar").addEventListener("click", carregar);
  carregar();
})();
