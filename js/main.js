(function () {
  "use strict";

  // drop cap on the first text paragraph of a post
  var first = Array.prototype.find.call(
    document.querySelectorAll("body.is-post .e-content > p"),
    function (p) { return !p.querySelector("img") && p.textContent.trim().length > 20; }
  );
  if (first) first.classList.add("lead");

  // light / dark toggle
  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var root = document.documentElement;
      var bg = getComputedStyle(root).getPropertyValue("--bg").trim();
      var next = bg === "#171614" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  }

  // copy buttons for code blocks
  document.querySelectorAll("figure.highlight:not(.mermaid)").forEach(function (fig) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "复制";
    btn.addEventListener("click", function () {
      var lines = fig.querySelectorAll(".code .line");
      var text = lines.length
        ? Array.prototype.map.call(lines, function (l) { return l.innerText; }).join("\n")
        : (fig.querySelector(".code") || fig).innerText;
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = "已复制";
        setTimeout(function () { btn.textContent = "复制"; }, 1500);
      });
    });
    fig.appendChild(btn);
  });

  // auto-render mermaid diagrams (lazy-loaded only on pages with mermaid blocks)
  var mermaidNodes = [];
  document.querySelectorAll(".mermaid-box[data-mermaid]").forEach(function (box) {
    try {
      var src = decodeURIComponent(box.getAttribute("data-mermaid") || "").trim();
      if (src) mermaidNodes.push({ box: box, src: src });
    } catch (e) {}
  });
  document.querySelectorAll("figure.highlight.mermaid").forEach(function (fig) {
    var lines = fig.querySelectorAll(".code .line");
    var src = lines.length
      ? Array.prototype.map.call(lines, function (l) { return l.textContent; }).join("\n")
      : (fig.querySelector(".code") || fig).textContent;
    if (src.trim()) mermaidNodes.push({ el: fig, src: src.trim() });
  });
  document.querySelectorAll("pre > code.language-mermaid").forEach(function (code) {
    var src = code.textContent.trim();
    if (src) mermaidNodes.push({ el: code.parentElement, src: src });
  });
  if (mermaidNodes.length) {
    import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs")
      .then(function (mod) {
        var mermaid = mod.default;
        var boxes = mermaidNodes.map(function (item) {
          if (item.box) return { box: item.box, src: item.src };
          var box = document.createElement("div");
          box.className = "mermaid-box";
          item.el.parentNode.replaceChild(box, item.el);
          return { box: box, src: item.src };
        });
        var renderSeq = 0;
        var renderAll = function () {
          var isDark = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() === "#171614";
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "loose",
            theme: "base",
            fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif',
            themeVariables: isDark
              ? {
                  background: "#201f1c",
                  primaryColor: "#2a2824",
                  primaryTextColor: "#e6e2d9",
                  primaryBorderColor: "#e08a62",
                  secondaryColor: "#262420",
                  tertiaryColor: "#1b1a17",
                  lineColor: "#9c9589",
                  textColor: "#e6e2d9",
                  clusterBkg: "#1a1916",
                  clusterBorder: "#3a3731",
                  edgeLabelBackground: "#201f1c"
                }
              : {
                  background: "#f3efe7",
                  primaryColor: "#faf8f4",
                  primaryTextColor: "#2b2a27",
                  primaryBorderColor: "#b5532f",
                  secondaryColor: "#f7f3eb",
                  tertiaryColor: "#ede7dc",
                  lineColor: "#7a756c",
                  textColor: "#2b2a27",
                  clusterBkg: "#faf8f4",
                  clusterBorder: "#d8d0c1",
                  edgeLabelBackground: "#f3efe7"
                }
          });
          boxes.forEach(function (item, idx) {
            var id = "mmd-" + (++renderSeq) + "-" + idx;
            mermaid.render(id, item.src).then(function (res) {
              item.box.innerHTML = res.svg;
            }).catch(function (err) {
              console.error("Mermaid render failed:", err);
              item.box.textContent = item.src;
            });
          });
        };
        renderAll();
        if (window.MutationObserver) {
          new MutationObserver(renderAll).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"]
          });
        }
        if (window.matchMedia) {
          var mq = window.matchMedia("(prefers-color-scheme: dark)");
          if (mq.addEventListener) mq.addEventListener("change", renderAll);
        }
      })
      .catch(function (err) {
        console.error("Mermaid load failed:", err);
      });
  }

  // highlight current heading in the outline
  var links = document.querySelectorAll(".outline a");
  if (links.length && "IntersectionObserver" in window) {
    var map = {};
    links.forEach(function (a) {
      var id = decodeURIComponent((a.getAttribute("href") || "").slice(1));
      if (id) map[id] = a;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          links.forEach(function (a) { a.classList.remove("on"); });
          map[en.target.id].classList.add("on");
        }
      });
    }, { rootMargin: "0px 0px -70% 0px" });
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }
})();
