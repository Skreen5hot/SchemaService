/* BIBSS Demo Site — Application Logic */

(function () {
  "use strict";

  // --- BIBSS Instance ---
  const bibss = BIBSS.createBIBSS();

  // --- DOM Elements ---
  const inputText = document.getElementById("input-text");
  const formatBadge = document.getElementById("format-badge");
  const btnInfer = document.getElementById("btn-infer");
  const btnClear = document.getElementById("btn-clear");
  const fileInput = document.getElementById("file-input");
  const dropZone = document.getElementById("drop-zone");
  const dropOverlay = document.getElementById("drop-overlay");
  const btnSamples = document.getElementById("btn-samples");
  const sampleMenu = document.getElementById("sample-menu");
  const outputEmpty = document.getElementById("output-empty");
  const outputCode = document.getElementById("output-code");
  const outputContent = document.getElementById("output-content");
  const btnCopy = document.getElementById("btn-copy");
  const tabs = document.querySelectorAll(".tab");
  const diagBar = document.getElementById("diagnostics-bar");
  const btnToggleDiag = document.getElementById("btn-toggle-diag");
  const diagCount = document.getElementById("diag-count");
  const diagList = document.getElementById("diagnostics-list");

  // --- State ---
  let currentTab = "jsonschema";
  let lastResult = null;
  let outputs = { jsonschema: null, cism: null };

  // --- Sample Data ---
  const samples = {
    employees: [
      "name,department,salary,active,start_date",
      "Alice,Engineering,95000,true,2019-03-15",
      "Bob,Marketing,72000,true,2020-07-01",
      "Charlie,Engineering,105000,false,2017-11-20",
      "Diana,Sales,68000,true,2021-01-10",
      "Eve,Engineering,112000,true,2018-06-22",
      "Frank,Marketing,75000,true,2019-09-30",
      "Grace,Sales,,true,2022-04-05",
      "Hank,Engineering,98000,false,2016-08-14",
    ].join("\n"),

    products: JSON.stringify([
      { id: 1, name: "Laptop Pro", price: 1299.99, inStock: true, tags: ["electronics", "computers"], specs: { cpu: "M3", ram: 16, storage: "512GB" } },
      { id: 2, name: "Wireless Mouse", price: 29.99, inStock: true, tags: ["electronics", "accessories"], specs: { dpi: 1600, wireless: true } },
      { id: 3, name: "Standing Desk", price: 499.00, inStock: false, tags: ["furniture", "office"], specs: { width: 60, adjustable: true } },
      { id: 4, name: "Monitor 4K", price: 649.99, inStock: true, tags: ["electronics", "displays"], specs: { resolution: "3840x2160", hdr: true } },
      { id: 5, name: "Keyboard", price: 89.99, inStock: true, tags: ["electronics", "accessories"], specs: { mechanical: true, layout: "US" } },
    ], null, 2),

    survey: [
      "respondent_id,age,satisfaction,recommend,comments,region",
      "1,34,8,true,Great product,North",
      "2,28,6,true,,East",
      "3,45,9,true,Excellent support,North",
      "4,22,3,false,Too expensive,West",
      "5,51,7,true,Good value,South",
      "6,38,,true,Needs improvement,East",
      "7,29,8,false,,North",
      "8,42,5,true,Average experience,West",
      "9,33,9,true,Love it,South",
      "10,47,4,false,Not for me,East",
    ].join("\n"),
  };

  // --- Format Detection ---
  function detectFormat(text) {
    const trimmed = text.trimStart();
    if (trimmed.length === 0) return null;
    const first = trimmed[0];
    return (first === "{" || first === "[") ? "JSON" : "CSV";
  }

  function updateFormatBadge() {
    const format = detectFormat(inputText.value);
    if (format) {
      formatBadge.textContent = format;
      formatBadge.classList.remove("hidden");
    } else {
      formatBadge.classList.add("hidden");
    }
  }

  // --- JSON Syntax Highlighting ---
  function highlightJson(jsonStr) {
    return jsonStr.replace(
      /("(?:\\.|[^"\\])*")\s*:/g,
      '<span class="json-key">$1</span>:'
    ).replace(
      /:\s*("(?:\\.|[^"\\])*")/g,
      function (match, str) {
        return ': <span class="json-string">' + str + "</span>";
      }
    ).replace(
      /:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g,
      ': <span class="json-number">$1</span>'
    ).replace(
      /:\s*(true|false)/g,
      ': <span class="json-boolean">$1</span>'
    ).replace(
      /:\s*(null)/g,
      ': <span class="json-null">$1</span>'
    ).replace(
      /\[\s*("(?:\\.|[^"\\])*")/g,
      function (match, str) {
        return match.replace(str, '<span class="json-string">' + str + "</span>");
      }
    );
  }

  // --- Render Output ---
  function renderOutput() {
    const data = outputs[currentTab];
    if (!data) {
      outputEmpty.classList.remove("hidden");
      outputCode.classList.add("hidden");
      btnCopy.classList.add("hidden");
      return;
    }

    outputEmpty.classList.add("hidden");
    outputCode.classList.remove("hidden");
    btnCopy.classList.remove("hidden");

    const jsonStr = JSON.stringify(data, null, 2);
    outputContent.innerHTML = highlightJson(escapeHtml(jsonStr));
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // --- Render Diagnostics ---
  function renderDiagnostics(diagnostics) {
    if (!diagnostics || diagnostics.length === 0) {
      diagBar.classList.add("hidden");
      return;
    }

    diagBar.classList.remove("hidden");
    diagCount.textContent = "(" + diagnostics.length + ")";
    diagList.innerHTML = "";

    for (const diag of diagnostics) {
      const li = document.createElement("li");
      const levelClass =
        diag.level === "error" ? "diag-error" :
        diag.level === "warning" ? "diag-warning" : "diag-info";
      li.className = levelClass;
      li.textContent = "[" + diag.code + "] " + diag.message;
      diagList.appendChild(li);
    }
  }

  // --- Infer ---
  function handleInfer() {
    const input = inputText.value;
    if (!input.trim()) {
      outputs = { jsonschema: null, cism: null };
      lastResult = null;
      renderOutput();
      renderDiagnostics([]);
      return;
    }

    try {
      lastResult = bibss.infer(input);

      if (lastResult.cism) {
        outputs.jsonschema = bibss.project(lastResult.cism, "jsonschema");
        outputs.cism = bibss.project(lastResult.cism, "cism");
      } else {
        outputs = { jsonschema: null, cism: null };
      }

      renderOutput();
      renderDiagnostics(lastResult.diagnostics);
    } catch (err) {
      outputs = { jsonschema: null, cism: null };
      renderOutput();
      renderDiagnostics([{
        level: "error",
        code: "RUNTIME",
        message: err.message || String(err),
      }]);
    }
  }

  // --- Clear ---
  function handleClear() {
    inputText.value = "";
    outputs = { jsonschema: null, cism: null };
    lastResult = null;
    updateFormatBadge();
    renderOutput();
    renderDiagnostics([]);
  }

  // --- File Upload ---
  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      inputText.value = reader.result;
      updateFormatBadge();
    };
    reader.readAsText(file);
  }

  // --- Tab Switching ---
  function switchTab(tabName) {
    currentTab = tabName;
    tabs.forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === tabName);
    });
    renderOutput();
  }

  // --- Copy ---
  function handleCopy() {
    const data = outputs[currentTab];
    if (!data) return;
    const text = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(text).then(function () {
      var orig = btnCopy.textContent;
      btnCopy.textContent = "Copied!";
      setTimeout(function () { btnCopy.textContent = orig; }, 1500);
    });
  }

  // --- Event Listeners ---
  btnInfer.addEventListener("click", handleInfer);
  btnClear.addEventListener("click", handleClear);

  inputText.addEventListener("input", updateFormatBadge);

  inputText.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleInfer();
    }
  });

  fileInput.addEventListener("change", function () {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  // Drag and drop
  dropZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropOverlay.classList.remove("hidden");
  });

  dropZone.addEventListener("dragleave", function (e) {
    e.preventDefault();
    dropOverlay.classList.add("hidden");
  });

  dropZone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropOverlay.classList.add("hidden");
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // Tabs
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      switchTab(tab.dataset.tab);
    });
  });

  // Copy
  btnCopy.addEventListener("click", handleCopy);

  // Sample data
  btnSamples.addEventListener("click", function (e) {
    e.stopPropagation();
    sampleMenu.classList.toggle("hidden");
  });

  document.addEventListener("click", function () {
    sampleMenu.classList.add("hidden");
  });

  sampleMenu.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-sample]");
    if (!btn) return;
    const key = btn.dataset.sample;
    if (samples[key]) {
      inputText.value = samples[key];
      updateFormatBadge();
      sampleMenu.classList.add("hidden");
    }
  });

  // Diagnostics toggle
  btnToggleDiag.addEventListener("click", function () {
    diagList.classList.toggle("hidden");
  });

  // Init
  updateFormatBadge();
})();
