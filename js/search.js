// Local search over hexo-generator-search's search.xml (no jQuery).
function searchFunc(path, inputId, resultId) {
  "use strict";
  var input = document.getElementById(inputId);
  var out = document.getElementById(resultId);
  if (!input || !out) return;

  var data = null;
  var loading = null;

  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function load() {
    if (loading) return loading;
    loading = fetch(path).then(function (r) { return r.text(); }).then(function (xml) {
      var doc = new DOMParser().parseFromString(xml, "text/xml");
      data = Array.prototype.map.call(doc.querySelectorAll("entry"), function (e) {
        var html = (e.querySelector("content") || {}).textContent || "";
        var text = new DOMParser().parseFromString(html, "text/html").body.textContent || "";
        var link = e.querySelector("link");
        return {
          title: ((e.querySelector("title") || {}).textContent || "Untitled").trim(),
          text: text.replace(/\s+/g, " ").trim(),
          url: link ? link.getAttribute("href") : "#"
        };
      });
    });
    return loading;
  }

  function render() {
    var q = input.value.trim().toLowerCase();
    if (!q) { out.innerHTML = ""; return; }
    var words = q.split(/\s+/);
    var hits = [];
    data.forEach(function (d) {
      var title = d.title.toLowerCase();
      var body = d.text.toLowerCase();
      var all = words.every(function (w) { return title.indexOf(w) >= 0 || body.indexOf(w) >= 0; });
      if (!all) return;
      var first = body.indexOf(words[0]);
      if (first < 0) first = 0;
      var start = Math.max(0, first - 20);
      var snippet = esc(d.text.slice(start, start + 100));
      words.forEach(function (w) {
        snippet = snippet.replace(new RegExp(esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), function (m) {
          return "<mark>" + m + "</mark>";
        });
      });
      hits.push("<li><a class='search-result-title' href='" + esc(d.url) + "'>" + esc(d.title) +
        "</a><p class='search-result'>" + snippet + "…</p></li>");
    });
    out.innerHTML = hits.length
      ? "<ul class='search-result-list'>" + hits.join("") + "</ul>"
      : "<p class='search-empty'>没有找到相关文章。</p>";
  }

  input.addEventListener("input", function () {
    load().then(render);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") e.preventDefault();
  });
  input.addEventListener("focus", load);
}
