(function () {
  const state = {
    owner: "XiangwanGuan",
    repo: "Shadowrocket",
    path: "Release/Modules",
    apps: new Map(),
    extraModule: "Module.sgmodule",
    pendingInstall: null,
  };
  const CACHE_KEY = "module_cache";
  const CACHE_EXPIRE = 60 * 60 * 1000;
  const $ = (s) => document.querySelector(s);

  const showToast = (msg) => {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2000);
  };

  const setStatus = (t, p) => {
    const s = $("#status");
    if (s) s.textContent = t;
    const bar = $("#bar");
    if (bar) bar.style.width = (p || 0) + "%";
  };

  const extractDomains = (txt) => {
    const domains = new Set();
    txt.split(/\r?\n/).forEach((line) => {
      if (/^hostname\s*=/.test(line.trim())) {
        let rhs = line.split("=")[1] || "";
        rhs = rhs.replace(/#.*/, "").trim();
        rhs = rhs.replace(/%APPEND%/g, "").trim();
        rhs
          .split(/[,\s]+/)
          .filter(Boolean)
          .forEach((d) => domains.add(d));
      }
    });
    return domains;
  };

  const antiKill = (txt) => {
    const domains = new Set();
    txt.split(/\r?\n/).forEach((line) => {
      if (/^hostname\s*=/.test(line.trim())) {
        let rhs = line.split("=")[1] || "";
        rhs = rhs.replace(/#.*/, "").trim();
        rhs = rhs.replace(/%APPEND%/g, "").trim();
        rhs
          .split(/[,\s]+/)
          .filter(Boolean)
          .forEach((d) => domains.add(d.replace(/^-/, "")));
      }
    });
    if (!domains.size) return "";
    return `[MITM]\nhostname = %APPEND% ${[...domains]
      .map((d) => `-${d}`)
      .join(",")}`;
  };

  const parseFile = (name, txt) => {
    const appName =
      name === "Module.sgmodule"
        ? "融合模块"
        : name.replace(/\.sgmodule$/i, "");
    state.apps.set(appName, {
      domains: extractDomains(txt),
      raw: txt,
      rule: antiKill(txt),
      fileName: name,
    });
  };

  const fuzzyMatch = (text, query) => {
    if (!query) return true;
    text = text.toLowerCase();
    query = query.toLowerCase();
    if (text.includes(query)) return true;
    let i = 0;
    for (const c of text) {
      if (c === query[i]) i++;
      if (i === query.length) return true;
    }
    return false;
  };

  const renderResults = (q) => {
    const root = $("#results");
    root.innerHTML = "";
    const entries = [...state.apps.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    const matched = q ? entries.filter(([k]) => fuzzyMatch(k, q)) : entries;

    const frag = document.createDocumentFragment();
    matched.forEach(([app, data]) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
          <div class="header-row">
            <h3>${app}</h3>
            <span class="badge">解密域名：${data.domains.size}</span>
          </div>
          <div class="meta">
            <button class="btn" data-copy>反解密模块</button>
            <button class="btn" data-raw>查看原始模块</button>
            <button class="btn" data-install>安装此模块</button>
          </div>
          <pre class="code">${[...data.domains].join("\n")}</pre>
        `;
      frag.appendChild(card);
    });
    root.appendChild(frag);
  };

  const attachEvents = () => {
    const modal = $("#modal");
    const closeBtn = $("#modalClose");
    const confirmModal = $("#confirmModal");
    const confirmClose = $("#confirmClose");
    const confirmCancel = $("#confirmCancel");
    const confirmOk = $("#confirmOk");

    $("#results").addEventListener("click", (e) => {
      const card = e.target.closest(".card");
      if (!card) return;
      const app = card.querySelector("h3").innerText;
      const data = state.apps.get(app);

      if (e.target.matches("[data-copy]")) {
        if (!data.rule) {
          showToast("无可复制内容");
          return;
        }
        const header = `#!name=反解密模块-${app}\n#!desc=请放置于模块列表下方\n`;
        navigator.clipboard.writeText(header + data.rule);
        showToast("已复制内容，请自行新建模块！");
      }

      if (e.target.matches("[data-raw]")) {
        $("#modalBody").textContent = data.raw;
        modal.style.display = "flex";
        requestAnimationFrame(() => modal.classList.add("show"));
      }

      if (e.target.matches("[data-install]")) {
        state.pendingInstall = data.fileName;
        confirmModal.style.display = "flex";
        requestAnimationFrame(() => confirmModal.classList.add("show"));
      }
    });

    closeBtn.onclick = () => {
      modal.classList.remove("show");
      setTimeout(() => (modal.style.display = "none"), 200);
    };
    modal.onclick = (e) => {
      if (e.target.id === "modal") closeBtn.click();
    };

    confirmClose.onclick = () => {
      confirmModal.classList.remove("show");
      setTimeout(() => (confirmModal.style.display = "none"), 200);
    };
    confirmCancel.onclick = confirmClose.onclick;
    confirmModal.onclick = (e) => {
      if (e.target.id === "confirmModal") confirmClose.click();
    };

    confirmOk.onclick = () => {
      if (state.pendingInstall) {
        const moduleName = encodeURIComponent(state.pendingInstall);
        const url = `https://xiangwanguan.github.io/Shadowrocket/Static/Redirect.html?url=shadowrocket://install?module=https://xiangwanguan.github.io/Shadowrocket/Release/Modules/${moduleName}`;
        window.open(url, "_blank");
      }
      confirmClose.click();
    };

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (modal.classList.contains("show")) closeBtn.click();
        if (confirmModal.classList.contains("show")) confirmClose.click();
      }
    });
  };

  const fetchJSON = async (url) => {
    const r = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!r.ok) throw new Error(r.status + ": " + (await r.text()));
    return r.json();
  };

  const saveToCache = () => {
    const appsArray = [...state.apps.entries()];
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ts: Date.now(), apps: appsArray })
    );
  };

  const loadFromCache = () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (Date.now() - data.ts > CACHE_EXPIRE) return false;
      state.apps = new Map(data.apps);
      renderResults($("#q").value.trim());
      setStatus(`已从缓存加载：${state.apps.size}个应用`, 100);
      return true;
    } catch {
      return false;
    }
  };

  const load = async () => {
    setStatus("正在准备数据", 0);

    const list = await fetchJSON(
      `https://api.github.com/repos/${state.owner}/${state.repo}/contents/${state.path}`
    );
    const files = list.filter((x) => x.type === "file");

    files.push({
      name: state.extraModule,
      download_url: `https://raw.githubusercontent.com/${state.owner}/${state.repo}/main/Release/${state.extraModule}`,
    });

    let done = 0;
    const total = files.length;

    await Promise.all(
      files.map(async (f) => {
        const txt = await fetch(f.download_url).then((r) => r.text());
        parseFile(f.name, txt);
        done++;
        setStatus(
          `正在加载 ${done}/${total}`,
          Math.round((done / total) * 100)
        );
      })
    );

    setStatus(`成功加载：${state.apps.size}个应用`, 100);
    renderResults($("#q").value.trim());
    saveToCache();
  };

  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  const main = () => {
    $("#reload").onclick = () => {
      state.apps.clear();
      load().catch((e) => {
        setStatus("失败", 100);
        alert(e.message);
      });
    };

    $("#q").addEventListener(
      "input",
      debounce((e) => renderResults(e.target.value.trim()), 120)
    );
    attachEvents();
    $("#q").focus({ preventScroll: true });
    $("#q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.target.blur();
    });

    if (!loadFromCache()) {
      load().catch((e) => {
        setStatus("失败", 100);
        alert(e.message);
      });
    }

    const backBtn = document.getElementById("backToTop");
    window.addEventListener("scroll", () => {
      if (window.scrollY > 200) backBtn.classList.add("visible");
      else backBtn.classList.remove("visible");
    });
    backBtn.addEventListener("click", () =>
      window.scrollTo({ top: 0, behavior: "smooth" })
    );
  };

  main();
})();
