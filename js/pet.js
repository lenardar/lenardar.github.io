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
  var tapCount = 0;
  var tapTimer;
  var rampageTimer;
  var rampageSpeechTimer;
  var DAILY_GREETING_KEY = "blog-pet-daily-greeting-v1";

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

  function appendInlineMarkdown(container, text, renderedLinks) {
    var pattern = /(\[[^\]\n]+\]\(\/(?!\/)[^)\s\n]+\)|\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;
    var lastIndex = 0;
    var match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index))
        );
      }

      var token = match[0];
      var element;
      var linkMatch = token.match(/^\[([^\]]+)\]\((\/(?!\/)[^)]+)\)$/);
      if (linkMatch) {
        element = document.createElement("a");
        element.href = linkMatch[2];
        element.textContent = linkMatch[1];
        if (renderedLinks) renderedLinks.add(linkMatch[2]);
      } else if (token.slice(0, 2) === "**") {
        element = document.createElement("strong");
        element.textContent = token.slice(2, -2);
      } else if (token.charAt(0) === "`") {
        element = document.createElement("code");
        element.textContent = token.slice(1, -1);
      } else {
        element = document.createElement("em");
        element.textContent = token.slice(1, -1);
      }
      container.appendChild(element);
      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function renderMarkdown(container, markdown, renderedLinks) {
    var lines = (markdown || "").replace(/\r\n?/g, "\n").split("\n");
    var index = 0;

    function appendParagraph(text) {
      var paragraph = document.createElement("p");
      appendInlineMarkdown(paragraph, text, renderedLinks);
      container.appendChild(paragraph);
    }

    while (index < lines.length) {
      var line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      if (/^```/.test(line.trim())) {
        var codeLines = [];
        index += 1;
        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        var pre = document.createElement("pre");
        var code = document.createElement("code");
        code.textContent = codeLines.join("\n");
        pre.appendChild(code);
        container.appendChild(pre);
        continue;
      }

      var unordered = line.match(/^\s*[-*+]\s+(.+)$/);
      var ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        var list = document.createElement(ordered ? "ol" : "ul");
        var matcher = ordered
          ? /^\s*\d+[.)]\s+(.+)$/
          : /^\s*[-*+]\s+(.+)$/;

        while (index < lines.length) {
          var itemMatch = lines[index].match(matcher);
          if (!itemMatch) break;
          var item = document.createElement("li");
          appendInlineMarkdown(item, itemMatch[1], renderedLinks);
          list.appendChild(item);
          index += 1;
        }
        container.appendChild(list);
        continue;
      }

      var paragraphLines = [line.trim()];
      index += 1;
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^```/.test(lines[index].trim()) &&
        !/^\s*[-*+]\s+/.test(lines[index]) &&
        !/^\s*\d+[.)]\s+/.test(lines[index])
      ) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }
      appendParagraph(paragraphLines.join(" "));
    }
  }

  function addMessage(role, text, sources, loading) {
    var wrapper = document.createElement("div");
    wrapper.className =
      "blog-pet-message blog-pet-message-" + role +
      (loading ? " blog-pet-message-loading" : "");

    var content = document.createElement("div");
    content.className = "blog-pet-message-content";
    var renderedLinks = new Set();
    if (role === "assistant" && !loading) {
      renderMarkdown(content, text, renderedLinks);
    } else {
      var paragraph = document.createElement("p");
      paragraph.textContent = text;
      content.appendChild(paragraph);
    }
    wrapper.appendChild(content);

    if (sources && sources.length) {
      var list = document.createElement("ul");
      sources.forEach(function(source) {
        if (
          !source.url ||
          source.url.charAt(0) !== "/" ||
          source.url.slice(0, 2) === "//"
        ) return;
        if (renderedLinks.has(source.url)) return;
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
    try {
      var cached = JSON.parse(localStorage.getItem(DAILY_GREETING_KEY) || "null");
      if (cached && cached.day === shanghaiDay() && cached.text) {
        setSpeech("今日猫语：" + cached.text, true);
        return;
      }
    } catch (error) {
      // Storage can be unavailable in private browsing; continue without it.
    }

    setThinking(true);
    postJson("/greeting", { page: pageInfo() }, 15000)
      .then(function(data) {
        var text = data.text || randomFallback();
        setSpeech("今日猫语：" + text, true);
        if (data.day) {
          try {
            localStorage.setItem(
              DAILY_GREETING_KEY,
              JSON.stringify({ day: data.day, text: text })
            );
          } catch (error) {
            // The greeting still works when storage is unavailable.
          }
        }
      })
      .catch(function() {
        setSpeech(randomFallback(), true);
      })
      .finally(function() {
        setThinking(false);
      });
  }

  function shanghaiDay() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());
    } catch (error) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function stopRampage() {
    window.clearTimeout(rampageTimer);
    window.clearInterval(rampageSpeechTimer);
    root.classList.remove("is-rampage");
    setSpeech("呼……键盘保住了，暂时。", true);
  }

  function triggerRampage() {
    var lines = [
      "检测到连续摸猫——暴走模式启动！",
      "哒哒哒哒哒哒哒哒！",
      "今天的键盘由我接管！",
      "Bug 快跑，小猫来了！"
    ];
    var lineIndex = 0;

    tapCount = 0;
    window.clearTimeout(tapTimer);
    window.clearTimeout(rampageTimer);
    window.clearInterval(rampageSpeechTimer);
    setPanel(false);
    root.classList.add("is-rampage");
    setSpeech(lines[lineIndex], false);

    rampageSpeechTimer = window.setInterval(function() {
      lineIndex = (lineIndex + 1) % lines.length;
      setSpeech(lines[lineIndex], false);
    }, 850);
    rampageTimer = window.setTimeout(stopRampage, 7000);
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
    tapCount += 1;
    window.clearTimeout(tapTimer);
    tapTimer = window.setTimeout(function() {
      tapCount = 0;
    }, 1800);

    if (tapCount >= 5) {
      triggerRampage();
      return;
    }
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
