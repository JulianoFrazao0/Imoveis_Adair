/* PAINEL DO CORRETOR: entrar, cadastrar, editar, marcar vendido e excluir imóveis */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var MAX_FOTOS = 20;
  var MAX_DESCRICAO = 3000;
  var PERGUNTA_SAIR = "Sair sem salvar? O que você preencheu neste imóvel será perdido.";

  var telas = {
    carregando: $("#tela-carregando"),
    login: $("#tela-login"),
    lista: $("#tela-lista"),
    form: $("#tela-form")
  };
  var telaAtual = "carregando";

  var imoveis = [];
  var filtro = "todos";
  var idDestacado = null;

  var form = $("#form-imovel");
  var campos = {
    titulo: $("#f-titulo"),
    preco: $("#f-preco"),
    local: $("#f-local"),
    mapa: $("#f-mapa"),
    condominio: $("#f-condominio"),
    nomeCond: $("#f-nomecond"),
    area: $("#f-area"),
    unidade: $("#f-area-unidade"),
    quartos: $("#f-quartos"),
    banheiros: $("#f-banheiros"),
    vagas: $("#f-vagas"),
    descricao: $("#f-descricao"),
    situacao: $("#f-situacao"),
    destaque: $("#f-destaque")
  };

  /* Estado do formulário aberto */
  var ehNovo = true;
  var idEdicao = null;
  var fotos = [];          // fotos na tela: { chave, estado, grande, mini, previa, arquivo, erro }
  var fila = [];           // fotos esperando para serem preparadas e enviadas
  var filaRodando = false;
  var enviadasAgora = [];  // fotos enviadas desde que o formulário abriu
  var fotosOriginais = []; // fotos que o imóvel já tinha
  var sessaoForm = 0;      // muda a cada vez que o formulário abre ou fecha
  var contadorFotos = 0;
  var formAlterado = false;
  var salvando = false;
  var esperandoFotos = false;
  var ignorarPop = false;

  var ICONES = {
    estrela: '<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>',
    esquerda: '<path d="M15 5l-7 7 7 7"/>',
    direita: '<path d="M9 5l7 7-7 7"/>',
    fechar: '<path d="M6 6l12 12M18 6L6 18"/>'
  };

  function icone(nome) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONES[nome] + "</svg>";
  }

  /* ---------- Telas ---------- */
  function mostrarTela(nome) {
    Object.keys(telas).forEach(function (k) { telas[k].hidden = k !== nome; });
    telaAtual = nome;
    document.body.dataset.tela = nome;
  }

  function ocupar(botao, texto) {
    if (!botao.dataset.texto) botao.dataset.texto = botao.textContent;
    botao.textContent = texto;
    botao.disabled = true;
  }

  function liberar(botao) {
    if (botao.dataset.texto) {
      botao.textContent = botao.dataset.texto;
      delete botao.dataset.texto;
    }
    botao.disabled = false;
  }

  function dataCurta(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("pt-BR");
  }

  /* ---------- Entrar e sair ---------- */
  function mostrarLogin(msg) {
    $("#usuario").hidden = true;
    $("#btn-sair").hidden = true;
    mostrarTela("login");
    var erro = $("#erro-login");
    erro.textContent = msg || "";
    erro.hidden = !msg;
  }

  async function abrirPainel(sessao) {
    if (sessao && sessao.email) {
      $("#usuario").textContent = sessao.email;
      $("#usuario").hidden = false;
      $("#btn-sair").hidden = false;
    }
    mostrarTela("carregando");
    await carregarLista();
    mostrarTela("lista");

    if (Banco.online && sessao) {
      Banco.ehAdmin().then(function (ok) {
        var aviso = $("#aviso-permissao");
        aviso.hidden = ok !== false;
        if (ok === false) {
          $("#aviso-email").textContent = sessao.email;
          $("#aviso-sql").textContent = "insert into public.administradores (email) values ('" + sessao.email + "');";
        }
      });
    }
  }

  async function iniciar() {
    if (location.hash === "#formulario") {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
    if (!Banco.online) {
      $("#faixa-teste").hidden = false;
      await abrirPainel(null);
      return;
    }
    try {
      var s = await Banco.sessao();
      if (s) await abrirPainel(s);
      else mostrarLogin();
    } catch (e) {
      mostrarLogin(Banco.mensagemDeErro(e));
    }
  }

  $("#form-login").addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = $("#login-email").value.trim();
    var senha = $("#login-senha").value;
    var erro = $("#erro-login");
    erro.hidden = true;
    if (!email || !senha) {
      erro.textContent = "Preencha o e-mail e a senha.";
      erro.hidden = false;
      return;
    }
    var botao = $("#btn-entrar");
    ocupar(botao, "Entrando…");
    try {
      var s = await Banco.entrar(email, senha);
      $("#login-senha").value = "";
      await abrirPainel(s);
    } catch (err) {
      erro.textContent = Banco.mensagemDeErro(err);
      erro.hidden = false;
    } finally {
      liberar(botao);
    }
  });

  $("#mostrar-senha").addEventListener("change", function (e) {
    $("#login-senha").type = e.target.checked ? "text" : "password";
  });

  $("#btn-sair").addEventListener("click", async function () {
    if (telaAtual === "form") {
      if ((formAlterado || temEnvioPendente()) && !confirm(PERGUNTA_SAIR)) return;
      voltarParaLista(false);
    }
    await Banco.sair();
    imoveis = [];
    $("#lista-admin").innerHTML = "";
    $("#aviso-permissao").hidden = true;
    mostrarLogin();
  });

  /* ---------- Lista de imóveis ---------- */
  async function carregarLista() {
    var caixaErro = $("#erro-lista");
    try {
      imoveis = await Banco.listar();
      caixaErro.hidden = true;
    } catch (e) {
      imoveis = [];
      $("#erro-lista-texto").textContent = Banco.mensagemDeErro(e);
      caixaErro.hidden = false;
    }
    desenharLista();
  }

  function etiquetas(im) {
    var s = im.situacao || "disponivel";
    var texto = s === "disponivel" ? "No site" : SITUACOES[s];
    var html = '<span class="etiqueta etiqueta--' + s + '">' + escapar(texto) + "</span>";
    if (im.destaque && noSite(im)) html += '<span class="etiqueta etiqueta--destaque">Destaque</span>';
    return html;
  }

  function linhaImovel(im) {
    var fora = !noSite(im);
    var aluguel = im.finalidade === "aluguel";
    var textoSituacao = fora ? "Voltar para o site" : aluguel ? "Marcar alugado" : "Marcar vendido";
    var detalhes = [codigoTexto(im), (TIPOS[im.tipo] || "Imóvel") + (aluguel ? " para alugar" : " à venda")].filter(Boolean).join(", ");
    return (
      '<article class="item' + (fora ? " item--fora" : "") + '" data-id="' + escapar(im.id) + '">' +
        '<button type="button" class="item__foto" data-acao="editar" aria-label="Editar ' + escapar(im.titulo) + '">' +
          '<img src="' + escapar(fotoCapa(im)) + '" alt="" data-tipo="' + escapar(im.tipo) + '" loading="lazy">' +
        "</button>" +
        '<div class="item__info">' +
          '<p class="item__etiquetas">' + etiquetas(im) + "</p>" +
          '<h3 class="item__titulo">' + escapar(im.titulo) + "</h3>" +
          '<p class="item__preco">' + precoTexto(im) + (aluguel ? " por mês" : "") + "</p>" +
          '<p class="item__detalhes">' + escapar(detalhes) + "</p>" +
          '<p class="item__detalhes">' + escapar(im.localizacao) + "</p>" +
        "</div>" +
        '<div class="item__acoes">' +
          '<button type="button" class="botao botao--vermelho botao--pequeno" data-acao="editar">Editar</button>' +
          '<button type="button" class="botao botao--contorno botao--pequeno" data-acao="situacao">' + textoSituacao + "</button>" +
          (fora ? "" : '<button type="button" class="botao botao--contorno botao--pequeno" data-acao="link">Copiar link</button>') +
          '<button type="button" class="botao botao--contorno-vermelho botao--pequeno" data-acao="excluir">Excluir</button>' +
        "</div>" +
      "</article>"
    );
  }

  function desenharLista() {
    var caixa = $("#lista-admin");
    var nSite = imoveis.filter(noSite).length;
    var nFora = imoveis.length - nSite;

    $("#resumo").textContent = imoveis.length
      ? plural(nSite, "imóvel no site", "imóveis no site") + ", " + plural(nFora, "vendido ou alugado", "vendidos ou alugados")
      : "";

    document.querySelectorAll(".aba").forEach(function (aba) {
      var f = aba.dataset.filtro;
      var n = f === "todos" ? imoveis.length : f === "site" ? nSite : nFora;
      aba.textContent = aba.dataset.rotulo + " (" + n + ")";
      aba.setAttribute("aria-pressed", f === filtro ? "true" : "false");
    });

    if (!imoveis.length) {
      caixa.innerHTML =
        '<div class="lista-vazia">' +
          "<p><strong>Nenhum imóvel cadastrado ainda.</strong></p>" +
          "<p>Cadastre o primeiro: ele aparece no site assim que você salvar.</p>" +
          '<button type="button" class="botao botao--vermelho" data-acao="novo">Cadastrar o primeiro imóvel</button>' +
        "</div>";
      return;
    }

    var termo = normalizar($("#busca-admin").value);
    var filtrados = imoveis.filter(function (im) {
      if (filtro === "site" && !noSite(im)) return false;
      if (filtro === "fora" && noSite(im)) return false;
      if (termo) {
        var texto = normalizar([im.titulo, im.localizacao, im.nome_condominio, im.codigo, TIPOS[im.tipo]].join(" "));
        if (texto.indexOf(termo) === -1) return false;
      }
      return true;
    });

    if (!filtrados.length) {
      caixa.innerHTML =
        '<div class="lista-vazia"><p><strong>Nenhum imóvel encontrado.</strong></p><p>Confira a busca ou escolha outra opção acima.</p></div>';
      return;
    }

    caixa.innerHTML = filtrados.map(linhaImovel).join("");
    protegerImagens(caixa);

    if (idDestacado) {
      var linha = caixa.querySelector('[data-id="' + idDestacado + '"]');
      idDestacado = null;
      if (linha) {
        linha.classList.add("item--destacado");
        linha.scrollIntoView({ block: "center" });
        setTimeout(function () { linha.classList.remove("item--destacado"); }, 2600);
      }
    }
  }

  function substituir(salvo) {
    var i = imoveis.findIndex(function (x) { return x.id === salvo.id; });
    if (i === -1) imoveis.unshift(salvo);
    else imoveis[i] = salvo;
  }

  async function alternarSituacao(im, botao) {
    var nova = noSite(im) ? (im.finalidade === "aluguel" ? "alugado" : "vendido") : "disponivel";
    ocupar(botao, "Salvando…");
    try {
      var salvo = await Banco.salvar(Object.assign({}, im, { situacao: nova }), false);
      substituir(salvo);
      desenharLista();
      mostrarAviso(
        nova === "disponivel"
          ? "O imóvel voltou para o site."
          : "Marcado como " + (nova === "alugado" ? "alugado" : "vendido") + ". Ele saiu do site e continua guardado aqui."
      );
    } catch (err) {
      liberar(botao);
      mostrarAviso(Banco.mensagemDeErro(err), true);
    }
  }

  async function excluirImovel(im, botao) {
    var dica = noSite(im)
      ? '\n\nSe ele só foi ' + (im.finalidade === "aluguel" ? 'alugado, use "Marcar alugado"' : 'vendido, use "Marcar vendido"') + " para guardar o cadastro."
      : "";
    if (!confirm('Excluir "' + im.titulo + '"?\n\nO imóvel e as fotos serão apagados de vez.' + dica)) return;
    ocupar(botao, "Excluindo…");
    try {
      await Banco.excluir(im);
      imoveis = imoveis.filter(function (i) { return i.id !== im.id; });
      desenharLista();
      mostrarAviso("Imóvel excluído.");
    } catch (err) {
      liberar(botao);
      mostrarAviso(Banco.mensagemDeErro(err), true);
    }
  }

  function copiarLink(im) {
    var url = linkDoImovel(im);
    copiarTexto(url).then(
      function () { mostrarAviso("Link copiado. Agora é só colar no WhatsApp do cliente."); },
      function () { window.prompt("Copie o link do imóvel:", url); }
    );
  }

  $("#lista-admin").addEventListener("click", function (e) {
    var botao = e.target.closest("[data-acao]");
    if (!botao) return;
    var acao = botao.dataset.acao;
    if (acao === "novo") return abrirFormulario(null);
    var linha = botao.closest("[data-id]");
    var im = linha && imoveis.find(function (i) { return i.id === linha.dataset.id; });
    if (!im) return;
    if (acao === "editar") abrirFormulario(im);
    else if (acao === "situacao") alternarSituacao(im, botao);
    else if (acao === "link") copiarLink(im);
    else if (acao === "excluir") excluirImovel(im, botao);
  });

  $("#busca-admin").addEventListener("input", desenharLista);
  document.querySelectorAll(".aba").forEach(function (aba) {
    aba.addEventListener("click", function () {
      filtro = aba.dataset.filtro;
      desenharLista();
    });
  });
  $("#btn-novo").addEventListener("click", function () { abrirFormulario(null); });
  $("#btn-recarregar").addEventListener("click", carregarLista);

  /* ---------- Formulário ---------- */
  function valorRadio(nome) {
    var el = form.querySelector('input[name="' + nome + '"]:checked');
    return el ? el.value : "";
  }

  function marcarRadio(nome, valor) {
    var el = form.querySelector('input[name="' + nome + '"][value="' + valor + '"]');
    if (el) el.checked = true;
  }

  function apenasDigitos(texto) {
    return String(texto || "").replace(/\D/g, "");
  }

  function formatarMilhar(digitos) {
    var limpo = apenasDigitos(digitos).replace(/^0+(?=\d)/, "");
    return limpo ? Number(limpo).toLocaleString("pt-BR") : "";
  }

  /* Aceita "360", "1.250", "2,5" e "2.5" */
  function lerDecimal(texto) {
    var s = String(texto || "").trim().replace(/\s/g, "");
    if (!s) return null;
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "");
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    var n = parseFloat(s);
    return n > 0 ? Math.round(n * 100) / 100 : null;
  }

  function lerInteiro(texto) {
    var n = parseInt(texto, 10);
    return isNaN(n) || n <= 0 ? null : Math.min(n, 99);
  }

  function extrairLink(texto) {
    var m = String(texto || "").match(/https?:\/\/\S+/i);
    return m ? m[0] : String(texto || "").trim();
  }

  function atualizarSituacoes(atual) {
    var aluguel = valorRadio("finalidade") === "aluguel";
    var opcoes = aluguel
      ? [["disponivel", "Disponível"], ["reservado", "Reservado"], ["alugado", "Alugado (sai do site)"]]
      : [["disponivel", "Disponível"], ["reservado", "Reservado"], ["vendido", "Vendido (sai do site)"]];
    if (atual === "vendido" && aluguel) atual = "alugado";
    if (atual === "alugado" && !aluguel) atual = "vendido";
    campos.situacao.innerHTML = opcoes
      .map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; })
      .join("");
    campos.situacao.value = opcoes.some(function (o) { return o[0] === atual; }) ? atual : "disponivel";
  }

  function atualizarCamposDependentes() {
    var aluguel = valorRadio("finalidade") === "aluguel";
    $("#rotulo-preco").textContent = aluguel ? "Valor do aluguel" : "Valor de venda";
    $("#sufixo-preco").hidden = !aluguel;
    $("#campos-comodos").hidden = valorRadio("tipo") === "terreno";
    $("#campo-nomecond").hidden = !campos.condominio.checked;
    $("#contador-descricao").textContent = campos.descricao.value.length + " de " + MAX_DESCRICAO + " letras";
  }

  function abrirFormulario(im) {
    sessaoForm++;
    ehNovo = !im;
    idEdicao = im ? im.id : novoId();
    liberarPrevias();
    fotosOriginais = im ? fotosDe(im).map(function (f) { return { grande: f.grande, mini: f.mini }; }) : [];
    fotos = fotosOriginais.map(function (f) {
      return { chave: "f" + ++contadorFotos, estado: "pronto", grande: f.grande, mini: f.mini };
    });
    enviadasAgora = [];
    fila = [];
    esperandoFotos = false;

    form.reset();
    limparErros();
    marcarRadio("finalidade", im ? im.finalidade : "venda");
    marcarRadio("tipo", im ? im.tipo : "casa");
    campos.titulo.value = im ? im.titulo : "";
    campos.preco.value = im && im.preco ? formatarMilhar(String(Math.round(im.preco))) : "";
    campos.local.value = im ? im.localizacao : "";
    campos.mapa.value = im ? im.mapa || "" : "";
    campos.condominio.checked = !!(im && im.condominio);
    campos.nomeCond.value = im ? im.nome_condominio || "" : "";
    campos.area.value = im && im.area ? numero.format(im.area) : "";
    campos.unidade.value = im && UNIDADES_AREA[im.area_unidade] ? im.area_unidade : "m2";
    campos.quartos.value = im && im.quartos ? im.quartos : "";
    campos.banheiros.value = im && im.banheiros ? im.banheiros : "";
    campos.vagas.value = im && im.vagas ? im.vagas : "";
    campos.descricao.value = im ? im.descricao || "" : "";
    campos.destaque.checked = !!(im && im.destaque);
    atualizarSituacoes(im ? im.situacao : "disponivel");
    atualizarCamposDependentes();

    $("#titulo-form").textContent = ehNovo ? "Novo imóvel" : "Editar imóvel";
    var sub = $("#subtitulo-form");
    sub.textContent = im ? [codigoTexto(im), im.criado_em ? "cadastrado em " + dataCurta(im.criado_em) : ""].filter(Boolean).join(", ") : "";
    sub.hidden = !sub.textContent;

    var salvar = $("#btn-salvar");
    liberar(salvar);
    salvar.textContent = ehNovo ? "Salvar imóvel" : "Salvar alterações";

    desenharFotos();
    formAlterado = false;
    mostrarTela("form");
    try { history.pushState({ tela: "form" }, "", "#formulario"); } catch (e) {}
    window.scrollTo(0, 0);
    $("#titulo-form").focus({ preventScroll: true });
  }

  function fecharFormulario(salvou) {
    sessaoForm++;
    if (!salvou) Banco.apagarFotos(enviadasAgora);
    enviadasAgora = [];
    fila = [];
    esperandoFotos = false;
    liberarPrevias();
    fotos = [];
    $("#fotos-grade").innerHTML = "";
    $("#fotos-erro").hidden = true;
    formAlterado = false;
    limparErros();
    desenharLista();
    mostrarTela("lista");
  }

  function voltarParaLista(salvou) {
    fecharFormulario(salvou);
    if (history.state && history.state.tela === "form") {
      ignorarPop = true;
      history.back();
    }
  }

  function pedirParaSair() {
    if ((formAlterado || temEnvioPendente()) && !confirm(PERGUNTA_SAIR)) return;
    voltarParaLista(false);
  }

  $("#btn-voltar").addEventListener("click", pedirParaSair);
  $("#btn-cancelar").addEventListener("click", pedirParaSair);

  /* Botão "voltar" do celular fecha o formulário em vez de sair do painel */
  window.addEventListener("popstate", function () {
    if (ignorarPop) { ignorarPop = false; return; }
    if (telaAtual !== "form") return;
    if ((formAlterado || temEnvioPendente()) && !confirm(PERGUNTA_SAIR)) {
      try { history.pushState({ tela: "form" }, "", "#formulario"); } catch (e) {}
      return;
    }
    fecharFormulario(false);
  });

  window.addEventListener("beforeunload", function (e) {
    if (telaAtual === "form" && (formAlterado || temEnvioPendente())) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  form.addEventListener("input", function (e) {
    formAlterado = true;
    var alvo = e.target;
    if (alvo.hasAttribute && alvo.hasAttribute("aria-invalid")) desmarcarErro(alvo);
    if (alvo === campos.descricao) atualizarCamposDependentes();
  });

  form.addEventListener("change", function (e) {
    formAlterado = true;
    if (e.target.name === "finalidade") atualizarSituacoes(campos.situacao.value);
    atualizarCamposDependentes();
  });

  /* Valor com pontos de milhar enquanto digita. A vírgula fica, mas os centavos não vão para o site. */
  campos.preco.addEventListener("input", function () {
    var partes = campos.preco.value.split(",");
    var inteiro = formatarMilhar(partes[0]).slice(0, 18);
    campos.preco.value = partes.length > 1 ? inteiro + "," + apenasDigitos(partes.slice(1).join("")).slice(0, 2) : inteiro;
  });

  /* Se colar o texto inteiro do "Compartilhar" do Google Maps, fica só o link */
  campos.mapa.addEventListener("change", function () {
    campos.mapa.value = extrairLink(campos.mapa.value);
  });

  $("#btn-testar-mapa").addEventListener("click", function () {
    var mapa = extrairLink(campos.mapa.value);
    var local = campos.local.value.trim();
    if (!mapa && !local) {
      mostrarAviso("Preencha o bairro e a cidade ou cole o link do mapa primeiro.", true);
      return;
    }
    window.open(linkMapa({ mapa: mapa, localizacao: local }), "_blank", "noopener");
  });

  /* ---------- Erros do formulário ---------- */
  function limparErros() {
    form.querySelectorAll("[aria-invalid]").forEach(desmarcarErro);
    $("#erro-form").hidden = true;
  }

  function desmarcarErro(el) {
    el.removeAttribute("aria-invalid");
    var caixa = el.closest(".campo-dinheiro") || el;
    caixa.classList.remove("invalido");
    var campo = el.closest(".campo");
    var aviso = campo && campo.querySelector(".campo__erro");
    if (aviso) aviso.remove();
    if (!form.querySelector("[aria-invalid]")) $("#erro-form").hidden = true;
  }

  function marcarErro(el, texto) {
    el.setAttribute("aria-invalid", "true");
    (el.closest(".campo-dinheiro") || el).classList.add("invalido");
    var campo = el.closest(".campo");
    if (campo && !campo.querySelector(".campo__erro")) {
      var aviso = document.createElement("small");
      aviso.className = "campo__erro";
      aviso.textContent = texto;
      campo.appendChild(aviso);
    }
  }

  function mostrarErroGeral(texto) {
    var el = $("#erro-form");
    el.textContent = texto;
    el.hidden = false;
  }

  /* ---------- Ler o formulário ---------- */
  function lerFormulario() {
    var erros = [];
    var tipo = valorRadio("tipo") || "casa";
    var titulo = campos.titulo.value.trim().replace(/\s+/g, " ");
    var preco = Number(apenasDigitos(campos.preco.value.split(",")[0]));
    var local = campos.local.value.trim();
    var mapa = extrairLink(campos.mapa.value);
    var area = lerDecimal(campos.area.value);
    var comodos = tipo !== "terreno";

    if (!titulo) erros.push([campos.titulo, "Escreva um título para o anúncio."]);
    if (!preco) erros.push([campos.preco, "Digite o valor do imóvel."]);
    if (!local) erros.push([campos.local, "Digite o bairro e a cidade."]);
    if (mapa && !/^https?:\/\//i.test(mapa)) erros.push([campos.mapa, "Cole o link completo (começa com https://) ou deixe em branco."]);
    if (typeof area === "number" && isNaN(area)) erros.push([campos.area, "Use só números. Exemplo: 360 ou 2,5."]);

    return {
      erros: erros,
      imovel: {
        id: idEdicao,
        finalidade: valorRadio("finalidade") === "aluguel" ? "aluguel" : "venda",
        tipo: tipo,
        titulo: titulo,
        preco: preco,
        localizacao: local,
        condominio: campos.condominio.checked,
        nome_condominio: campos.condominio.checked ? campos.nomeCond.value.trim() : "",
        area: typeof area === "number" && !isNaN(area) ? area : null,
        area_unidade: campos.unidade.value,
        quartos: comodos ? lerInteiro(campos.quartos.value) : null,
        banheiros: comodos ? lerInteiro(campos.banheiros.value) : null,
        vagas: comodos ? lerInteiro(campos.vagas.value) : null,
        descricao: campos.descricao.value.trim().slice(0, MAX_DESCRICAO),
        mapa: mapa,
        fotos: fotos
          .filter(function (f) { return f.estado === "pronto"; })
          .map(function (f) { return { grande: f.grande, mini: f.mini }; }),
        situacao: campos.situacao.value,
        destaque: campos.destaque.checked
      }
    };
  }

  /* ---------- Salvar ---------- */
  function textoSalvo(im, novo) {
    if (!Banco.online) return "Imóvel salvo no modo de teste (só neste navegador).";
    if (!noSite(im)) return "Imóvel salvo. Como está " + (im.situacao === "alugado" ? "alugado" : "vendido") + ", ele não aparece no site.";
    return novo ? "Imóvel salvo. Ele já aparece no site." : "Alterações salvas. O site já está atualizado.";
  }

  async function aoSalvar(e) {
    if (e) e.preventDefault();
    if (salvando) return;
    var botao = $("#btn-salvar");
    limparErros();

    var lido = lerFormulario();
    if (lido.erros.length) {
      esperandoFotos = false;
      liberar(botao);
      lido.erros.forEach(function (par) { marcarErro(par[0], par[1]); });
      mostrarErroGeral(lido.erros.length === 1 ? lido.erros[0][1] : "Confira os campos marcados em vermelho.");
      var primeiro = lido.erros[0][0];
      primeiro.scrollIntoView({ block: "center" });
      primeiro.focus({ preventScroll: true });
      return;
    }

    if (temEnvioPendente()) {
      esperandoFotos = true;
      ocupar(botao, "Terminando de enviar as fotos…");
      return;
    }
    esperandoFotos = false;

    if (fotos.some(function (f) { return f.estado === "erro"; })) {
      liberar(botao);
      mostrarErroGeral("Algumas fotos não foram enviadas. Toque em “Tentar de novo” na foto ou remova a foto.");
      $("#fotos-grade").scrollIntoView({ block: "center" });
      return;
    }

    salvando = true;
    ocupar(botao, "Salvando…");
    var eraNovo = ehNovo;
    try {
      var salvo = await Banco.salvar(lido.imovel, eraNovo);
      var usadas = {};
      lido.imovel.fotos.forEach(function (f) { usadas[f.grande] = true; });
      Banco.apagarFotos(fotosOriginais.concat(enviadasAgora).filter(function (f) { return !usadas[f.grande]; }));
      enviadasAgora = [];
      substituir(salvo);
      idDestacado = salvo.id;
      formAlterado = false;
      salvando = false;
      liberar(botao);
      voltarParaLista(true);
      mostrarAviso(textoSalvo(salvo, eraNovo));
    } catch (err) {
      salvando = false;
      liberar(botao);
      mostrarErroGeral(Banco.mensagemDeErro(err));
    }
  }

  form.addEventListener("submit", aoSalvar);

  /* ---------- Fotos ---------- */
  function temEnvioPendente() {
    return fotos.some(function (f) {
      return f.estado === "fila" || f.estado === "processando" || f.estado === "enviando";
    });
  }

  function liberarPrevias() {
    fotos.forEach(function (f) {
      if (f.previa) {
        try { URL.revokeObjectURL(f.previa); } catch (e) {}
      }
    });
  }

  function erroDeFoto(texto) {
    var e = new Error(texto);
    e.foto = true;
    return e;
  }

  function abrirImagem(item) {
    return new Promise(function (ok, falha) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () {
        falha(erroDeFoto("Não deu para abrir uma das fotos. Se ela for do iPhone (HEIC), salve em JPG e envie de novo."));
      };
      try {
        img.src = item.previa || URL.createObjectURL(item.arquivo);
      } catch (e) {
        falha(erroDeFoto("Não deu para abrir uma das fotos."));
      }
    });
  }

  /* Reduz a foto mantendo a proporção (celulares tiram fotos enormes) */
  function reduzir(fonte, maximo) {
    var w0 = fonte.naturalWidth || fonte.width;
    var h0 = fonte.naturalHeight || fonte.height;
    if (!w0 || !h0) throw erroDeFoto("Não deu para abrir uma das fotos.");
    var escala = Math.min(1, maximo / Math.max(w0, h0));
    var w = Math.max(1, Math.round(w0 * escala));
    var h = Math.max(1, Math.round(h0 * escala));
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    ctx.drawImage(fonte, 0, 0, w, h);
    return canvas;
  }

  function paraBlob(canvas, qualidade) {
    return new Promise(function (ok, falha) {
      canvas.toBlob(function (blob) {
        if (blob) ok(blob);
        else falha(erroDeFoto("Não deu para preparar uma das fotos. Tente outra."));
      }, "image/jpeg", qualidade);
    });
  }

  async function enviarItem(item, sessao, pastaId) {
    item.estado = "processando";
    item.erro = "";
    if (sessao === sessaoForm) desenharFotos();
    try {
      var t = Banco.tamanhos;
      var img = await abrirImagem(item);
      var grande = reduzir(img, t.grande);
      var blobGrande = await paraBlob(grande, t.qualidadeGrande);
      var blobMini = await paraBlob(reduzir(grande, t.mini), t.qualidadeMini);
      if (sessao !== sessaoForm || fotos.indexOf(item) === -1) return;

      item.estado = "enviando";
      desenharFotos();
      var enviada = await Banco.enviarFoto(pastaId, blobGrande, blobMini);
      if (sessao !== sessaoForm || fotos.indexOf(item) === -1) {
        Banco.apagarFotos([enviada]);
        return;
      }
      enviadasAgora.push(enviada);
      item.grande = enviada.grande;
      item.mini = enviada.mini;
      item.estado = "pronto";
    } catch (e) {
      if (sessao !== sessaoForm) return;
      item.estado = "erro";
      item.erro = e && e.foto ? e.message : Banco.mensagemDeErro(e);
      item.erroCurto = e && e.foto ? "Não deu para abrir" : "Não foi enviada";
    }
    if (sessao === sessaoForm) desenharFotos();
  }

  async function processarFila() {
    if (filaRodando) return;
    filaRodando = true;
    try {
      while (fila.length) {
        var item = fila.shift();
        if (fotos.indexOf(item) === -1) continue;
        await enviarItem(item, sessaoForm, idEdicao);
      }
    } finally {
      filaRodando = false;
    }
    if (esperandoFotos && telaAtual === "form" && !temEnvioPendente()) {
      esperandoFotos = false;
      aoSalvar();
    }
  }

  function adicionarArquivos(lista) {
    var arquivos = Array.prototype.slice.call(lista || []);
    if (!arquivos.length) return;
    var espaco = MAX_FOTOS - fotos.length;
    if (espaco <= 0) {
      mostrarAviso("Este imóvel já tem " + MAX_FOTOS + " fotos. Remova alguma para colocar outra.", true);
      return;
    }
    if (arquivos.length > espaco) {
      mostrarAviso("Cabem só mais " + plural(espaco, "foto", "fotos") + ". As outras ficaram de fora.", true);
      arquivos = arquivos.slice(0, espaco);
    }
    arquivos.forEach(function (arq) {
      var item = { chave: "f" + ++contadorFotos, estado: "fila", arquivo: arq, previa: "" };
      var pareceFoto = /^image\//i.test(arq.type || "") || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(arq.name || "");
      if (!pareceFoto) {
        item.estado = "erro";
        item.erro = "Um dos arquivos escolhidos não é uma foto. Remova ele da lista.";
        item.erroCurto = "Não é uma foto";
        item.arquivo = null;
      } else {
        try { item.previa = URL.createObjectURL(arq); } catch (e) {}
        fila.push(item);
      }
      fotos.push(item);
    });
    formAlterado = true;
    desenharFotos();
    processarFila();
  }

  function botaoFoto(acao, rotulo, nomeIcone, desativado) {
    return (
      '<button type="button" class="foto__botao" data-foto-acao="' + acao + '" aria-label="' + rotulo + '" title="' + rotulo + '"' +
      (desativado ? " disabled" : "") + ">" + icone(nomeIcone) + "</button>"
    );
  }

  function desenharFotos() {
    var grade = $("#fotos-grade");
    grade.innerHTML = fotos.map(function (item, i) {
      var src = item.previa || item.mini || item.grande || "";
      var sobre = "";
      if (item.estado === "fila") sobre = '<span class="foto__estado">Na fila…</span>';
      else if (item.estado === "processando") sobre = '<span class="foto__estado">Preparando…</span>';
      else if (item.estado === "enviando") sobre = '<span class="foto__estado">Enviando…</span>';
      else if (item.estado === "erro") {
        sobre =
          '<span class="foto__estado foto__estado--erro">' + escapar(item.erroCurto || "Não foi enviada") +
          (item.arquivo ? '<button type="button" class="foto__repetir" data-foto-acao="repetir">Tentar de novo</button>' : "") +
          "</span>";
      }
      return (
        '<div class="foto' + (i === 0 ? " foto--capa" : "") + '" data-chave="' + item.chave + '">' +
          '<div class="foto__img">' +
            (src ? '<img src="' + escapar(src) + '" alt="Foto ' + (i + 1) + '">' : "") +
            (i === 0 ? '<span class="foto__capa">Capa</span>' : "") +
            sobre +
          "</div>" +
          '<div class="foto__acoes">' +
            botaoFoto("capa", "Usar como capa", "estrela", i === 0) +
            botaoFoto("esquerda", "Mover para a esquerda", "esquerda", i === 0) +
            botaoFoto("direita", "Mover para a direita", "direita", i === fotos.length - 1) +
            botaoFoto("remover", "Remover foto", "fechar", false) +
          "</div>" +
        "</div>"
      );
    }).join("");

    var pendentes = fotos.filter(function (f) {
      return f.estado === "fila" || f.estado === "processando" || f.estado === "enviando";
    }).length;
    $("#fotos-contador").textContent = !fotos.length
      ? "Nenhuma foto ainda. Sem foto, o site mostra um desenho no lugar."
      : fotos.length + " de " + MAX_FOTOS + " fotos" + (pendentes ? ". Enviando " + plural(pendentes, "foto", "fotos") + "…" : ".");
    $("#zona-fotos").hidden = fotos.length >= MAX_FOTOS;

    var comErro = fotos.filter(function (f) { return f.estado === "erro"; })[0];
    var aviso = $("#fotos-erro");
    aviso.textContent = comErro ? comErro.erro : "";
    aviso.hidden = !comErro;
  }

  $("#fotos-grade").addEventListener("click", function (e) {
    var botao = e.target.closest("[data-foto-acao]");
    if (!botao || botao.disabled) return;
    var chave = botao.closest("[data-chave]").dataset.chave;
    var i = fotos.findIndex(function (f) { return f.chave === chave; });
    if (i === -1) return;
    var acao = botao.dataset.fotoAcao;

    if (acao === "remover") {
      var removida = fotos.splice(i, 1)[0];
      if (removida.previa) {
        try { URL.revokeObjectURL(removida.previa); } catch (err) {}
      }
    } else if (acao === "esquerda" && i > 0) {
      fotos.splice(i - 1, 0, fotos.splice(i, 1)[0]);
    } else if (acao === "direita" && i < fotos.length - 1) {
      fotos.splice(i + 1, 0, fotos.splice(i, 1)[0]);
    } else if (acao === "capa" && i > 0) {
      fotos.unshift(fotos.splice(i, 1)[0]);
    } else if (acao === "repetir") {
      fotos[i].estado = "fila";
      fila.push(fotos[i]);
      processarFila();
    }
    formAlterado = true;
    desenharFotos();

    var mesmo = $('#fotos-grade [data-chave="' + chave + '"] [data-foto-acao="' + acao + '"]');
    if (mesmo && !mesmo.disabled) mesmo.focus();
  });

  $("#f-fotos").addEventListener("change", function (e) {
    adicionarArquivos(e.target.files);
    e.target.value = "";
  });

  var zona = $("#zona-fotos");
  ["dragenter", "dragover"].forEach(function (nome) {
    zona.addEventListener(nome, function (e) {
      e.preventDefault();
      zona.classList.add("zona-fotos--arrastando");
    });
  });
  ["dragleave", "drop"].forEach(function (nome) {
    zona.addEventListener(nome, function (e) {
      e.preventDefault();
      zona.classList.remove("zona-fotos--arrastando");
    });
  });
  zona.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) adicionarArquivos(e.dataTransfer.files);
  });

  /* Soltar uma foto fora da área não deve abrir a foto no navegador */
  ["dragover", "drop"].forEach(function (nome) {
    window.addEventListener(nome, function (e) {
      if (telaAtual === "form" && !zona.contains(e.target)) e.preventDefault();
    });
  });

  iniciar();
})();
