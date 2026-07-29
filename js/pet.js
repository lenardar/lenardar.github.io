(function() {
  "use strict";

  var root = document.getElementById("blog-pet");
  if (!root) return;

  var apiBase = (root.dataset.apiBase || "/api").replace(/\/$/, "");
  var panel = document.getElementById("blog-pet-panel");
  var toggle = document.getElementById("blog-pet-toggle");
  var closeButton = document.getElementById("blog-pet-close");
  var speech = document.getElementById("blog-pet-speech");
  var messages = document.getElementById("blog-pet-messages");
  var form = document.getElementById("blog-pet-form");
  var input = document.getElementById("blog-pet-input");
  var submitButton = form.querySelector("button[type='submit']");
  var quickActions = root.querySelectorAll("[data-question]");
  var history = [];
  var searchEntriesPromise;
  var speechTimer;
  var thinkingRequests = 0;

  var fallbackGreetings = [
    "欢迎光临，作者今天好像也在摸鱼。",
    "随便看看吧，看到 Bug 记得假装没看见。",
    "今天也要记得保存文件呀。",
    "小猫已上线，有问题尽管问我。",
    "来都来了，要不要挑篇文章看看？"
  ];

  function randomFallback() {
    return fallbackGreetings[Math.floor(Math.random() * fallbackGreetings.length)];
  }

  function pageInfo() {
    return {
      title: (document.title || "博客").replace(/\s*\|\s*.*$/, "").slice(0, 100),
      path: window.location.pathname,
      type: document.querySelector(".post") ? "文章" : "页面"
    };
  }

  function currentArticleText() {
    var article = document.querySelector(".e-content");
    if (!article) return "";
    return article.innerText.replace(/\s+/g, " ").trim().slice(0, 5000);
  }

  function stripHtml(html) {
    var doc = new DOMParser().parseFromString(html || "", "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  function normalizePath(url) {
    try {
      return new URL(url, window.location.origin).pathname;
    } catch (error) {
      return "/";
    }
  }

  function tokenize(text) {
    var normalized = (text || "").toLowerCase();
    var ascii = normalized.match(/[a-z0-9_+.-]{2,}/g) || [];
    var chineseRuns = normalized.match(/[\u3400-\u9fff]+/g) || [];
    var chinese = [];

    chineseRuns.forEach(function(run) {
      if (run.length === 1) {
        chinese.push(run);
        return;
      }
      for (var i = 0; i < run.length - 1; i += 1) {
        chinese.push(run.slice(i, i + 2));
      }
    });

    return Array.from(new Set(ascii.concat(chinese))).slice(0, 80);
  }

  function loadSearchEntries() {
    if (searchEntriesPromise) return searchEntriesPromise;

    searchEntriesPromise = fetch("/search.xml", { credentials: "same-origin" })
      .then(function(response) {
        if (!response.ok) throw new Error("search index unavailable");
        return response.text();
      })
      .then(function(xmlText) {
        var xml = new DOMParser().parseFromString(xmlText, "application/xml");
        return Array.prototype.map.call(xml.querySelectorAll("entry"), function(entry) {
          return {
            title: (entry.querySelector("title")?.textContent || "未命名文章").trim(),
            url: normalizePath(entry.querySelector("link")?.getAttribute("href") || "/"),
            content: stripHtml(entry.querySelector("content")?.textContent || "")
          };
        });
      })
      .catch(function() {
        return [];
      });

    return searchEntriesPromise;
  }

  function rankEntries(entries, query) {
    var tokens = tokenize(query);
    var currentPath = window.location.pathname;

    return entries
      .map(function(entry) {
        var title = entry.title.toLowerCase();
        var content = entry.content.toLowerCase();
        var score = 0;

        tokens.forEach(function(token) {
          if (title.indexOf(token) >= 0) score += 5;
          var first = content.indexOf(token);
          if (first >= 0) score += 1;
        });

        if (entry.url === currentPath) score += 2;
        return { entry: entry, score: score };
      })
      .filter(function(item) {
        return item.score > 0;
      })
      .sort(function(a, b) {
        return b.score - a.score;
      })
      .slice(0, 3)
      .map(function(item) {
        return item.entry;
      });
  }

  function buildContext(question) {
    var currentText = currentArticleText();
    var query = [question, pageInfo().title, currentText.slice(0, 1200)].join(" ");

    return loadSearchEntries().then(function(entries) {
      var related = rankEntries(entries, query);
      var sections = [];

      if (currentText) {
        sections.push(
          "【当前页面：" + pageInfo().title + "】\n" + currentText
        );
      }

      related.forEach(function(entry) {
        if (entry.url === window.location.pathname && currentText) return;
        sections.push(
          "【相关文章：" + entry.title + "】\n" + entry.content.slice(0, 1800)
        );
      });

      return {
        context: sections.join("\n\n").slice(0, 9000),
        references: related.map(function(entry) {
          return { title: entry.title, url: entry.url };
        })
      };
    });
  }

  function setSpeech(text, autoHide) {
    speech.textContent = text;
    speech.classList.remove("is-hidden");
    window.clearTimeout(speechTimer);
    if (autoHide) {
      speechTimer = window.setTimeout(function() {
        speech.classList.add("is-hidden");
      }, 9000);
    }
  }

  function setPanel(open) {
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    toggle.setAttribute("aria-expanded", String(open));
    speech.classList.toggle("is-hidden", open);
    if (open) {
      window.setTimeout(function() {
        input.focus();
      }, 0);
    }
  }

  function setThinking(active) {
    thinkingRequests = Math.max(0, thinkingRequests + (active ? 1 : -1));
    root.classList.toggle("is-thinking", thinkingRequests > 0);
  }

  function addMessage(role, text, sources, loading) {
    var wrapper = document.createElement("div");
    wrapper.className =
      "blog-pet-message blog-pet-message-" + role +
      (loading ? " blog-pet-message-loading" : "");

    var paragraph = document.createElement("p");
    paragraph.textContent = text;
    wrapper.appendChild(paragraph);

    if (sources && sources.length) {
      var list = document.createElement("ul");
      sources.forEach(function(source) {
        if (!source.url || source.url.charAt(0) !== "/") return;
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = source.url;
        link.textContent = source.title || source.url;
        item.appendChild(link);
        list.appendChild(item);
      });
      if (list.children.length) wrapper.appendChild(list);
    }

    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
    return wrapper;
  }

  function postJson(path, body, timeoutMs) {
    var controller = new AbortController();
    var timer = window.setTimeout(function() {
      controller.abort();
    }, timeoutMs || 20000);

    return fetch(apiBase + path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    }).then(function(response) {
      if (!response.ok) throw new Error("request failed");
      return response.json();
    }).finally(function() {
      window.clearTimeout(timer);
    });
  }

  function loadGreeting() {
    setThinking(true);
    postJson("/greeting", { page: pageInfo() }, 15000)
      .then(function(data) {
        setSpeech(data.text || randomFallback(), true);
      })
      .catch(function() {
        setSpeech(randomFallback(), true);
      })
      .finally(function() {
        setThinking(false);
      });
  }

  function localSearchReply(references) {
    if (references.length) {
      return "云端脑袋暂时没响应，不过我找到了几篇可能相关的文章：";
    }
    return "云端脑袋暂时没响应，我也没搜到明确相关的文章。换个关键词再问问？";
  }

  function ask(question) {
    var cleanQuestion = (question || "").trim().slice(0, 300);
    if (!cleanQuestion || submitButton.disabled) return;

    setPanel(true);
    addMessage("user", cleanQuestion);
    input.value = "";
    submitButton.disabled = true;
    setThinking(true);

    var loading = addMessage("assistant", "小猫正在翻文章……", null, true);

    buildContext(cleanQuestion)
      .then(function(payload) {
        return postJson("/chat", {
          question: cleanQuestion,
          context: payload.context,
          references: payload.references,
          history: history.slice(-6)
        }, 30000).catch(function() {
          return {
            answer: localSearchReply(payload.references),
            sources: payload.references,
            source: "local"
          };
        });
      })
      .then(function(data) {
        loading.remove();
        var answer = data.answer || "小猫刚才走神了，再问一次试试？";
        addMessage("assistant", answer, data.sources || []);
        history.push({ role: "user", content: cleanQuestion });
        history.push({ role: "assistant", content: answer });
        history = history.slice(-6);
      })
      .catch(function() {
        loading.remove();
        addMessage("assistant", "小猫刚才走神了，再问一次试试？");
      })
      .finally(function() {
        setThinking(false);
        submitButton.disabled = false;
        input.focus();
      });
  }

  toggle.addEventListener("click", function() {
    setPanel(!panel.classList.contains("is-open"));
  });

  closeButton.addEventListener("click", function() {
    setPanel(false);
  });

  form.addEventListener("submit", function(event) {
    event.preventDefault();
    ask(input.value);
  });

  Array.prototype.forEach.call(quickActions, function(button) {
    button.addEventListener("click", function() {
      ask(button.dataset.question);
    });
  });

  document.addEventListener("keydown", function(event) {
    if (event.key === "Escape" && panel.classList.contains("is-open")) {
      setPanel(false);
      toggle.focus();
    }
  });

  loadGreeting();
})();
