/* Ming Yue — Arquivo de Lore
   GSAP (ScrollTrigger, SplitText, ScrambleText) + Lenis */
(() => {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover:hover) and (pointer:fine)").matches;

  // sempre começa do topo: a entrada depende disso
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  scrollTo(0, 0);
  document.body.classList.add("is-loading");

  // Imagens: usa o arquivo local; se não existir, cai para a URL de origem.
  $$("img[data-fallback]").forEach((img) => {
    const swap = () => {
      if (img.dataset.fallback) { img.src = img.dataset.fallback; delete img.dataset.fallback; }
    };
    img.addEventListener("error", swap, { once: true });
    if (img.complete && img.naturalWidth === 0) swap();
  });

  if (!window.gsap) { // CDN indisponível: mostra a página estática
    $("#loader")?.remove();
    document.body.classList.remove("is-loading");
    return;
  }

  gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);
  const SCR = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#/_";

  /* ---------- Scroll suave ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  $$('a[href^="#"]').forEach((a) =>
    a.addEventListener("click", (e) => {
      const t = $(a.getAttribute("href"));
      if (!t) return;
      e.preventDefault();
      lenis ? lenis.scrollTo(t, { duration: 1.6 }) : t.scrollIntoView();
    })
  );

  /* ---------- Trilha sonora (player do YouTube) ----------
     Para trocar a música, mude o id (o trecho depois de "v=" no link do vídeo) e o título. */
  const TRACK = { id: "wS1WqCgpnYo", title: "Autumn Dusk in This World — Arknights: Endfield OST" };
  const VOLUME = 20; // 0 a 100
  (() => {
    const btn = $(".sound"), label = $(".sound-label"), dock = $(".bgm-dock");
    if (!btn || !dock) return;
    $(".bgm-title").textContent = "♪ " + TRACK.title;
    let player = null, ready = false, on = false;
    const vol = { v: 0 };
    const fade = (to, done) => gsap.to(vol, { v: to, duration: to ? 4 : 0.7, overwrite: true, onUpdate: () => ready && player.setVolume(vol.v), onComplete: done });
    const fail = () => { on = false; btn.classList.remove("on"); dock.classList.remove("on"); btn.disabled = true; label.textContent = "SEM FAIXA"; };
    const show = (state) => {
      on = state;
      btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", String(on));
      dock.classList.toggle("on", on); dock.setAttribute("aria-hidden", String(!on));
    };
    const play = () => { player.setVolume(0); player.playVideo(); fade(VOLUME); };
    // Navegadores só liberam som depois de um gesto do visitante. A trilha tenta tocar
    // ao abrir; se for bloqueada, começa no primeiro clique, toque ou tecla.
    const gestures = ["pointerdown", "keydown", "touchend"];
    const unlock = (e) => {
      if (e.target.closest && e.target.closest(".sound, .bgm-dock")) return;
      if (on && ready && player.getPlayerState() !== 1) play();
    };
    const armed = (yes) => gestures.forEach((g) => window[yes ? "addEventListener" : "removeEventListener"](g, unlock, true));
    const create = () => {
      player = new YT.Player("bgm-player", {
        videoId: TRACK.id, host: "https://www.youtube-nocookie.com",
        playerVars: { autoplay: 1, loop: 1, playlist: TRACK.id, controls: 1, rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: () => { ready = true; if (on) play(); },
          onStateChange: (ev) => { if (ev.data === 1) armed(false); },
          onError: fail,
        },
      });
    };
    const start = () => {
      show(true); armed(true);
      if (ready) return play();
      if (player) return;
      if (window.YT && YT.Player) return create();
      window.onYouTubeIframeAPIReady = create;
      const sc = document.createElement("script");
      sc.src = "https://www.youtube.com/iframe_api"; sc.onerror = fail;
      document.head.appendChild(sc);
    };
    const stop = () => { show(false); armed(false); if (ready) fade(0, () => player.pauseVideo()); };
    const remember = (v) => { try { localStorage.setItem("bgm", v); } catch (e) {} };
    const toggle = (e) => {
      e.stopPropagation();
      if (on) { stop(); remember("off"); } else { start(); remember("on"); }
    };
    btn.addEventListener("click", toggle);
    $(".bgm-close").addEventListener("click", toggle);
    // começa ligada, a não ser que o visitante já tenha desligado numa visita anterior
    let pref = "on";
    try { pref = localStorage.getItem("bgm") || "on"; } catch (e) {}
    if (pref !== "off") start();
  })();

  /* ---------- Cursor ---------- */
  if (fine && !reduce) {
    const cur = $(".cursor");
    const xTo = gsap.quickTo(cur, "x", { duration: 0.35, ease: "power3" });
    const yTo = gsap.quickTo(cur, "y", { duration: 0.35, ease: "power3" });
    addEventListener("mousemove", (e) => { xTo(e.clientX); yTo(e.clientY); });
    $$("a, button, .page-frame").forEach((el) => {
      el.addEventListener("mouseenter", () => cur.classList.add("hover"));
      el.addEventListener("mouseleave", () => cur.classList.remove("hover"));
    });
  }

  /* ---------- Pétalas e estilhaços (canvas 2D) ---------- */
  const petals = (() => {
    const cv = $("#petals");
    if (reduce || !cv) return { burst() {} };
    const ctx = cv.getContext("2d");
    const COLORS = ["#b0303c", "#d45761", "#792128", "#111122", "#309c9e"];
    let w, h, dpr, parts = [], vel = 0, mx = -999, my = -999;
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = cv.width = innerWidth * dpr; h = cv.height = innerHeight * dpr;
    };
    const make = (x, y, burst) => ({
      x: x ?? Math.random() * w, y: y ?? Math.random() * h,
      s: (4 + Math.random() * 11) * dpr,
      vx: burst ? (Math.random() - 0.5) * 18 * dpr : (-0.4 - Math.random() * 1.1) * dpr,
      vy: burst ? (Math.random() - 0.7) * 16 * dpr : (0.25 + Math.random() * 0.9) * dpr,
      r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.07,
      f: Math.random() * 6.28, c: COLORS[(Math.random() * COLORS.length) | 0],
      shard: Math.random() < 0.3, life: burst ? 1 : Infinity,
    });
    resize(); addEventListener("resize", resize);
    const N = innerWidth < 800 ? 22 : 46;
    for (let i = 0; i < N; i++) parts.push(make());
    addEventListener("mousemove", (e) => { mx = e.clientX * dpr; my = e.clientY * dpr; });
    gsap.ticker.add(() => {
      ctx.clearRect(0, 0, w, h);
      vel *= 0.92;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.f += 0.03; p.r += p.vr;
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy, R = 130 * dpr;
        if (d2 < R * R) { const d = Math.sqrt(d2) || 1, k = (1 - d / R) * 1.4; p.vx += (dx / d) * k; p.vy += (dy / d) * k; }
        p.x += p.vx + Math.sin(p.f) * 0.6 * dpr;
        p.y += p.vy - vel * 0.02 * dpr * (p.s / (8 * dpr));
        if (p.life !== Infinity) { p.vy += 0.25 * dpr; p.vx *= 0.97; p.life -= 0.012; if (p.life <= 0) { parts.splice(i, 1); continue; } }
        else {
          p.vx += ((-0.4 - 0.7) * dpr - p.vx) * 0.01; p.vy += (0.6 * dpr - p.vy) * 0.01;
          if (p.x < -40) p.x = w + 30; if (p.y > h + 40) p.y = -30; if (p.y < -60) p.y = h + 30; if (p.x > w + 60) p.x = -30;
        }
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.scale(1, 0.35 + Math.abs(Math.cos(p.f)) * 0.65);
        ctx.globalAlpha = Math.min(1, p.life) * 0.85;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        if (p.shard) { ctx.moveTo(-p.s, -p.s * 0.2); ctx.lineTo(p.s, -p.s * 0.05); ctx.lineTo(p.s * 0.7, p.s * 0.25); ctx.lineTo(-p.s * 0.8, p.s * 0.15); }
        else { ctx.moveTo(0, -p.s); ctx.quadraticCurveTo(p.s * 0.8, 0, 0, p.s); ctx.quadraticCurveTo(-p.s * 0.8, 0, 0, -p.s); }
        ctx.fill(); ctx.restore();
      }
    });
    return {
      setVel(v) { vel = v; },
      burst(x, y, n = 26) { for (let i = 0; i < n; i++) parts.push(make(x * dpr, y * dpr, true)); },
    };
  })();
  addEventListener("click", (e) => petals.burst(e.clientX, e.clientY, 18));

  /* ---------- Animações de página ---------- */
  let heroSplit = null;
  function build() {
    const mm = gsap.matchMedia();
    gsap.set(".hero-title", { xPercent: -50, yPercent: -50 });

    // barra de progresso + marquee reagindo à velocidade
    gsap.to(".nav-progress b", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });
    const mq = gsap.to(".marquee-track", { xPercent: -50, duration: 22, ease: "none", repeat: -1 });
    ScrollTrigger.create({
      onUpdate(self) {
        const v = self.getVelocity();
        petals.setVel?.(v);
        if (reduce) return;
        gsap.to(mq, { timeScale: 1 + Math.min(Math.abs(v) / 300, 7), duration: 0.2, overwrite: true });
        gsap.to(mq, { timeScale: 1, duration: 1.2, delay: 0.2 });
        gsap.to(".marquee-track", { skewX: gsap.utils.clamp(-14, 14, v / -220), duration: 0.3, overwrite: "auto" });
      },
    });

    // seção escura: troca a cor da navegação
    const darks = $$(".page.dark, .footer");
    const checkDark = () => {
      const on = darks.some((el) => { const r = el.getBoundingClientRect(); return r.top <= 40 && r.bottom > 40; });
      document.body.classList.toggle("on-dark", on);
    };
    ScrollTrigger.create({ start: 0, end: "max", onUpdate: checkDark, onRefresh: checkDark });

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      /* HERO: parallax no scroll e no mouse */
      heroSplit = SplitText.create(".hero-title", { type: "chars", charsClass: "char" });
      // valores iniciais explícitos: o scrub não pode herdar o estado da animação de entrada
      const heroTl = gsap.timeline({ scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: true } });
      heroTl
        .fromTo(".hero-art-scroll", { yPercent: 0, scale: 1 }, { yPercent: -14, scale: 1.12, ease: "none" }, 0)
        .fromTo(".hero-title", { yPercent: -50, scale: 1 }, { yPercent: -14, scale: 0.86, ease: "none" }, 0)
        .fromTo(".hero-title .l1", { xPercent: 0 }, { xPercent: -8, ease: "none" }, 0)
        .fromTo(".hero-title .l2", { xPercent: 0 }, { xPercent: 8, ease: "none" }, 0)
        .fromTo(".hero-shards", { yPercent: 0 }, { yPercent: -45, ease: "none" }, 0)
        .fromTo(".hero-hanzi", { yPercent: 0 }, { yPercent: -60, ease: "none" }, 0)
        .fromTo(".hero-fade", { autoAlpha: 1 }, { autoAlpha: 0, ease: "none", duration: 0.3 }, 0);
      if (fine) {
        const layers = [[".hero-art img", 26], [".hero-title", -14], [".shard", 48], [".hero-hanzi", -30]].map(([s, d]) => ({
          x: gsap.quickTo(s, "x", { duration: 0.9, ease: "power3" }), y: gsap.quickTo(s, "y", { duration: 0.9, ease: "power3" }), d,
        }));
        $("#hero").addEventListener("mousemove", (e) => {
          const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
          layers.forEach((l) => { l.x(nx * l.d); l.y(ny * l.d); });
        });
      }
      gsap.to(".shard", { yPercent: "random(-30,30)", xPercent: "random(-8,8)", duration: "random(3,5)", ease: "sine.inOut", repeat: -1, yoyo: true, stagger: 0.3 });

      /* Títulos de seção */
      $$(".sec-head").forEach((head) => {
        const title = $(".sec-title", head);
        const split = SplitText.create(title, { type: "chars", mask: "chars" });
        gsap.timeline({ scrollTrigger: { trigger: head, start: "top 82%" } })
          .from(split.chars, { yPercent: 110, rotation: 8, duration: 1, ease: "expo.out", stagger: 0.035 })
          .from($(".sec-rule", head), { scaleX: 0, duration: 1.2, ease: "expo.inOut" }, 0.1)
          .from($(".sec-num", head), { autoAlpha: 0, x: -20, duration: 0.6 }, 0.2);
      });

      /* PERFIL */
      gsap.timeline({ scrollTrigger: { trigger: ".perfil-photo", start: "top 78%" } })
        .fromTo(".perfil-photo-inner", { clipPath: "polygon(0 0,0 0,0 100%,0 100%)" }, { clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)", duration: 1.4, ease: "expo.inOut" })
        .from(".corner", { scale: 0, duration: 0.5, stagger: 0.1, ease: "back.out(3)" }, 0.9)
        .from(".perfil-photo figcaption", { autoAlpha: 0, y: 10, duration: 0.5 }, 1);
      gsap.fromTo(".perfil-photo img", { yPercent: -8 }, { yPercent: 8, ease: "none", scrollTrigger: { trigger: ".perfil-photo", scrub: true } });
      gsap.from(".perfil-data > div", { autoAlpha: 0, x: 40, duration: 0.7, ease: "power3.out", stagger: 0.07, scrollTrigger: { trigger: ".perfil-data", start: "top 80%" } });
      gsap.from(".bars i", { scaleX: 0, transformOrigin: "left", duration: 0.4, stagger: 0.08, scrollTrigger: { trigger: ".bars", start: "top 85%" } });
      $$("[data-scramble]").forEach((el) => {
        const text = el.textContent;
        ScrollTrigger.create({
          trigger: el, start: "top 92%", once: true,
          onEnter: () => gsap.to(el, { duration: 1.3, scrambleText: { text, chars: SCR, speed: 0.6, revealDelay: 0.25 } }),
        });
      });
      $$("[data-words]").forEach((el) => {
        const s = SplitText.create(el, { type: "words" });
        gsap.fromTo(s.words, { opacity: 0.1 }, { opacity: 1, ease: "none", stagger: 0.1, scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 45%", scrub: true } });
      });

      /* CRONOLOGIA */
      gsap.to(".tl-line b", { scaleY: 1, ease: "none", scrollTrigger: { trigger: ".tl", start: "top 65%", end: "bottom 65%", scrub: 0.4 } });
      $$(".tl-item").forEach((it, i) => {
        const left = i % 2 === 0;
        gsap.from(it, { autoAlpha: 0, x: left ? -70 : 70, duration: 1, ease: "expo.out", scrollTrigger: { trigger: it, start: "top 78%" } });
      });

      /* CITAÇÃO */
      $$("[data-lines]").forEach((el) => {
        SplitText.create(el, {
          type: "lines", mask: "lines", autoSplit: true,
          onSplit: (self) => gsap.from(self.lines, { yPercent: 110, duration: 1.1, ease: "expo.out", stagger: 0.12, scrollTrigger: { trigger: el, start: "top 80%" } }),
        });
      });
      gsap.fromTo(".quote-hanzi", { rotation: -8, scale: 0.8 }, { rotation: 8, scale: 1.1, ease: "none", scrollTrigger: { trigger: ".quote", scrub: true } });
      gsap.from(".quote cite", { autoAlpha: 0, y: 20, duration: 0.8, scrollTrigger: { trigger: ".quote cite", start: "top 92%" } });

      /* RODAPÉ */
      gsap.from(".footer-big", { yPercent: 60, letterSpacing: "0.3em", ease: "none", scrollTrigger: { trigger: ".footer", start: "top bottom", end: "bottom bottom", scrub: true } });
    });

    /* HISTÓRIA: páginas alternadas, imagem fixa de um lado e texto do outro */
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      $$(".act-band .marquee-track").forEach((t, i) => {
        const dir = i % 2 ? 1 : -1;
        gsap.fromTo(t, { xPercent: dir > 0 ? -35 : 0 }, { xPercent: dir > 0 ? 0 : -35, ease: "none", scrollTrigger: { trigger: t.parentNode, start: "top bottom", end: "bottom top", scrub: true } });
        gsap.fromTo(t.parentNode, { rotation: dir * 2.2 }, { rotation: dir * -2.2, ease: "none", scrollTrigger: { trigger: t.parentNode, start: "top bottom", end: "bottom top", scrub: true } });
      });
      $$(".page").forEach((page) => {
        const flip = page.classList.contains("flip");
        const frame = $(".page-frame", page), holder = $(".page-img", page), img = $("img", page), wipe = $(".page-wipe", page), num = $(".page-num", page);
        // entrada da imagem: a moldura desce, a cortina colorida abre e a foto assenta
        gsap.set(holder, { autoAlpha: 0 });
        gsap.timeline({ scrollTrigger: { trigger: page, start: "top 58%", toggleActions: "play none none reverse" } })
          .fromTo(frame, { clipPath: "inset(-40px -40px 100% -40px)", y: -90, rotation: flip ? 5 : -5 }, { clipPath: "inset(-40px -40px -40px -40px)", y: 0, rotation: 0, duration: 0.9, ease: "expo.inOut" })
          .fromTo(wipe, { scaleY: 1 }, { scaleY: 1, duration: 0.01 }, 0)
          .set(holder, { autoAlpha: 1 }, 0.85)
          .to(wipe, { scaleY: 0, transformOrigin: "bottom", duration: 0.9, ease: "expo.inOut" }, 0.85)
          .fromTo(img, { scale: 1.45 }, { scale: 1, duration: 1.7, ease: "expo.out" }, 0.85)
          .from($(".page-cap", page), { autoAlpha: 0, y: 16, duration: 0.5 }, 1.3);
        gsap.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: "none", scrollTrigger: { trigger: page, start: "top bottom", end: "bottom top", scrub: true } });
        gsap.fromTo(num, { yPercent: -15, xPercent: flip ? 14 : -14 }, { yPercent: -85, xPercent: 0, ease: "none", scrollTrigger: { trigger: page, start: "top bottom", end: "bottom top", scrub: true } });
        // saída: a moldura encolhe e gira de leve quando a próxima página chega
        gsap.to(frame, { scale: 0.86, rotation: flip ? -4 : 4, ease: "none", immediateRender: false, scrollTrigger: { trigger: page, start: "bottom 85%", end: "bottom 15%", scrub: true } });

        // texto
        const head = $(".page-head", page);
        const split = SplitText.create($(".page-title", page), { type: "words,chars", mask: "chars" });
        gsap.timeline({ scrollTrigger: { trigger: head, start: "top 82%", toggleActions: "play none none reverse" } })
          .from($(".page-tag", page), { autoAlpha: 0, x: flip ? 40 : -40, duration: 0.6, ease: "power3.out" })
          .from(split.chars, { yPercent: 115, rotation: 10, duration: 0.9, ease: "expo.out", stagger: 0.025 }, 0.05)
          .from($(".page-rule", page), { scaleX: 0, duration: 1.1, ease: "expo.inOut" }, 0.2);
        $$(".page-text p", page).forEach((p) =>
          gsap.from(p, { autoAlpha: 0, y: 60, duration: 1, ease: "power3.out", scrollTrigger: { trigger: p, start: "top 90%", toggleActions: "play none none reverse" } })
        );
        const pull = $(".pull", page);
        gsap.from(pull, { autoAlpha: 0, x: flip ? -90 : 90, skewX: flip ? 8 : -8, duration: 1, ease: "expo.out", scrollTrigger: { trigger: pull, start: "top 86%", toggleActions: "play none none reverse" } });
        gsap.from($(".page-foot", page), { autoAlpha: 0, duration: 0.8, scrollTrigger: { trigger: $(".page-foot", page), start: "top 95%" } });
        gsap.to($(".page-rail b", page), { scaleY: 1, ease: "none", scrollTrigger: { trigger: $(".page-text", page), start: "top 60%", end: "bottom 60%", scrub: 0.3 } });
      });
    });

    ScrollTrigger.refresh();
  }

  /* ---------- Entrada ---------- */
  function intro() {
    const unlock = () => { document.body.classList.remove("is-loading"); lenis?.start(); ScrollTrigger.refresh(); };
    if (reduce || !heroSplit) return unlock();
    const title = heroSplit;
    gsap.timeline({ defaults: { ease: "expo.out" } })
      .from(".hero-lines i", { scaleY: 0, duration: 1.4, stagger: 0.08, ease: "expo.inOut" }, 0)
      .from(title.chars, { yPercent: 120, rotation: (i) => (i % 2 ? 14 : -14), autoAlpha: 0, duration: 1.5, stagger: 0.07 }, 0.1)
      .from(".hero-art", { yPercent: 30, scale: 0.8, autoAlpha: 0, filter: "blur(24px)", duration: 1.9 }, 0.35)
      .from(".shard", { scale: 0, rotation: "random(-180,180)", duration: 1.3, stagger: 0.08, ease: "back.out(1.4)" }, 0.7)
      .from(".hero-hanzi", { autoAlpha: 0, y: -60, duration: 1.2 }, 0.9)
      .from(".hero-sub, .hero-meta, .hero-scroll, .nav", { autoAlpha: 0, y: 20, duration: 0.9, stagger: 0.1 }, 1.1)
      .add(unlock, 1.7)
      .add(() => petals.burst(innerWidth / 2, innerHeight * 0.55, 60), 0.8)
      .add(() => $$(".hero [data-scramble]").forEach((el) => gsap.to(el, { duration: 1.4, scrambleText: { text: el.textContent, chars: SCR, speed: 0.6 } })), 1.2);
  }

  function boot() {
    const loader = $("#loader");
    const fonts = document.fonts?.ready ?? Promise.resolve();
    const hero = $(".hero-art img");
    const imgReady = new Promise((res) => {
      const done = () => (hero.naturalWidth ? res() : null);
      if (hero.complete && hero.naturalWidth) return res();
      hero.addEventListener("load", done);
      setTimeout(res, 6000); // não trava o site se a imagem falhar
    });
    const ready = Promise.all([fonts, imgReady]);

    if (reduce) { ready.then(() => { loader.remove(); build(); intro(); }); return; }

    const st = { v: 0 };
    const num = $("#loader-num"), fill = $("#loader-fill");
    const paint = () => { num.textContent = String(Math.round(st.v)).padStart(3, "0"); gsap.set(fill, { scaleX: st.v / 100 }); };
    const tl = gsap.timeline();
    tl.to(st, { v: 82, duration: 1.6, ease: "power2.out", onUpdate: paint });
    ready.then(() => {
      build();
      tl.to(st, { v: 100, duration: 0.5, ease: "power1.in", onUpdate: paint })
        .to(".loader-inner", { autoAlpha: 0, scale: 0.94, duration: 0.4, ease: "power2.in" })
        .to(".loader-shutter", { scaleX: 1, duration: 0.7, ease: "expo.inOut", stagger: 0.09 }, "<0.1")
        .add(() => { gsap.set(loader, { background: "transparent" }); intro(); })
        .to(".loader-shutter", { scaleX: 0, transformOrigin: (i) => (i === 1 ? "left" : "right"), duration: 0.8, ease: "expo.inOut", stagger: 0.09 })
        .add(() => loader.remove());
    });
  }

  boot();
})();
