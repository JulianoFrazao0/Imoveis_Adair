/* BANCO DE DADOS
   Com o Supabase preenchido no config.js, os imóveis ficam online e aparecem para todos na hora.
   Sem o Supabase, o site funciona em "modo de teste": tudo fica salvo só neste navegador. */
var Banco = (function () {
  "use strict";

  var URL_SUPABASE = String(CONFIG.supabaseUrl || "").trim().replace(/\/+$/, "");
  var CHAVE = String(CONFIG.supabaseChave || "").trim();
  var online = !!(URL_SUPABASE && CHAVE);
  var PASTA = "fotos";
  var CHAVE_TESTE = "adairimoveis_teste";
  var cliente = null;

  /* Tamanho das fotos depois de reduzidas (maior lado, em pixels) */
  var tamanhos = online
    ? { grande: 1600, qualidadeGrande: 0.82, mini: 640, qualidadeMini: 0.76 }
    : { grande: 1000, qualidadeGrande: 0.72, mini: 420, qualidadeMini: 0.7 };

  function sb() {
    if (cliente) return cliente;
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("SEM_BIBLIOTECA");
    }
    cliente = window.supabase.createClient(URL_SUPABASE, CHAVE);
    return cliente;
  }

  function conferir(resposta) {
    if (resposta && resposta.error) throw resposta.error;
    return resposta ? resposta.data : null;
  }

  /* Traduz os erros mais comuns para o corretor entender o que fazer */
  function mensagemDeErro(erro) {
    var msg = String((erro && (erro.message || erro.error_description || erro.msg)) || erro || "");
    var cod = String((erro && (erro.code || erro.statusCode || erro.status)) || "");
    var m = msg.toLowerCase();

    if (msg === "SEM_BIBLIOTECA") return "Não foi possível carregar o Supabase. Confira a internet e recarregue a página.";
    if (msg === "PERMISSAO_OU_EXCLUIDO") return "Não foi possível salvar. O imóvel pode ter sido excluído, ou este login não tem permissão de administrador.";
    if (m.indexOf("invalid login credentials") > -1) return "E-mail ou senha incorretos.";
    if (m.indexOf("email not confirmed") > -1) return "Este e-mail ainda não foi confirmado no Supabase. Veja o passo 3 do LEIA-ME.";
    if (cod === "42501" || cod === "403" || m.indexOf("row-level security") > -1 || m.indexOf("permission denied") > -1) {
      return "Este login não tem permissão para alterar os imóveis. Confira se o e-mail está na lista de administradores (LEIA-ME, passo 2).";
    }
    if (cod === "PGRST205" || cod === "42P01" || m.indexOf("could not find the table") > -1 || m.indexOf("does not exist") > -1) {
      return "O banco de dados ainda não foi preparado. Rode o arquivo supabase.sql no Supabase (LEIA-ME, passo 2).";
    }
    if (m.indexOf("bucket not found") > -1) return "A pasta de fotos não existe no Supabase. Rode o arquivo supabase.sql de novo (LEIA-ME, passo 2).";
    if (m.indexOf("api key") > -1 || cod === "401") return "A chave do Supabase no config.js está errada. Confira o passo 4 do LEIA-ME.";
    if (m.indexOf("jwt expired") > -1 || m.indexOf("refresh token") > -1) return "Sua sessão terminou. Saia e entre de novo.";
    if (m.indexOf("failed to fetch") > -1 || m.indexOf("networkerror") > -1 || m.indexOf("network request failed") > -1 || m.indexOf("load failed") > -1) {
      return "Sem conexão com a internet. Confira e tente de novo.";
    }
    if ((erro && erro.name === "QuotaExceededError") || m.indexOf("quota") > -1) {
      return "O navegador ficou sem espaço no modo de teste. Exclua alguns imóveis de teste ou use menos fotos.";
    }
    if (cod === "413" || m.indexOf("maximum allowed size") > -1 || m.indexOf("too large") > -1) return "A foto ficou grande demais para enviar. Tente outra foto.";
    if (m.indexOf("mime type") > -1) return "Esse tipo de arquivo não é aceito. Envie uma foto em JPG ou PNG.";
    return msg ? "Não foi possível concluir: " + msg : "Não foi possível concluir. Tente de novo.";
  }

  /* ---------- Modo de teste ---------- */

  function exemplos() {
    var agora = Date.now();
    var lista = [
      { finalidade: "venda", tipo: "casa", titulo: "Casa com 3 quartos e quintal (exemplo)", preco: 480000, localizacao: "Jardim das Flores, Cidade Exemplo", area: 150, quartos: 3, banheiros: 2, vagas: 2, destaque: true, descricao: "Casa térrea com sala ampla, cozinha planejada, 3 quartos sendo 1 suíte, garagem para 2 carros e quintal com churrasqueira.\nRua tranquila, perto de escola e mercado." },
      { finalidade: "venda", tipo: "casa", titulo: "Casa em condomínio fechado (exemplo)", preco: 890000, localizacao: "Residencial Ipê, Cidade Exemplo", condominio: true, nome_condominio: "Residencial Ipê", area: 220, quartos: 4, banheiros: 3, vagas: 3, descricao: "Casa de 2 andares em condomínio com portaria 24 horas, área de lazer e piscina.\n4 quartos, 3 vagas de garagem e espaço gourmet." },
      { finalidade: "venda", tipo: "apartamento", titulo: "Apartamento com 2 quartos no centro (exemplo)", preco: 320000, localizacao: "Centro, Cidade Exemplo", condominio: true, nome_condominio: "Edifício Central", area: 68, quartos: 2, banheiros: 1, vagas: 1, descricao: "Apartamento no 5º andar com sacada, 2 quartos, 1 vaga de garagem e elevador.\nPerto de comércio, banco e transporte." },
      { finalidade: "aluguel", tipo: "apartamento", titulo: "Apartamento para alugar, 2 quartos (exemplo)", preco: 1800, localizacao: "Bairro Universitário, Cidade Exemplo", condominio: true, nome_condominio: "Residencial Campus", area: 55, quartos: 2, banheiros: 1, vagas: 1, descricao: "Apartamento com 2 quartos, sala, cozinha e 1 vaga. Condomínio com portaria.\nAceita pets de pequeno porte." },
      { finalidade: "aluguel", tipo: "casa", titulo: "Casa para alugar com 2 quartos (exemplo)", preco: 2500, localizacao: "Vila Nova, Cidade Exemplo", area: 110, quartos: 2, banheiros: 1, vagas: 1, situacao: "reservado", descricao: "Casa com 2 quartos, sala, cozinha, quintal e garagem coberta." },
      { finalidade: "venda", tipo: "terreno", titulo: "Terreno plano de 360 m² (exemplo)", preco: 150000, localizacao: "Parque das Águas, Cidade Exemplo", area: 360, descricao: "Terreno plano, 12 x 30 metros, com escritura. Rua asfaltada, água e energia na rua." },
      { finalidade: "venda", tipo: "terreno", titulo: "Terreno em loteamento fechado (exemplo)", preco: 260000, localizacao: "Vista Verde, Cidade Exemplo", condominio: true, nome_condominio: "Loteamento Vista Verde", area: 450, descricao: "Lote de esquina em loteamento fechado com portaria e área verde." },
      { finalidade: "venda", tipo: "sitio", titulo: "Sítio de 2 hectares com casa (exemplo)", preco: 650000, localizacao: "Zona Rural, Cidade Exemplo", area: 2, area_unidade: "ha", quartos: 3, banheiros: 2, descricao: "Sítio com casa sede de 3 quartos, poço artesiano, pomar e pasto.\nAcesso por estrada de terra em boas condições." },
      { finalidade: "venda", tipo: "chacara", titulo: "Chácara de lazer com piscina (exemplo)", preco: 420000, localizacao: "Recanto das Aves, Cidade Exemplo", area: 5000, quartos: 2, banheiros: 1, descricao: "Chácara de 5.000 m² com casa, piscina, área de churrasqueira e árvores frutíferas." },
      { finalidade: "venda", tipo: "casa", titulo: "Casa vendida no mês passado (exemplo)", preco: 390000, localizacao: "Jardim Primavera, Cidade Exemplo", area: 120, quartos: 2, banheiros: 1, vagas: 1, situacao: "vendido", descricao: "Exemplo de imóvel marcado como vendido: ele não aparece no site, só aqui no painel." }
    ];
    return lista.map(function (im, i) {
      var data = new Date(agora - i * 36e5).toISOString();
      return Object.assign(
        { id: novoId(), codigo: lista.length - i, criado_em: data, atualizado_em: data },
        paraBanco(im)
      );
    });
  }

  function lerTeste() {
    try {
      var texto = localStorage.getItem(CHAVE_TESTE);
      if (texto) {
        var lista = JSON.parse(texto);
        if (Array.isArray(lista)) return lista;
      }
    } catch (e) {}
    var inicial = exemplos();
    try { gravarTeste(inicial); } catch (e) {}
    return inicial;
  }

  function gravarTeste(lista) {
    localStorage.setItem(CHAVE_TESTE, JSON.stringify(lista));
  }

  function arquivoParaDataUrl(blob) {
    return new Promise(function (ok, falha) {
      var leitor = new FileReader();
      leitor.onload = function () { ok(leitor.result); };
      leitor.onerror = function () { falha(new Error("Não foi possível ler a foto.")); };
      leitor.readAsDataURL(blob);
    });
  }

  /* ---------- Imóveis ---------- */

  /* Só os campos que o painel pode alterar, sempre com valores válidos */
  function paraBanco(im) {
    function num(v) {
      if (v === null || v === undefined || v === "") return null;
      var n = Number(v);
      return isNaN(n) || n <= 0 ? null : n;
    }
    function txt(v) {
      return v == null ? "" : String(v);
    }
    return {
      finalidade: im.finalidade === "aluguel" ? "aluguel" : "venda",
      tipo: TIPOS[im.tipo] ? im.tipo : "casa",
      titulo: txt(im.titulo),
      preco: num(im.preco) || 0,
      localizacao: txt(im.localizacao),
      condominio: !!im.condominio,
      nome_condominio: im.condominio ? txt(im.nome_condominio) : "",
      area: num(im.area),
      area_unidade: UNIDADES_AREA[im.area_unidade] ? im.area_unidade : "m2",
      quartos: num(im.quartos),
      banheiros: num(im.banheiros),
      vagas: num(im.vagas),
      descricao: txt(im.descricao),
      mapa: txt(im.mapa),
      fotos: Array.isArray(im.fotos) ? im.fotos : [],
      situacao: SITUACOES[im.situacao] ? im.situacao : "disponivel",
      destaque: !!im.destaque
    };
  }

  function maisRecentesPrimeiro(lista) {
    return lista.slice().sort(function (a, b) {
      return String(b.criado_em || "").localeCompare(String(a.criado_em || ""));
    });
  }

  async function listar() {
    if (!online) return maisRecentesPrimeiro(lerTeste());
    var dados = conferir(await sb().from("imoveis").select("*").order("criado_em", { ascending: false }));
    return dados || [];
  }

  async function salvar(im, novo) {
    var dados = paraBanco(im);

    if (!online) {
      var lista = lerTeste();
      var agora = new Date().toISOString();
      if (novo) {
        var maior = lista.reduce(function (m, i) { return Math.max(m, Number(i.codigo) || 0); }, 0);
        var criado = Object.assign({ id: im.id || novoId(), codigo: maior + 1, criado_em: agora, atualizado_em: agora }, dados);
        lista.unshift(criado);
        gravarTeste(lista);
        return criado;
      }
      var alterado = null;
      lista = lista.map(function (i) {
        if (i.id !== im.id) return i;
        alterado = Object.assign({}, i, dados, { atualizado_em: agora });
        return alterado;
      });
      if (!alterado) throw new Error("PERMISSAO_OU_EXCLUIDO");
      gravarTeste(lista);
      return alterado;
    }

    if (novo) {
      dados.id = im.id;
      return conferir(await sb().from("imoveis").insert(dados).select().single());
    }
    var linhas = conferir(await sb().from("imoveis").update(dados).eq("id", im.id).select());
    if (!linhas || !linhas.length) throw new Error("PERMISSAO_OU_EXCLUIDO");
    return linhas[0];
  }

  async function excluir(im) {
    if (!online) {
      gravarTeste(lerTeste().filter(function (i) { return i.id !== im.id; }));
      return;
    }
    var linhas = conferir(await sb().from("imoveis").delete().eq("id", im.id).select());
    if (!linhas || !linhas.length) throw new Error("PERMISSAO_OU_EXCLUIDO");
    apagarFotos(fotosDe(im));
  }

  /* ---------- Fotos ---------- */

  function caminhoDaFoto(url) {
    var texto = String(url || "");
    var marca = "/storage/v1/object/public/" + PASTA + "/";
    var i = texto.indexOf(marca);
    if (i === -1 || texto.indexOf(URL_SUPABASE) !== 0) return null;
    return decodeURIComponent(texto.slice(i + marca.length).split("?")[0]);
  }

  /* Envia a foto grande e a miniatura e devolve os links públicos */
  async function enviarFoto(pastaId, grande, mini) {
    if (!online) {
      return { grande: await arquivoParaDataUrl(grande), mini: await arquivoParaDataUrl(mini) };
    }
    var pasta = sb().storage.from(PASTA);
    var base = pastaId + "/" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    var opcoes = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
    conferir(await pasta.upload(base + "-g.jpg", grande, opcoes));
    try {
      conferir(await pasta.upload(base + "-m.jpg", mini, opcoes));
    } catch (e) {
      pasta.remove([base + "-g.jpg"]).catch(function () {});
      throw e;
    }
    return {
      grande: pasta.getPublicUrl(base + "-g.jpg").data.publicUrl,
      mini: pasta.getPublicUrl(base + "-m.jpg").data.publicUrl
    };
  }

  /* Apaga fotos que não são mais usadas (se falhar, não atrapalha o corretor) */
  function apagarFotos(lista) {
    if (!online || !lista || !lista.length) return Promise.resolve();
    var caminhos = [];
    lista.forEach(function (f) {
      [f.grande, f.mini].forEach(function (u) {
        var c = caminhoDaFoto(u);
        if (c && caminhos.indexOf(c) === -1) caminhos.push(c);
      });
    });
    if (!caminhos.length) return Promise.resolve();
    return Promise.resolve()
      .then(function () { return sb().storage.from(PASTA).remove(caminhos); })
      .catch(function () {});
  }

  /* ---------- Login ---------- */

  async function sessao() {
    if (!online) return null;
    var r = await sb().auth.getSession();
    var s = r && r.data ? r.data.session : null;
    return s && s.user ? { email: s.user.email } : null;
  }

  async function entrar(email, senha) {
    var r = await sb().auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password: senha });
    conferir(r);
    return { email: r.data.user.email };
  }

  async function sair() {
    if (!online) return;
    try { await sb().auth.signOut(); } catch (e) {}
  }

  /* true = pode alterar, false = não está na lista, null = não deu para conferir */
  async function ehAdmin() {
    if (!online) return true;
    try {
      var r = await sb().rpc("eh_admin");
      if (r.error) return null;
      return r.data === true;
    } catch (e) {
      return null;
    }
  }

  return {
    online: online,
    tamanhos: tamanhos,
    listar: listar,
    salvar: salvar,
    excluir: excluir,
    enviarFoto: enviarFoto,
    apagarFotos: apagarFotos,
    sessao: sessao,
    entrar: entrar,
    sair: sair,
    ehAdmin: ehAdmin,
    mensagemDeErro: mensagemDeErro
  };
})();
