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
  document.querySelectorAll("figure.highlight").forEach(function (fig) {
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
