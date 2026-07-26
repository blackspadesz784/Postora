/* =========================================================================
   AI LinkedIn Post Generator — Frontend logic
   Handles: theme toggle, form validation & counters, API calls,
   typing animation, clipboard/download, localStorage history, toasts.
   ========================================================================= */

(() => {
  "use strict";

  /* ----------------------------- Constants ----------------------------- */
  const HISTORY_KEY = "postsignal_history_v1";
  const THEME_KEY = "postsignal_theme";
  const MAX_HISTORY = 5;

  // The frontend is a standalone file (opened directly from disk), so it
  // must call the Flask API by its full address rather than a relative path.
  const API_BASE_URL = "https://postora-j62g.onrender.com";

  /* ------------------------------ Elements ------------------------------ */
  const els = {
    themeToggle: document.getElementById("themeToggle"),

    form: document.getElementById("generatorForm"),
    topic: document.getElementById("topic"),
    topicCount: document.getElementById("topicCount"),
    description: document.getElementById("description"),
    descChars: document.getElementById("descChars"),
    descWords: document.getElementById("descWords"),
    tone: document.getElementById("tone"),
    postType: document.getElementById("postType"),
    length: document.getElementById("length"),
    generateBtn: document.getElementById("generateBtn"),
    clearBtn: document.getElementById("clearBtn"),

    outputEmpty: document.getElementById("outputEmpty"),
    outputResult: document.getElementById("outputResult"),
    postText: document.getElementById("postText"),
    outCharCount: document.getElementById("outCharCount"),
    outWordCount: document.getElementById("outWordCount"),
    copyBtn: document.getElementById("copyBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    regenerateBtn: document.getElementById("regenerateBtn"),

    historyEmpty: document.getElementById("historyEmpty"),
    historyList: document.getElementById("historyList"),
    historyItemTemplate: document.getElementById("historyItemTemplate"),

    toastContainer: document.getElementById("toastContainer"),
  };

  let currentTypingTimer = null;
  let lastGeneratedPost = "";

  /* ============================== THEME ============================== */
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    const theme = saved || (prefersLight ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  }

  els.themeToggle.addEventListener("click", toggleTheme);

  /* ============================== TOASTS ============================== */
  const TOAST_ICONS = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg>',
  };

  function showToast(message, type = "info", duration = 3800) {
    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `<span class="toast__icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span><span>${escapeHtml(message)}</span>`;
    els.toastContainer.appendChild(toast);

    const remove = () => {
      toast.classList.add("is-leaving");
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
    };
    setTimeout(remove, duration);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ============================ FORM HELPERS ============================ */
  function autoResizeTextarea(el) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function countWords(text) {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  function updateTopicCount() {
    els.topicCount.textContent = `${els.topic.value.length} / 200`;
  }

  function updateDescriptionCounters() {
    const val = els.description.value;
    els.descChars.textContent = `${val.length} characters`;
    els.descWords.textContent = `${countWords(val)} words`;
  }

  els.topic.addEventListener("input", updateTopicCount);
  els.description.addEventListener("input", () => {
    updateDescriptionCounters();
    autoResizeTextarea(els.description);
  });

  function updateOutputCounters(text) {
    els.outCharCount.textContent = `${text.length} characters`;
    els.outWordCount.textContent = `${countWords(text)} words`;
  }

  /* ============================== VALIDATION ============================== */
  function validateForm() {
    const topic = els.topic.value.trim();
    const description = els.description.value.trim();

    if (!topic) {
      showToast("Please enter a topic.", "error");
      els.topic.focus();
      return null;
    }
    if (!description) {
      showToast("Please add a short description.", "error");
      els.description.focus();
      return null;
    }
    if (description.length < 10) {
      showToast("Description is a bit short — add more detail for a better post.", "error");
      els.description.focus();
      return null;
    }

    return {
      topic,
      description,
      tone: els.tone.value,
      post_type: els.postType.value,
      length: els.length.value,
    };
  }

  /* ============================== API CALL ============================== */
  async function generatePost(payload) {
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Unexpected response from server.");
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      lastGeneratedPost = data.post;
      renderOutput(data.post);
      saveToHistory(payload, data.post);
      showToast("Post generated successfully.", "success");
    } catch (err) {
      if (err instanceof TypeError) {
        // fetch() throws a plain TypeError ("Failed to fetch") on network errors,
        // which almost always means the Flask backend isn't running yet.
        showToast(`Can't reach the backend at ${API_BASE_URL}. Make sure "python app.py" is running.`, "error", 5000);
      } else {
        showToast(err.message || "Failed to generate post.", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  function setLoading(isLoading) {
    els.generateBtn.disabled = isLoading;
    els.generateBtn.classList.toggle("is-loading", isLoading);
    els.regenerateBtn && (els.regenerateBtn.disabled = isLoading);
  }

  /* ============================== OUTPUT RENDER ============================== */
  function renderOutput(text) {
    els.outputEmpty.hidden = true;
    els.outputResult.hidden = false;
    typeText(text);
  }

  function typeText(text) {
    if (currentTypingTimer) {
      clearInterval(currentTypingTimer);
      currentTypingTimer = null;
    }

    els.postText.textContent = "";
    const cursor = document.createElement("span");
    cursor.className = "typing-cursor";
    els.postText.appendChild(cursor);

    let i = 0;
    const speed = text.length > 500 ? 4 : 12; // chars per tick, faster for long posts
    updateOutputCounters("");

    currentTypingTimer = setInterval(() => {
      const chunk = text.slice(i, i + speed);
      cursor.insertAdjacentText("beforebegin", chunk);
      i += speed;
      updateOutputCounters(els.postText.textContent);

      if (i >= text.length) {
        clearInterval(currentTypingTimer);
        currentTypingTimer = null;
        cursor.remove();
        updateOutputCounters(text);
      }
    }, 12);
  }

  /* ============================== ACTIONS ============================== */
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = validateForm();
    if (!payload) return;
    generatePost(payload);
  });

  els.clearBtn.addEventListener("click", () => {
    els.form.reset();
    updateTopicCount();
    updateDescriptionCounters();
    autoResizeTextarea(els.description);
    els.topic.focus();
    showToast("Form cleared.", "info", 2200);
  });

  els.copyBtn.addEventListener("click", async () => {
    const text = els.postText.textContent.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flashButtonSuccess(els.copyBtn, "Copied!");
      showToast("Post copied to clipboard.", "success", 2200);
    } catch {
      showToast("Couldn't copy automatically — please copy manually.", "error");
    }
  });

  els.downloadBtn.addEventListener("click", () => {
    const text = els.postText.textContent.trim();
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `linkedin-post-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Post downloaded as .txt", "success", 2200);
  });

  els.regenerateBtn.addEventListener("click", () => {
    const payload = validateForm();
    if (!payload) return;
    generatePost(payload);
  });

  function flashButtonSuccess(btn, label) {
    const original = btn.innerHTML;
    btn.classList.add("is-success");
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> ${label}`;
    setTimeout(() => {
      btn.classList.remove("is-success");
      btn.innerHTML = original;
    }, 1600);
  }

  /* ============================== HISTORY (localStorage) ============================== */
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveToHistory(payload, post) {
    const history = getHistory();
    history.unshift({
      id: `${Date.now()}`,
      topic: payload.topic,
      post_type: payload.post_type,
      tone: payload.tone,
      length: payload.length,
      post,
      createdAt: new Date().toISOString(),
    });
    const trimmed = history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    renderHistory();
  }

  function deleteFromHistory(id) {
    const history = getHistory().filter((item) => item.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
    showToast("Removed from history.", "info", 2000);
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function renderHistory() {
    const history = getHistory();
    els.historyList.innerHTML = "";

    if (history.length === 0) {
      els.historyEmpty.hidden = false;
      return;
    }
    els.historyEmpty.hidden = true;

    history.forEach((item) => {
      const node = els.historyItemTemplate.content.cloneNode(true);
      const card = node.querySelector(".history-card");
      node.querySelector(".history-card__type").textContent = item.post_type;
      node.querySelector(".history-card__date").textContent = formatDate(item.createdAt);
      node.querySelector(".history-card__preview").textContent = item.post;

      node.querySelector('[data-action="load"]').addEventListener("click", () => {
        loadHistoryItem(item);
      });
      node.querySelector('[data-action="copy"]').addEventListener("click", async (e) => {
        try {
          await navigator.clipboard.writeText(item.post);
          showToast("Post copied to clipboard.", "success", 2000);
        } catch {
          showToast("Couldn't copy automatically.", "error");
        }
      });
      node.querySelector('[data-action="delete"]').addEventListener("click", () => {
        deleteFromHistory(item.id);
      });

      els.historyList.appendChild(node);
    });
  }

  function loadHistoryItem(item) {
    els.topic.value = item.topic;
    els.tone.value = item.tone;
    els.postType.value = item.post_type;
    els.length.value = item.length;
    updateTopicCount();

    lastGeneratedPost = item.post;
    els.outputEmpty.hidden = true;
    els.outputResult.hidden = false;
    if (currentTypingTimer) clearInterval(currentTypingTimer);
    els.postText.textContent = item.post;
    updateOutputCounters(item.post);

    document.getElementById("output").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Loaded from history.", "info", 2000);
  }

  /* ============================== SCROLL REVEAL ============================== */
  function initScrollReveal() {
    const targets = document.querySelectorAll(".section, .hero");
    targets.forEach((el) => el.classList.add("reveal"));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );

    targets.forEach((el) => observer.observe(el));
  }

  /* ============================== INIT ============================== */
  function init() {
    initTheme();
    updateTopicCount();
    updateDescriptionCounters();
    autoResizeTextarea(els.description);
    renderHistory();
    initScrollReveal();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
