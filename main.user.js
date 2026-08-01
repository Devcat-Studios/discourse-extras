/*













 ==========================================================
/===Discourse Extras by ethandacat, with Devcat Studios.===\
|==========================================================|
|                                                          |
|  Discourse Extras is a userscript designed for Discourse |
|  to add more features to its already vast BBCode syntax. |
|                                                          |
|  ------------------------------------------------------- |
|  Licensed under the CAT License.                         |
|  Source code below for all to see, feel free to          |
\  distribute and modify it!                               /
 ==========================================================










*/

// ==UserScript==
// @name         Discourse Extras
// @namespace    devcat
// @version      5.0
// @license      CAT License
// @description  More for viewing, less for writing.
// @author       ethandacat (w/ Devcat Studios)
// @match        https://x-camp.discourse.group/*
// @icon         https://d3bpeqsaub0i6y.cloudfront.net/user_avatar/meta.discourse.org/discourse/48/148734_2.png
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        unsafeWindow
// @grant        GM_info
// @run-at       document-start
// ==/UserScript==

// AntiCrash: patch both fetch AND XMLHttpRequest as early as possible (document-start)
// so we see post JSON before Discourse's own Ember app gets a chance to render it.
// Live replies don't arrive via a plain fetch('/posts/...') — Discourse pushes them
// over its message-bus long-polling channel, a totally different payload shape
// (an array of {channel, data: {...}} messages) that may go over XHR instead of
// fetch. So instead of matching specific URLs/shapes, dextraDeepSanitizeCooked()
// walks the whole parsed JSON tree and neutralizes any "cooked" field it finds,
// no matter how deeply nested or which endpoint it came from.
// unsafeWindow is used because Discourse's own code calls fetch/XHR on the real
// page window, not this script's sandboxed one.
(function () {
    const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    if (win.__dextraFetchPatched) return;
    win.__dextraFetchPatched = true;
    const originalFetch = win.fetch.bind(win);
    win.__dextraOriginalFetch = originalFetch;
    win.fetch = async function (...args) {
        const response = await originalFetch(...args);
        try {
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("json")) {
                const data = await response.clone().json();
                if (dextraDeepSanitizeCooked(data)) {
                    return new Response(JSON.stringify(data), {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                }
            }
        } catch (e) {}
        return response;
    };

    if (win.__dextraXHRPatched) return;
    win.__dextraXHRPatched = true;
    const OrigXHR = win.XMLHttpRequest;
    const origSend = OrigXHR.prototype.send;
    OrigXHR.prototype.send = function (...args) {
        this.addEventListener("load", function () {
            try {
                const contentType = this.getResponseHeader("content-type") || "";
                if (!contentType.includes("json")) return;
                const data = JSON.parse(this.responseText);
                if (dextraDeepSanitizeCooked(data)) {
                    const sanitizedText = JSON.stringify(data);
                    Object.defineProperty(this, "responseText", {get: () => sanitizedText, configurable: true});
                    Object.defineProperty(this, "response", {get: () => sanitizedText, configurable: true});
                }
            } catch (e) {}
        });
        return origSend.apply(this, args);
    };

    // A direct/refreshed load of a topic page never calls fetch/XHR for that
    // topic's data at all — Discourse embeds it straight into the initial HTML as
    // <script id="data-preloaded"> and Ember reads it via PreloadStore on boot.
    // That's the gap that made AntiCrash look inconsistent: SPA navigation to a
    // topic went through the patched fetch/XHR above and got caught; landing on
    // (or refreshing) that same topic directly did not. Catch it here too, before
    // Ember ever gets to read the tag.
    if (win.__dextraPreloadPatched) return;
    win.__dextraPreloadPatched = true;
    function dextraSanitizePreloadTag(tag) {
        if (!tag || tag.dataset.dextraPreloadScanned) return;
        tag.dataset.dextraPreloadScanned = "true";
        try {
            const store = JSON.parse(tag.textContent);
            let changed = false;
            for (const key in store) {
                try {
                    const inner = JSON.parse(store[key]);
                    if (dextraDeepSanitizeCooked(inner)) {
                        store[key] = JSON.stringify(inner);
                        changed = true;
                    }
                } catch (e) {}
            }
            if (changed) tag.textContent = JSON.stringify(store);
        } catch (e) {}
    }
    const existingTag = document.getElementById("data-preloaded");
    if (existingTag) dextraSanitizePreloadTag(existingTag);
    const preloadObserver = new MutationObserver(() => {
        const tag = document.getElementById("data-preloaded");
        if (tag) {
            dextraSanitizePreloadTag(tag);
            preloadObserver.disconnect();
        }
    });
    preloadObserver.observe(document.documentElement, {childList: true, subtree: true});
})();
function dextraShieldHtml(postId, risk) {
    return `<details class="alert alert-error dextra-anticrash-shield" data-dextra-post-id="${postId}">
      <summary>&#9888;&#65039; Held back by AntiCrash &mdash; ${risk.reason}</summary>
      <p>${risk.detail} Blocked before it ever reached the page, so nothing rendered yet.</p>
      <button class="btn btn-default btn-small dextra-anticrash-net-show" type="button" data-post-id="${postId}">Show anyway</button>
    </details>`;
}
function dextraDeepSanitizeCooked(node, seen) {
    seen = seen || new Set();
    if (!node || typeof node !== "object" || seen.has(node)) return false;
    seen.add(node);
    let changed = false;
    if (Array.isArray(node)) {
        for (const item of node) {
            if (dextraDeepSanitizeCooked(item, seen)) changed = true;
        }
        return changed;
    }
    if (typeof node.cooked === "string") {
        const risk = dextraAntiCrashRisk(node.cooked);
        if (risk) {
            node.cooked = dextraShieldHtml(node.id, risk);
            changed = true;
        }
    }
    for (const key in node) {
        if (key === "cooked") continue;
        const val = node[key];
        if (val && typeof val === "object") {
            if (dextraDeepSanitizeCooked(val, seen)) changed = true;
        }
    }
    return changed;
}
document.addEventListener("click", function (e) {
    const btn = e.target.closest(".dextra-anticrash-net-show");
    if (!btn) return;
    const postId = btn.dataset.postId;
    const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const originalFetch = win.__dextraOriginalFetch || fetch;
    originalFetch(`/posts/${postId}.json`).then(r => r.json()).then(post => {
        const shield = btn.closest(".dextra-anticrash-shield");
        const cookedEl = shield ? shield.closest(".cooked") : null;
        if (cookedEl && post.cooked) {
            cookedEl.dataset.dextraAnticrashApproved = "true";
            cookedEl.innerHTML = post.cooked;
            processCookedElement(cookedEl, true);
        }
    });
});

function isNewer(latest, current) {
    const lv = latest.split('.').map(Number);
    const cv = current.split('.').map(Number);
    for (let i = 0; i < Math.max(lv.length, cv.length); i++) {
        if ((lv[i] || 0) > (cv[i] || 0)) return true;
        if ((lv[i] || 0) < (cv[i] || 0)) return false;
    }
    return false;
}

function showUpdateToast(latestVersion, scriptURL) {
    const toast = document.createElement('div');
    toast.innerHTML = `
    <div style="
      position:fixed; bottom:20px; right:20px;
      padding:12px 18px;
      border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.3);
      font-size:14px; z-index:9999;
    ">
      <b>Update available:</b> v${latestVersion}
      <button id="toastUpdateBtn" style="margin-left:10px;" class="btn btn-primary">Install</button>
      <button id="toastUpdateBtnNoThanks" style="margin-left:10px;" class="btn btn-default">No thanks</button>
    </div>
  `;
    document.body.appendChild(toast);
    toast.querySelector('#toastUpdateBtn').onclick = () => {
        window.location.href = scriptURL;
        toast.remove();
    };
    toast.querySelector('#toastUpdateBtnNoThanks').onclick = () => {
        toast.remove();
    };
}

function checkForUserScriptUpdate(scriptURL, currentVersion, onUpdateFound) {
    fetch(scriptURL, { cache: 'no-store' })
        .then(res => res.text())
        .then(text => {
        const match = text.match(/@version\s+([0-9a-zA-Z.+-]+)/);
        if (!match) return;
        const latestVersion = match[1];
        if (isNewer(latestVersion, currentVersion)) {
            onUpdateFound(latestVersion, scriptURL);
        }
    })
        .catch(err => {
        console.warn('Update check failed:', err);
    });
}

// usage
checkForUserScriptUpdate(
    'https://raw.githubusercontent.com/Devcat-Studios/discourse-extras/main/main.user.js',
    typeof GM_info !== 'undefined' ? GM_info.script.version : '0.0.0',
    showUpdateToast
);

function LStorage(key, defaultValue) {
    let stored = localStorage.getItem(key);
    if (stored === null) {
        localStorage.setItem(key, JSON.stringify(defaultValue));
        return defaultValue
    }
    try {
        return JSON.parse(stored)
    } catch (e) {
        localStorage.setItem(key, JSON.stringify(defaultValue));
        return defaultValue
    }
}
// Read-only version of LStorage — never writes a default back to localStorage just
// for having been read. Used by the theme system so simply opening the Theme Changer
// (or exporting/polling) doesn't silently seed Discourse Extras' old built-in theme.
function GetStorageRaw(key, fallback) {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    try {
        return JSON.parse(stored)
    } catch (e) {
        return fallback
    }
}
function SetStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
        console.error(`SetStorage failed for key "${key}":`, e)
    }
}
function clearTheme() {
    Object
        .keys(themeKeys)
        .forEach(key => localStorage.removeItem(key));
    Object
        .keys(themeKeys)
        .forEach(key => {
        const cssVar = keyToCSSVar(key);
        document
            .documentElement
            .style
            .removeProperty(cssVar)
    });
    location.reload()
}
function keyToCSSVar(key) {
    return {
        sPrimary: "--primary",
        sPrimaryHigh: "--primary-high",
        sPrimaryMedium: "--primary-medium",
        sPrimaryLow: "--primary-low",
        sBG: "--secondary",
        sBorder: "--primary-rgb",
        sHighlight: "--d-sidebar-active-background",
        sAccent: "--tertiary",
        sAccentLow: "--tertiary-low"
    }[key] || `--${key}`
}
function getCurrentThemeObject() {
    return new Promise((resolve, reject) => {
        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.top = "50%";
        container.style.left = "50%";
        container.style.transform = "translate(-50%, -50%)";
        container.style.background = "var(--secondary)";
        container.style.color = "var(--primary)";
        container.style.padding = "20px";
        container.style.borderRadius = "10px";
        container.style.boxShadow = "0 0 15px rgba(0,0,0,0.5)";
        container.style.zIndex = "10000";
        container.style.minWidth = "280px";
        const title = document.createElement("h3");
        title.textContent = "Enter Theme Details";
        title.style.marginTop = "0";
        container.appendChild(title);
        const idLabel = document.createElement("label");
        idLabel.textContent = "Theme ID (unique, no spaces):";
        idLabel.style.display = "block";
        idLabel.style.marginTop = "10px";
        const idInput = document.createElement("input");
        idInput.type = "text";
        idInput.required = true;
        idInput.placeholder = "my-cool-theme";
        idInput.style.width = "100%";
        idInput.style.padding = "5px";
        idInput.autofocus = true;
        container.appendChild(idLabel);
        container.appendChild(idInput);
        const nameLabel = document.createElement("label");
        nameLabel.textContent = "Theme Name:";
        nameLabel.style.display = "block";
        nameLabel.style.marginTop = "10px";
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.required = true;
        nameInput.placeholder = "My Cool Theme";
        nameInput.style.width = "100%";
        nameInput.style.padding = "5px";
        container.appendChild(nameLabel);
        container.appendChild(nameInput);
        const describeLabel = document.createElement("label");
        describeLabel.textContent = "Describe your theme:";
        describeLabel.style.display = "block";
        describeLabel.style.marginTop = "10px";
        const describeInput = document.createElement("textarea");
        describeInput.type = "text";
        describeInput.placeholder = "Cool lavish purple theme.";
        describeInput.style.width = "100%";
        describeInput.style.padding = "5px";
        container.appendChild(describeLabel);
        container.appendChild(describeInput);
        const buttonsDiv = document.createElement("div");
        buttonsDiv.style.marginTop = "15px";
        buttonsDiv.style.textAlign = "right";
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.marginRight = "10px";
        cancelBtn.onclick = () => {
            document
                .body
                .removeChild(container);
            reject(new Error("User cancelled"))
        };
        const submitBtn = document.createElement("button");
        submitBtn.textContent = "OK";
        submitBtn.style.fontWeight = "bold";
        buttonsDiv.appendChild(cancelBtn);
        buttonsDiv.appendChild(submitBtn);
        container.appendChild(buttonsDiv);
        submitBtn.onclick = () => {
            const id = idInput
            .value
            .trim();
            const name = nameInput
            .value
            .trim();
            const description = describeInput.value;
            const user = getTextBetweenDashes(document.querySelector("img.avatar").src);
            if (!id || !name) {
                alert("Please fill both fields.");
                return
            }
            let colors = {};
            Object
                .keys(themeKeys)
                .forEach(key => {
                colors[key] = GetStorageRaw(key, themeKeys[key])
            });
            let extras = {};
            Object
                .keys(extraKeys)
                .forEach(key => {
                extras[key] = GetStorageRaw(key, extraKeys[key])
            });
            document
                .body
                .removeChild(container);
            resolve({id, name, description, user, colors, extras})
        };
        document
            .body
            .appendChild(container);
        idInput.focus()
    })
}
function importThemeFromJSON() {
    const input = prompt("Paste a Discourse Extras theme JSON to import:");
    if (!input) return;
    let themeObj;
    try {
        themeObj = JSON.parse(input);
    } catch (e) {
        alert("Invalid theme JSON.");
        return;
    }
    if (themeObj.colors) {
        Object.entries(themeObj.colors).forEach(([key, val]) => SetStorage(key, val));
    }
    if (themeObj.extras) {
        Object.entries(themeObj.extras).forEach(([key, val]) => SetStorage(key, val));
    }
    applyTheme();
    dextraToast(`Imported theme "${themeObj.name || themeObj.id || "Unnamed"}"!`);
}

function exportThemeToJSON() {
    getCurrentThemeObject().then(themeObj => {
        GM_setClipboard(JSON.stringify(themeObj));
        dextraToast("Theme JSON copied to clipboard!");
    }).catch(() => {});
}

const extraKeys = {
    sLogoUrl: "",
    sBackgroundUrl: ""
};

const themeKeys = {
    sPrimary: "#222222",
    sPrimaryHigh: "rgb(100.3,100.3,100.3)",
    sPrimaryMedium: "rgb(144.5,144.5,144.5)",
    sPrimaryLow: "#ffffff",
    sBG: "#ffffff",
    sBorder: "#ffffff",
    sHighlight: "#eeeeff",
    sAccent: "#F18B09",
    sAccentLow: "rgb(255, 246.6, 235.9)"
};
function formatString(str) {
    let withoutS = str.slice(1);
    let result = withoutS
    .replace(/([A-Z])(?=[a-z])/g, ' $1')
    .trim();
    return result
}
function getTextBetweenDashes(url) {
    let parts = url.split("/");
    return parts.length > 6
        ? parts[6]
    : null;
}
function hexToRgbString(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255].join(',');
}

// Only overrides a CSS variable when the user has actually chosen a value for it —
// no built-in Discourse Extras color scheme gets forced onto Discourse's own theme.
const themeCssVarMap = [
    {key: "sPrimary", vars: ["--primary"]},
    {key: "sPrimaryHigh", vars: ["--primary-high"]},
    {key: "sPrimaryMedium", vars: ["--primary-medium"]},
    {key: "sPrimaryLow", vars: ["--primary-low"]},
    {key: "sBG", vars: ["--secondary", "--header_background", "--primary-very-low"]},
    {key: "sBorder", vars: ["--primary-rgb"]},
    {key: "sHighlight", vars: ["--d-sidebar-active-background"]},
    {key: "sAccent", vars: ["--tertiary", "--tertiary-hover"]},
    {key: "sAccentLow", vars: ["--tertiary-low", "--tertiary-med-or-tertiary", "--tertiary-50"]}
];
function applyTheme() {
    themeCssVarMap.forEach(({key, vars}) => {
        const stored = localStorage.getItem(key);
        if (stored === null) {
            vars.forEach(v => document.documentElement.style.removeProperty(v));
            return;
        }
        const value = GetStorageRaw(key, null);
        vars.forEach(v => document.documentElement.style.setProperty(v, value));
    });
    if (localStorage.getItem("sBG") !== null) {
        document.documentElement.style.setProperty('--secondary-rgb', hexToRgbString(GetStorageRaw("sBG", "#ffffff")));
    } else {
        document.documentElement.style.removeProperty('--secondary-rgb');
    }
    const customLogoUrl = GetStorageRaw("sLogoUrl", extraKeys.sLogoUrl);
    const siteLogo = document.querySelector("#site-logo");
    if (siteLogo && customLogoUrl) {
        siteLogo.src = customLogoUrl;
    }
    const backgroundUrl = GetStorageRaw("sBackgroundUrl", extraKeys.sBackgroundUrl);
    if (backgroundUrl) {
        document.body.style.backgroundImage = `url("${backgroundUrl}")`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        document.body.style.backgroundAttachment = "fixed";
    } else {
        document.body.style.backgroundImage = "";
    }
}
function addButtons() {
    const panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.bottom = "50px";
    panel.style.right = "10px";
    panel.style.zIndex = "999";
    panel.style.padding = "10px";
    panel.style.background = "var(--secondary)";
    panel.style.border = "1px solid #aaa";
    panel.style.borderRadius = "8px";
    panel.style.boxShadow = "0 0 8px rgba(0,0,0,0.2)";
    panel.style.fontSize = "14px";
    panel.style.display = "none";
    const importBtn = document.createElement("button");
    importBtn.classList = "btn btn-primary";
    importBtn.textContent = "Import Theme (JSON)";
    importBtn.onclick = () => {
        importThemeFromJSON()
    };
    const exportBtn = document.createElement("button");
    exportBtn.classList = "btn btn-default";
    exportBtn.textContent = "Export Theme (JSON)";
    exportBtn.style.marginLeft = "5px";
    exportBtn.onclick = () => {
        exportThemeToJSON()
    };
    const reset = document.createElement("button");
    reset.classList = "btn btn-default";
    reset.textContent = "Clear Theme";
    reset.style.marginLeft = "5px";
    reset.onclick = () => {
        if (confirm("Reset all theme settings?")) {
            clearTheme()
        }
    }
    panel.appendChild(importBtn);
    panel.appendChild(exportBtn);
    panel.appendChild(reset);
    const pickerBox = document.createElement("div");
    pickerBox.style.display = "flex";
    pickerBox.style.flexDirection = "column";
    pickerBox.style.gap = "8px";
    pickerBox.style.marginTop = "10px";
    pickerBox.style.padding = "5px";
    pickerBox.style.border = "1px solid #ccc";
    pickerBox.style.borderRadius = "8px";
    Object
        .entries(themeKeys)
        .forEach(([key, def]) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        const label = document.createElement("label");
        label.textContent = formatString(key);
        label.style.width = "130px";
        const input = document.createElement("input");
        input.type = "color";
        input.value = GetStorageRaw(key, def);
        input.addEventListener("input", () => {
            SetStorage(key, input.value);
            applyTheme()
        });
        row.appendChild(label);
        row.appendChild(input);
        pickerBox.appendChild(row)
    });
    const urlBox = document.createElement("div");
    urlBox.style.display = "flex";
    urlBox.style.flexDirection = "column";
    urlBox.style.gap = "8px";
    urlBox.style.marginTop = "10px";
    [
        {key: "sLogoUrl", label: "Logo URL"},
        {key: "sBackgroundUrl", label: "Background URL"}
    ].forEach(({key, label}) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        const urlLabel = document.createElement("label");
        urlLabel.textContent = label;
        urlLabel.style.width = "130px";
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "https://...";
        input.style.flex = "1";
        input.value = GetStorageRaw(key, extraKeys[key]);
        input.addEventListener("change", () => {
            SetStorage(key, input.value);
            applyTheme()
        });
        row.appendChild(urlLabel);
        row.appendChild(input);
        urlBox.appendChild(row)
    });
    pickerBox.appendChild(urlBox);
    panel.appendChild(pickerBox);
    document
        .body
        .appendChild(panel);
    const toggleButton = document.createElement("li");
    toggleButton.className = "header-dropdown-toggle dextra-theme-header-icon";
    toggleButton.innerHTML = `
    <a href="javascript:void(0)" class="btn no-text icon btn-flat" tabindex="0" title="Theme Changer">
      <svg class="fa d-icon d-icon-palette svg-icon fa-width-auto svg-string" width="1em" height="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><use href="#palette"></use></svg>
    </a>
  `;
    toggleButton.onclick = (e) => {
        e.preventDefault();
        panel.style.display = panel.style.display === "none" ? "block" : "none";
    };
    dextraThemeToggleButton = toggleButton;
}
let dextraThemeToggleButton = null;
function dextraWireThemeHeaderIcon() {
    if (!dextraThemeToggleButton || document.querySelector(".dextra-theme-header-icon")) return;
    const chatIcon = document.querySelector(".chat-header-icon");
    if (!chatIcon) return;
    chatIcon.insertAdjacentElement("afterend", dextraThemeToggleButton);
}
function watchAndApplyTheme() {
    const allKeys = Object.assign({}, themeKeys, extraKeys);
    let last = JSON.stringify(Object.fromEntries(Object.keys(allKeys).map(k => [
        k,
        GetStorageRaw(k, allKeys[k])
    ])));
    setInterval(() => {
        const now = JSON.stringify(Object.fromEntries(Object.keys(allKeys).map(k => [
            k,
            GetStorageRaw(k, allKeys[k])
        ])));
        if (now !== last) {
            applyTheme();
            last = now
        }
    }, 1000)
}
GM_addStyle(`
  .mfp-bg {
    background: rgba(0, 0, 0, 0.8) !important;
  }
  .c-navbar-container {
      z-index:10000;
  }
  .dextra-toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 14px 20px;
    background-color: var(--secondary);
    color: var(--primary);
    text-align: left;
    z-index: 99999;
    border: 1px solid var(--primary-low);
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    cursor: pointer;
    transition: transform 0.2s, opacity 0.2s;
    user-select: none;
  }
  .dextra-toast:hover {
    transform: scale(1.03);
  }
  .dextra-section .sidebar-section-header-wrapper.sidebar-row {
    transition: background-color 0.3s;
  }
  .dextra-section .sidebar-section-header-wrapper.sidebar-row:hover {
    background-color: var(--primary-low);
  }
  /* AntiCrash reuses Discourse's own .alert component as-is — only the
     <summary> marker needs a couple of lines on top of that. */
  .dextra-anticrash-shield summary {
    cursor: pointer;
    list-style: none;
  }
  .dextra-anticrash-shield summary::-webkit-details-marker {
    display: none;
  }
  .dextra-fav.dextra-fav-active {
    color: #f1c40f;
  }
  .dextra-fav-row {
    display: flex;
    align-items: center;
  }
  .dextra-fav-row .sidebar-section-link {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dextra-fav-empty {
    padding: 6px 10px;
    opacity: 0.6;
    font-size: 0.9em;
  }
  .dextra-blocked-placeholder {
    padding: 6px 0;
  }
  .dextra-blocked-show {
    opacity: 0.7;
    font-style: italic;
  }
  .dextra-intro {
    position: fixed;
    inset: 0;
    z-index: 999999;
    background: #000;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 6px;
    cursor: pointer;
    animation: dextra-intro-fade 2.6s ease forwards;
  }
  .dextra-intro .dextra-intro-studio {
    font-size: 2.2em;
    font-weight: 700;
    letter-spacing: 0.08em;
    opacity: 0;
    animation: dextra-intro-pop 1.6s ease forwards 0.15s;
  }
  .dextra-intro .dextra-intro-tag {
    font-size: 0.85em;
    color: #999;
    letter-spacing: 0.05em;
    opacity: 0;
    animation: dextra-intro-pop 1.6s ease forwards 0.5s;
  }
  @keyframes dextra-intro-pop {
    0% { opacity: 0; transform: scale(0.92); }
    35% { opacity: 1; transform: scale(1); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes dextra-intro-fade {
    0% { opacity: 1; }
    70% { opacity: 1; }
    100% { opacity: 0; visibility: hidden; }
  }
  @media (prefers-reduced-motion: reduce) {
    .dextra-intro { display: none; }
  }
`);
function dextraShowIntro() {
    if (sessionStorage.getItem("dextraIntroShown")) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    sessionStorage.setItem("dextraIntroShown", "true");
    const intro = document.createElement("div");
    intro.className = "dextra-intro";
    intro.innerHTML = `
      <div class="dextra-intro-studio">DEVCAT STUDIOS</div>
      <div class="dextra-intro-tag">More for viewing, less for writing.</div>
    `;
    intro.onclick = () => intro.remove();
    document.body.appendChild(intro);
    setTimeout(() => intro.remove(), 2700);
}
function dextraToast(message, duration = 3000) {
    document.querySelectorAll(".dextra-toast").forEach(t => t.remove());
    const toast = document.createElement("div");
    toast.className = "dextra-toast";
    toast.textContent = message;
    let opacity = 1;
    let fade = null;
    const dismiss = () => {
        if (fade) return;
        fade = setInterval(() => {
            opacity -= 0.1;
            toast.style.opacity = String(opacity);
            if (opacity <= 0) {
                clearInterval(fade);
                toast.remove();
            }
        }, 15);
    };
    toast.onclick = dismiss;
    document.body.appendChild(toast);
    setTimeout(dismiss, duration);
}
var script = document.createElement("script");
script.src = "https://kit.fontawesome.com/fcc6f02ae0.js";
script.crossOrigin = "anonymous";
document
    .head
    .appendChild(script);
async function showRaw(postId) {
    const response = await fetch(`/posts/${postId}.json`);
    const data = await response.json();
    console.log(data.raw);
    return data.raw
}
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}
const rawbuttonhtml = `
<i class="fa-brands fa-markdown"></i>
<span aria-hidden="true">
        </span>
`;
function doesFAIconExist(iconClass) {
    const el = document.createElement('i');
    el.className = `fa fa-${iconClass}`;
    el.style.position = 'absolute';
    el.style.visibility = 'hidden';
    document
        .body
        .appendChild(el);
    const style = window.getComputedStyle(el, '::before');
    const content = style.getPropertyValue('content');
    document
        .body
        .removeChild(el);
    return content && content !== 'none' && content !== '""'
}
function encodeObfuscated(str, key) {
    let strBytes = new TextEncoder().encode(str);
    let keyBytes = new TextEncoder().encode(key);
    let encodedBytes = strBytes.map((b, i) => b ^ keyBytes[i % keyBytes.length]);
    let base64 = btoa(String.fromCharCode(...encodedBytes));
    return "XxH@" + base64
        .split("")
        .reverse()
        .join("") + "@HxX"
}
function decodeObfuscated(obfStr, key, triedFallback = false) {
    try {
        let cleaned = obfStr
        .replace(/^XxH@/, "")
        .replace(/@HxX$/, "");
        let reversed = cleaned
        .split("")
        .reverse()
        .join("");
        let decodedStr = atob(reversed);
        let decodedBytes = new Uint8Array([...decodedStr].map(c => c.charCodeAt(0)));
        let keyBytes = new TextEncoder().encode(key);
        let originalBytes = decodedBytes.map((b, i) => b ^ keyBytes[i % keyBytes.length]);
        let cem = new TextDecoder().decode(originalBytes);
        if (!cem.startsWith("dextrapm")) {
            if (!triedFallback && key !== "discourse") {
                return decodeObfuscated(obfStr, "discourse", true)
            }
            return "[This message is NOT for you!]"
        }
        return cem.replace("dextrapm", "")
    } catch (e) {
        if (!triedFallback && key !== "discourse") {
            return decodeObfuscated(obfStr, "discourse", true)
        }
        return "[This message is NOT for you!]"
    }
}
function descCode(element) {
    while (element) {
        if (element.tagName && element.tagName.toLowerCase() === 'code') {
            return true
        }
        element = element.parentElement
    }
    return false
}
function updateElementWithDiff(oldEl, newHtml) {
    const temp = document.createElement('div');
    temp.innerHTML = newHtml;
    function diffUpdate(oldNode, newNode) {
        if (oldNode.nodeType !== newNode.nodeType || oldNode.nodeName !== newNode.nodeName) {
            oldNode.replaceWith(newNode.cloneNode(true));
            return
        }
        if (oldNode.nodeType === Node.TEXT_NODE) {
            if (oldNode.textContent !== newNode.textContent) {
                oldNode.textContent = newNode.textContent
            }
            return
        }
        if (oldNode.nodeType === Node.ELEMENT_NODE) {
            const oldAttrs = oldNode.attributes;
            const newAttrs = newNode.attributes;
            for (const attr of newAttrs) {
                if (oldNode.getAttribute(attr.name) !== attr.value) {
                    oldNode.setAttribute(attr.name, attr.value)
                }
            }
            for (const attr of oldAttrs) {
                if (!newNode.hasAttribute(attr.name)) {
                    oldNode.removeAttribute(attr.name)
                }
            }
            const oldChildren = oldNode.childNodes;
            const newChildren = newNode.childNodes;
            const maxLen = Math.max(oldChildren.length, newChildren.length);
            for (let i = 0; i < maxLen; i += 1) {
                const oldChild = oldChildren[i];
                const newChild = newChildren[i];
                if (oldChild && newChild) {
                    diffUpdate(oldChild, newChild)
                } else if (newChild && !oldChild) {
                    oldNode.appendChild(newChild.cloneNode(true))
                } else if (oldChild && !newChild) {
                    oldNode.removeChild(oldChild)
                }
            }
        }
    }
    diffUpdate(oldEl, temp)
}
function parseCustomBBCodeRecursive(text) {
    const tagPattern = /\[([a-z]+)(?:=([^\]]+))?\]/i;

    function parseSegment(segment) {
        const frag = document.createDocumentFragment();

        while (segment.length > 0) {
            const openMatch = segment.match(tagPattern);

            if (!openMatch) {
                frag.appendChild(document.createTextNode(segment));
                break;
            }

            const index = openMatch.index;
            if (index > 0) {
                frag.appendChild(document.createTextNode(segment.slice(0, index)));
                segment = segment.slice(index);
            }

            const tag = openMatch[1].toLowerCase();
            const param = openMatch[2] || "";

            // find matching closing tag index accounting for nested tags
            let searchIndex = openMatch[0].length;
            let openCount = 1;

            while (openCount > 0) {
                const nextOpen = segment.indexOf(`[${tag}`, searchIndex);
                const nextClose = segment.indexOf(`[/${tag}]`, searchIndex);

                if (nextClose === -1) {
                    frag.appendChild(document.createTextNode(segment));
                    segment = "";
                    return frag;
                }

                if (nextOpen !== -1 && nextOpen < nextClose) {
                    openCount++;
                    searchIndex = nextOpen + 1;
                } else {
                    openCount--;
                    searchIndex = nextClose + tag.length + 3; // length of [/${tag}]
                }
            }

            const contentStart = openMatch[0].length;
            const contentEnd = searchIndex - (`[/${tag}]`.length);
            const innerContent = segment.slice(contentStart, contentEnd);

            const innerFrag = parseSegment(innerContent);

            let wrapper;

            switch (tag) {
                case "bgc":
                    wrapper = document.createElement("span");
                    wrapper.style.backgroundColor = param;
                    wrapper.appendChild(innerFrag);
                    break;
                case "color":
                    wrapper = document.createElement("span");
                    wrapper.style.color = param;
                    wrapper.appendChild(innerFrag);
                    break;
                case "style":
                    wrapper = document.createElement("span");
                    wrapper.style.cssText = param;
                    wrapper.appendChild(innerFrag);
                    break;
                case "size":
                    wrapper = document.createElement("span");
                    wrapper.style.fontSize = param + "px";
                    wrapper.appendChild(innerFrag);
                    break;
                case "mention":
                    wrapper = document.createElement("a");
                    wrapper.className = "mention";
                    wrapper.textContent = param + " ";
                    wrapper.appendChild(innerFrag);
                    break;
                case "pm":
                    try {
                        const username = document.querySelector("img.avatar").src.split("/")[6];
                        const argspl = innerContent.split("|:|");
                        const arg1 = decodeObfuscated(argspl[0], username);
                        const arg2 = decodeObfuscated(argspl[1], username);
                        let visible;
                        if (arg1 === "[This message is NOT for you!]" && arg2 === "[This message is NOT for you!]") {
                            visible = arg1;
                        } else if (arg1 === "[This message is NOT for you!]") {
                            visible = arg2;
                        } else {
                            visible = arg1;
                        }
                        wrapper = document.createElement("blockquote");
                        wrapper.textContent = visible;
                    } catch {
                        wrapper = document.createElement("blockquote");
                        wrapper.textContent = "Incorrectly formatted message";
                    }
                    break;
                case "emoji":
                    wrapper = document.createElement("i");
                    wrapper.className = param ? `fa-${innerContent} fa-${param}` : `fa-solid fa-${innerContent}`;
                    break;
                case "codepen":
                    wrapper = document.createElement("iframe");
                    wrapper.src = `https://cdpn.io/${param}/fullpage/${innerContent}?view=`;
                    wrapper.frameBorder = "0";
                    wrapper.style.width = "90%";
                    wrapper.style.height = "600px";
                    wrapper.style.clipPath = "inset(120px 0 0 0)";
                    wrapper.style.marginTop = "-120px";
                    break;
                case "embed":
                    wrapper = document.createElement("iframe");
                    wrapper.rel = "";
                    wrapper.style.width = "900px";
                    wrapper.style.height = "600px";
                    wrapper.src = param;
                    wrapper.frameBorder = "0";
                    break;
                default:
                    wrapper = document.createElement("span");
                    wrapper.style.color = "red";
                    wrapper.style.backgroundColor = "yellow";
                    wrapper.style.padding = "1px";
                    wrapper.style.margin = "1px";
                    wrapper.style.border = "1px solid red";
                    wrapper.textContent = "Invalid Discourse Extras Tag!";
                    break;
            }

            frag.appendChild(wrapper);
            segment = segment.slice(searchIndex);
        }

        return frag;
    }

    return parseSegment(text);
}

// Legacy tag syntax (!{cmd arg...}) from pre-4.0 versions of the script, kept for backwards compatibility.
function parseLegacyBBCode(text) {
    const regex = /!\{(.*?)\}/gs;
    return text.replace(regex, (match, p1) => {
        const ql = p1.split("</p>").join("").split("<p>").join("").split(/[\n ]+/);
        const cmd = ql[0];
        const arg = ql[1];
        const argt = ql.slice(2).join(" ");
        let mna;
        switch (cmd) {
            case "phantom":
                mna = "";
                break;
            case "bgc":
                mna = `<span style="background-color:${arg}">`;
                break;
            case "color":
                mna = `<span style="color:${arg}">`;
                break;
            case "style":
                mna = `<span style="${arg} ${argt}">`;
                break;
            case "s":
                mna = "</span>";
                break;
            case "size":
                mna = `<span style="font-size:${arg}px;">`;
                break;
            case "codepen":
                mna = `<iframe src="https://cdpn.io/${arg}/fullpage/${argt}?view=" frameborder="0" style="width:90%;height:600px;clip-path: inset(120px 0 0 0); margin-top: -120px;"></iframe>`;
                break;
            case "embed": {
                const pw = `${arg} ${argt}`.replace('<a href="', "");
                mna = `<iframe rel="" style="width:900px;height:600px;" src="${pw}" frameborder="0"></iframe>`;
                break;
            }
            case "mention":
                mna = `<a class='mention'>${arg} ${argt}</a>`;
                break;
            case "pm":
                try {
                    const username = document.querySelector("img.avatar").src.split("/")[6];
                    const argspl = arg.split("|:|");
                    const arg1 = decodeObfuscated(argspl[0], username);
                    const arg2 = decodeObfuscated(argspl[1], username);
                    if (arg1 === "[This message is NOT for you!]" && arg2 === "[This message is NOT for you!]") {
                        mna = `<blockquote>[This message is NOT for you!]</blockquote>`;
                    } else if (arg1 === "[This message is NOT for you!]") {
                        mna = `<blockquote>${arg2}</blockquote>`;
                    } else {
                        mna = `<blockquote>${arg1}</blockquote>`;
                    }
                } catch {
                    mna = `<blockquote>Incorrectly formatted message</blockquote>`;
                }
                break;
            case "html":
                mna = `<iframe srcdoc="${arg} ${argt}"></iframe>`;
                break;
            case "emoji":
                mna = argt ? `<i class="fa-${argt} fa-${arg}"></i>` : `<i class="fa-solid fa-${arg}"></i>`;
                break;
            default:
                mna = "<span style='color:red; background-color:yellow; padding:1px; margin:1px; border: 1px solid red;'>Invalid Discourse Extras Tag!</span>";
                break;
        }
        return mna;
    });
}

function walkAndReplace(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text.includes("!{")) {
            const temp = document.createElement('div');
            temp.innerHTML = parseLegacyBBCode(text);
            for (const child of Array.from(temp.childNodes)) {
                walkAndReplace(child);
            }
            node.replaceWith(...Array.from(temp.childNodes));
        } else if (text.includes("[")) {
            const frag = parseCustomBBCodeRecursive(text);
            node.replaceWith(frag);
        }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const child of Array.from(node.childNodes)) {
            walkAndReplace(child);
        }
    }
}


// Discourse's server-side cook step wraps anything it recognizes as math in
// <span class="math"> (inline) or <div class="math"> (block display math) before
// the post ever reaches the client — confirmed from the actual incident that
// started this feature. Only text inside those wrappers ever reaches MathJax/KaTeX,
// so LaTeX-shaped text sitting *outside* them (e.g. someone just typing the literal
// characters "\boxed{}\boxed{}...") is inert — it renders as plain text, at zero
// cost, and must not be flagged.
function dextraExtractMathSegments(html) {
    const matches = html.match(/<(span|div) class="math"[^>]*>[\s\S]*?<\/\1>/g) || [];
    return matches.join(" ");
}

// Returns null if the content looks safe, or a {reason, detail} object explaining
// exactly what tripped the check — shown to the user instead of a generic warning.
function dextraAntiCrashRisk(html) {
    // Raw size alone says nothing about render cost — a long tutorial or code-heavy
    // post can easily pass 20k characters and still be completely harmless to render.
    // What actually matters is whether the length comes from one token repeated over
    // and over (a padding bomb) vs. genuinely varied content (real writing). Coverage
    // is the right test here, not character-set diversity — the printable alphabet is
    // only ~90 characters, so *any* sufficiently long text looks "low diversity" by
    // that measure, prose included. Requires one repeating run to make up the
    // majority of the whole post before this fires.
    if (html.length > 50000) {
        const runMatch = html.match(/(.{1,100}?)\1{99,}/);
        if (runMatch && runMatch[0].length > html.length * 0.5) {
            return {
                reason: "oversized, repetitive content",
                detail: `This post is ${html.length.toLocaleString()} characters long, and over half of it is a single pattern repeated back-to-back — the profile of a padding bomb, not real writing.`
            };
        }
    }

    const mathSegments = dextraExtractMathSegments(html);
    const mathSpanCount = (html.match(/<(span|div) class="math"/g) || []).length;

    // Deep nesting is the real danger, not raw size — a tiny string like
    // \boxed{\boxed{\boxed{...}}} repeated 70x is exponentially expensive for
    // MathJax/KaTeX to lay out even though it's under a kilobyte on the wire.
    // Scoped to actual math segments only — see dextraExtractMathSegments above.
    const nestedMatch = mathSegments.match(/(\\[a-zA-Z]+\{){15,}/);
    if (nestedMatch) {
        const depth = (nestedMatch[0].match(/\\[a-zA-Z]+\{/g) || []).length;
        return {
            reason: "deeply nested LaTeX",
            detail: `Found a LaTeX command nested ${depth} levels deep in a row (e.g. \\boxed{\\boxed{\\boxed{...}}}) inside actual math markup. Small source, but exponentially expensive for MathJax/KaTeX to typeset.`
        };
    }

    // Many separate math expressions can add up even if none of them is individually
    // deep — a flood of simple ones is still real work for MathJax/KaTeX to typeset.
    if (mathSpanCount > 80) {
        return {
            reason: "math expression flood",
            detail: `${mathSpanCount} separate math expressions were found in one post — even simple ones add up fast for MathJax/KaTeX.`
        };
    }

    // Generic fallback: a short structural token repeated back-to-back a lot — covers
    // spoiler-nesting bombs the same way the LaTeX check above covers \boxed{}.
    // Must actually be a real HTML tag (<...>) or one of Discourse Extras' own tag
    // syntaxes ([tag]/[/tag] or !{tag}) — both of those get walked/parsed and can be
    // genuinely expensive when nested. Backslash-LaTeX-looking text like "\boxed{}"
    // sitting outside a real math span is neither: it's inert plain text, so it must
    // NOT match here either — same reasoning as the math-segment scoping above.
    const repeatMatch = html.match(/(.{2,20}?)\1{19,}/);
    if (repeatMatch && /^(<[a-zA-Z]|\[\/?[a-zA-Z]|!\{)/.test(repeatMatch[1])) {
        const times = Math.floor(repeatMatch[0].length / repeatMatch[1].length);
        return {
            reason: "repeated pattern bomb",
            detail: `The pattern "${escapeHtml(repeatMatch[1]).slice(0, 20)}" repeats back-to-back ${times}+ times in a row.`
        };
    }

    // Scoped to actual math segments only, same reasoning as the nesting check above.
    const latexHits = (mathSegments.match(/\$\$|\\\[|\\begin\{|\\frac|\\sum|\\int|\\boxed|\\underbrace|\\overbrace|\\sqrt|\\left/g) || []).length;
    if (latexHits > 20) {
        return {
            reason: "dense LaTeX",
            detail: `${latexHits} separate LaTeX render triggers were found inside this post's math markup.`
        };
    }

    const spoilerHits = (html.match(/\[spoiler\]|!\{phantom\}|!\{size |\[size /g) || []).length;
    if (spoilerHits > 15) {
        return {
            reason: "nested spoiler bomb",
            detail: `${spoilerHits} spoiler/size tags were found in one post.`
        };
    }
    return null;
}
function dextraShowAntiCrashShield(element, rawHtml, iscooked, risk) {
    element.innerHTML = "";
    const shield = document.createElement("details");
    shield.className = "alert alert-error dextra-anticrash-shield";
    shield.innerHTML = `
      <summary>&#9888;&#65039; Held back by AntiCrash &mdash; ${risk.reason}</summary>
      <p>${risk.detail}</p>
      <button class="btn btn-default btn-small dextra-anticrash-show" type="button">Show anyway</button>
    `;
    shield.querySelector(".dextra-anticrash-show").onclick = (e) => {
        e.preventDefault();
        element.dataset.dextraAnticrashApproved = "true";
        element.innerHTML = rawHtml;
        processCookedElement(element, iscooked);
    };
    element.appendChild(shield);
}
function processCookedElement(element, iscooked = false) {
    if (element.dataset.dextraAnticrashApproved !== "true") {
        const risk = dextraAntiCrashRisk(element.innerHTML);
        if (risk) {
            dextraShowAntiCrashShield(element, element.innerHTML, iscooked, risk);
            return;
        }
    }
    walkAndReplace(element);
    element.classList.add("cooked");

    const fpo = element.parentElement;
    if (iscooked && !fpo.classList.contains("small-action-custom-message")) {
        const place = fpo.querySelector(".actions");
        if (!place.querySelector(".dextra-md")) {
            const button = document.createElement("button");
            button.innerHTML = rawbuttonhtml;
            button.classList = "btn no-text btn-icon btn-flat dextra-md";
            button.onclick = function () {
                const postId = Number(fpo.parentElement.parentElement.parentElement.getAttribute('data-post-id'));
                const dialog = document.createElement("div");
                const place = document.querySelector(".discourse-root");
                showRaw(postId).then(raw => {
                    const escaped = escapeHtml(raw);
                    dialog.innerHTML = `
<div class="modal-container">
  <div class="modal d-modal create-invite-modal" role="dialog" aria-modal="true" aria-labelledby="discourse-modal-title">
    <div class="d-modal__container">
      <div class="d-modal__header">
        <div class="d-modal__title">
          <h1 id="discourse-modal-title" class="d-modal__title-text">Raw markdown content</h1>
        </div>
        <button class="btn no-text btn-icon btn-transparent modal-close dextra-hehe" title="close" type="button">
          <svg class="fa d-icon d-icon-xmark svg-icon svg-string" xmlns="http://www.w3.org/2000/svg"><use href="#xmark"></use></svg>
        </button>
      </div>
      <div class="d-modal__body" tabindex="-1">
        <p><pre><code class="hljs lang-markdown language-markdown">${escaped}</code></pre></p>
      </div>
      <div class="d-modal__footer">
        <button class="btn btn-text btn-primary dextra-lolzies" autofocus="true" type="button">
          <span class="d-button-label">Close</span>
        </button>
      </div>
    </div>
  </div>
  <div class="d-modal__backdrop"></div>
</div>`;
                    dialog.querySelector(".dextra-lolzies").onclick = () => dialog.remove();
                    dialog.querySelector(".dextra-hehe").onclick = () => dialog.remove();
                    place.appendChild(dialog);
                });
            };
            const editbutton = place.querySelector(".post-action-menu__show-more");
            place.insertBefore(button, editbutton);

            const postId = Number(fpo.parentElement.parentElement.parentElement.getAttribute('data-post-id'));
            const favButton = document.createElement("button");
            favButton.innerHTML = `<svg class="fa d-icon d-icon-star svg-icon svg-string" xmlns="http://www.w3.org/2000/svg"><use href="#star"></use></svg>`;
            favButton.classList = "btn no-text btn-icon btn-flat dextra-fav";
            favButton.title = "Favorite this post";
            if (dextraGetFavorites().some(f => f.postId === postId)) favButton.classList.add("dextra-fav-active");
            favButton.onclick = () => {
                const title = document.title.replace(/^\(\d+\)\s*/, "");
                const url = `${location.origin}${location.pathname}`;
                dextraToggleFavorite(postId, title, url);
                favButton.classList.toggle("dextra-fav-active");
            };
            place.insertBefore(favButton, editbutton);
        }
    }

    try {
        document.querySelector(".c-navbar-container").style.zIndex = "7";
    } catch {}
}

setInterval(() => {
    document
        .querySelectorAll(".cooked")
        .forEach(element => {
        processCookedElement(element, true)
    });
    document
        .querySelectorAll(".chat-message-text")
        .forEach(element => {
        processCookedElement(element, false)
    });
    document
        .querySelectorAll(".d-editor-preview")
        .forEach(element => {
        processCookedElement(element, false)
    })
    const emailsDisabledNotice = document.getElementById("global-notice-alert-emails-disabled");
    if (emailsDisabledNotice && emailsDisabledNotice.textContent !== "Thanks for using Discourse Extras!") {
        emailsDisabledNotice.textContent = "Thanks for using Discourse Extras!";
    }
    dextraWireComposerPmShorthand();
    dextraWireComposerPmButton();
    dextraWireFlagSpamButton();
    dextraWireBumpWarning();
    dextraApplyBlockedUsers();
    dextraWireUserCardBlockButton();
    dextraWireThemeHeaderIcon();
}, 800);

// ===== PM shorthand + editor button (moved out of the sidebar and into the composer) =====
function dextraTranslatePmShorthand(textarea) {
    const regex = /\[pm\s+(\S+)\]([\s\S]*?)\[\/pm\]/;
    const match = textarea.value.match(regex);
    if (!match) return;
    const targetUser = match[1];
    const message = match[2];
    let username;
    try {
        username = document.querySelector("img.avatar").src.split("/")[6];
    } catch (e) {
        return;
    }
    const encoded = "[pm]" + encodeObfuscated("dextrapm" + message, targetUser) + "|:|" + encodeObfuscated("dextrapm" + message, username) + "[/pm]";
    textarea.value = textarea.value.replace(regex, encoded);
    textarea.dispatchEvent(new Event("input", {bubbles: true}));
}
function dextraWireComposerPmShorthand() {
    document.querySelectorAll("textarea.d-editor-input").forEach(textarea => {
        if (textarea.dataset.dextraPmWired) return;
        textarea.dataset.dextraPmWired = "true";
        textarea.addEventListener("input", () => dextraTranslatePmShorthand(textarea));
    });
}
function dextraWireComposerPmButton() {
    document.querySelectorAll(".d-editor-button-bar").forEach(bar => {
        if (bar.querySelector(".dextra-pm-btn")) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn no-text btn-flat dextra-pm-btn";
        btn.title = "Insert secret PM";
        btn.innerHTML = `<svg class="fa d-icon d-icon-lock svg-icon svg-string" xmlns="http://www.w3.org/2000/svg"><use href="#lock"></use></svg>`;
        btn.onclick = (e) => {
            e.preventDefault();
            const editor = bar.closest(".d-editor");
            const textarea = editor ? editor.querySelector("textarea.d-editor-input") : null;
            doit(textarea);
        };
        bar.appendChild(btn);
    });
}

// ===== Favorite Posts (moved out of the sidebar, star lives next to the raw-markdown button) =====
function dextraGetFavorites() {
    return LStorage("dextraFavorites", []);
}
function dextraSetFavorites(list) {
    SetStorage("dextraFavorites", list);
    dextraRenderFavoritesSidebar();
}
function dextraToggleFavorite(postId, title, url) {
    const favs = dextraGetFavorites();
    const idx = favs.findIndex(f => f.postId === postId);
    if (idx >= 0) {
        favs.splice(idx, 1);
    } else {
        favs.push({postId, title, url});
    }
    dextraSetFavorites(favs);
}
function buildFavoritesSidebarSection() {
    if (document.querySelector('[data-section-name="dextra-favorites"]')) {
        return document.getElementById("sidebar-section-content-dextra-favorites");
    }
    const community = document.querySelector("#sidebar-section-content-community");
    if (!community) return null;
    const section = document.createElement("div");
    section.className = "sidebar-section sidebar-section-wrapper sidebar-section--expanded dextra-section";
    section.setAttribute("data-section-name", "dextra-favorites");
    section.innerHTML = `
    <div class="sidebar-section-header-wrapper sidebar-row">
      <button class="btn no-text sidebar-section-header sidebar-section-header-collapsable btn-transparent dextra-section-toggle" aria-controls="sidebar-section-content-dextra-favorites" aria-expanded="true" title="Toggle section" type="button">
        <span class="sidebar-section-header-caret"><svg class="fa d-icon d-icon-star svg-icon prefix-icon svg-string" xmlns="http://www.w3.org/2000/svg"><use href="#star"></use></svg></span>
        <span class="sidebar-section-header-text">Favorite Posts</span>
      </button>
    </div>
    <ul id="sidebar-section-content-dextra-favorites" class="sidebar-section-content"></ul>
  `;
    const communitySection = community.closest(".sidebar-section-wrapper");
    communitySection.parentElement.appendChild(section);
    section.querySelector(".dextra-section-toggle").onclick = () => {
        const content = section.querySelector("#sidebar-section-content-dextra-favorites");
        content.style.display = content.style.display === "none" ? "" : "none";
    };
    return section.querySelector("#sidebar-section-content-dextra-favorites");
}
function dextraRenderFavoritesSidebar() {
    const list = buildFavoritesSidebarSection();
    if (!list) return;
    list.innerHTML = "";
    const favs = dextraGetFavorites();
    if (favs.length === 0) {
        const li = document.createElement("li");
        li.className = "sidebar-section-link-wrapper dextra-fav-empty";
        li.textContent = "No favorites yet";
        list.appendChild(li);
        return;
    }
    favs.forEach(fav => {
        const li = document.createElement("li");
        li.className = "sidebar-section-link-wrapper dextra-fav-row";
        const a = document.createElement("a");
        a.className = "sidebar-section-link sidebar-row";
        a.href = fav.url;
        a.textContent = fav.title;
        const remove = document.createElement("button");
        remove.className = "btn no-text btn-icon btn-flat";
        remove.innerHTML = "&times;";
        remove.title = "Remove favorite";
        remove.onclick = (e) => {
            e.preventDefault();
            dextraToggleFavorite(fav.postId);
        };
        li.appendChild(a);
        li.appendChild(remove);
        list.appendChild(li);
    });
}

// ===== Flag Spam Posts (moved out of the sidebar, now lives next to the topic's notification-tracking button) =====
function dextraCreateFlagSpamButton() {
    const spamRegex = /This is the spam/i;
    const btn = document.createElement("button");
    btn.className = "btn btn-default no-text btn-icon dextra-flagspam-btn";
    btn.title = "Flag Spam Posts";
    btn.type = "button";
    btn.innerHTML = `<svg class="fa d-icon svg-icon svg-string" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><use href="#flag"></use></svg>`;
    btn.onclick = () => {
        const posts = document.querySelectorAll('.topic-post');
        const spamPosts = [];
        posts.forEach(post => {
            const cooked = post.querySelector('.cooked');
            if (!cooked) {
                return
            }
            if (spamRegex.test(cooked.innerText || "")) {
                spamPosts.push(post)
            }
        });
        if (spamPosts.length === 0) {
            document.querySelector(".dextra-flagspam-modal")
                ?.remove();
            const emptyModalHTML = `
  <div class="modal-container dextra-flagspam-modal">
    <div class="modal d-modal create-invite-modal" aria-modal="true" role="dialog">
      <div class="d-modal__container">
        <div class="d-modal__header">
          <div class="d-modal__title">
            <h1 class="d-modal__title-text">No Spam Posts</h1>
          </div>
          <button class="btn no-text btn-icon btn-transparent modal-close dextra-hailnah2" title="close" type="button">
            <svg class="fa d-icon d-icon-xmark svg-icon svg-string" xmlns="http://www.w3.org/2000/svg">
              <use href="#xmark"></use>
            </svg>
          </button>
        </div>
        <div class="d-modal__body">
          <p>You're all clear! No spam posts were found. 🎉</p>
        </div>
        <div class="d-modal__footer">
          <button class="btn btn-text btn-primary dextra-hailnah" type="button">
            <span class="d-button-label">Nice</span>
          </button>
        </div>
      </div>
    </div>
    <div class="d-modal__backdrop"></div>
  </div>
  `;
            const droot = document.querySelector(".discourse-root") || document.body;
            droot.insertAdjacentHTML("beforeend", emptyModalHTML);
            document
                .querySelector(".dextra-hailnah")
                .onclick = document
                .querySelector(".dextra-hailnah2")
                .onclick = () => {
                document.querySelector(".dextra-flagspam-modal")
                    ?.remove()
            };
            return
        }
        const modalHTML = `
<div class="modal-container dextra-flagspam-modal">
  <div class="modal d-modal create-invite-modal" data-keyboard="false" aria-modal="true" role="dialog" aria-labelledby="discourse-modal-title">
    <div class="d-modal__container">
      <div class="d-modal__header">
        <div class="d-modal__title">
          <h1 id="discourse-modal-title" class="d-modal__title-text">Flag Spam Posts</h1>
        </div>
        <button class="btn no-text btn-icon btn-transparent modal-close dextra-hailnah2" title="close" type="button">
          <svg class="fa d-icon d-icon-xmark svg-icon svg-string" xmlns="http://www.w3.org/2000/svg">
            <use href="#xmark"></use>
          </svg>
          <span aria-hidden="true"></span>
        </button>
      </div>
      <div class="d-modal__body dextra-bodymodal" tabindex="-1">
        <p>Found ${spamPosts.length} spam posts. Is this okay?</p>
      </div>
      <div class="d-modal__footer">
        <button class="btn btn-text btn-primary dextra-lesgo" autofocus="true" type="button">
          <span class="d-button-label">Yes, flag them</span>
        </button>
        <button class="btn btn-text btn-transparent dextra-hailnah" type="button">
          <span class="d-button-label">Cancel</span>
        </button>
      </div>
    </div>
  </div>
  <div class="d-modal__backdrop"></div>
</div>
`;
        document.querySelector(".dextra-flagspam-modal")
            ?.remove();
        const droot = document.querySelector(".discourse-root") || document.body;
        droot.insertAdjacentHTML("beforeend", modalHTML);
        document
            .querySelector(".dextra-lesgo")
            .onclick = () => {
            window.postMessage({
                action: "flagConfirmed"
            }, "*");
            document.querySelector(".dextra-flagspam-modal")
                ?.remove()
        };
        document
            .querySelector(".dextra-hailnah")
            .onclick = () => {
            window.postMessage({
                action: "flagCancelled"
            }, "*");
            document.querySelector(".dextra-flagspam-modal")
                ?.remove()
        };
        document
            .querySelector(".dextra-hailnah2")
            .onclick = () => {
            document.querySelector(".dextra-flagspam-modal")
                ?.remove()
        };
        function cleanStyles() {
            spamPosts.forEach(post => {
                const cooked = post.querySelector('.cooked');
                if (cooked) {
                    cooked.style.border = "";
                    cooked.style.padding = "";
                    cooked.style.borderRadius = ""
                }
            })
        }
        async function flagPostById(postId) {
            try {
                const csrfToken = document.querySelector("meta[name='csrf-token']")
                ?.content;
                if (!csrfToken) {
                    console.error("CSRF token not found.");
                    return
                }
                const formData = new URLSearchParams();
                formData.append("id", postId);
                formData.append("post_action_type_id", "8");
                formData.append("flag_topic", "false");
                const response = await fetch("/post_actions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "X-CSRF-Token": csrfToken,
                        "Accept": "application/json, text/javascript; q=0.01"
                    },
                    credentials: "same-origin",
                    body: formData.toString()
                });
                if (!response.ok) {
                    throw new Error(`Failed to flag post ${postId}: ${response.statusText}`)
                }
                const data = await response.json();
                console.log("Flagged post", postId, data)
            } catch (err) {
                console.error("Flag error:", err)
            }
        }
        function onMessage(event) {
            if (!event.data || !event.data.action) {
                return
            }
            if (event.data.action === 'flagConfirmed') {
                const postIds = spamPosts.map(p => p.querySelector('article[data-post-id]')
                                              ?.dataset.postId).filter(Boolean);
                (async() => {
                    for (const pid of postIds) {
                        await flagPostById(pid)
                    }
                    cleanStyles();
                    const confiredModalHTML = `
  <div class="modal-container dextra-flagspam-modal">
    <div class="modal d-modal create-invite-modal" aria-modal="true" role="dialog">
      <div class="d-modal__container">
        <div class="d-modal__header">
          <div class="d-modal__title">
            <h1 class="d-modal__title-text">Flag Spam Posts</h1>
          </div>
          <button class="btn no-text btn-icon btn-transparent modal-close dextra-nonohailnah" title="close" type="button">
            <svg class="fa d-icon d-icon-xmark svg-icon svg-string" xmlns="http://www.w3.org/2000/svg">
              <use href="#xmark"></use>
            </svg>
          </button>
        </div>
        <div class="d-modal__body">
          <p>Flagged all posts!</p>
        </div>
        <div class="d-modal__footer">
          <button class="btn btn-text btn-primary dextra-nonono" type="button">
            <span class="d-button-label">Nice</span>
          </button>
        </div>
      </div>
    </div>
    <div class="d-modal__backdrop"></div>
  </div>
  `;
                    const droot = document.querySelector(".discourse-root") || document.body;
                    droot.insertAdjacentHTML("beforeend", confiredModalHTML);
                    document
                        .querySelector(".dextra-nonono")
                        .onclick = () => {
                        document.querySelector(".dextra-flagspam-modal")
                            ?.remove()
                    };
                    document
                        .querySelector(".dextra-nonohailnah")
                        .onclick = () => {
                        document.querySelector(".dextra-flagspam-modal")
                            ?.remove()
                    }
                })();
                window.removeEventListener('message', onMessage)
            }
            if (event.data.action === 'flagCancelled') {
                cleanStyles();
                const nonModalHTML = `
  <div class="modal-container dextra-flagspam-modal">
    <div class="modal d-modal create-invite-modal" aria-modal="true" role="dialog">
      <div class="d-modal__container">
        <div class="d-modal__header">
          <div class="d-modal__title">
            <h1 class="d-modal__title-text">Flag Spam Posts</h1>
          </div>
          <button class="btn no-text btn-icon btn-transparent modal-close dextra-nonohailnah" title="close" type="button">
            <svg class="fa d-icon d-icon-xmark svg-icon svg-string" xmlns="http://www.w3.org/2000/svg">
              <use href="#xmark"></use>
            </svg>
          </button>
        </div>
        <div class="d-modal__body">
          <p>Cancelled flagging</p>
        </div>
        <div class="d-modal__footer">
          <button class="btn btn-text btn-primary dextra-nonono" type="button">
            <span class="d-button-label">Nice</span>
          </button>
        </div>
      </div>
    </div>
    <div class="d-modal__backdrop"></div>
  </div>
  `;
                const droot = document.querySelector(".discourse-root") || document.body;
                droot.insertAdjacentHTML("beforeend", nonModalHTML);
                document
                    .querySelector(".dextra-nonono")
                    .onclick = () => {
                    document.querySelector(".dextra-flagspam-modal")
                        ?.remove()
                };
                document
                    .querySelector(".dextra-nonohailnah")
                    .onclick = () => {
                    document.querySelector(".dextra-flagspam-modal")
                        ?.remove()
                };
                window.removeEventListener('message', onMessage)
            }
        }
        window.addEventListener('message', onMessage)
    };
    return btn;
}
function dextraWireFlagSpamButton() {
    document.querySelectorAll('[data-identifier="notifications-tracking"]').forEach(trigger => {
        const parent = trigger.parentElement;
        if (!parent || parent.querySelector(".dextra-flagspam-btn")) return;
        const btn = dextraCreateFlagSpamButton();
        trigger.insertAdjacentElement("afterend", btn);
    });
}

// ===== Don't-bump warning: confirm before replying to a topic that's been dead a while =====
const DEXTRA_BUMP_WARN_DAYS = 14;
let dextraBumpConfirmed = false;
function dextraGetTopicLastActivityMs() {
    const times = document.querySelectorAll(".topic-post .relative-date[data-time]");
    if (!times.length) return null;
    const last = times[times.length - 1];
    const t = Number(last.getAttribute("data-time"));
    return t || null;
}
function dextraIsReplyingToExistingTopic() {
    // #reply-control itself carries a composer-action-* class telling you what mode
    // you're in (composer-action-reply vs. composer-action-createTopic, etc). Verified
    // against the live DOM — .reply-details never existed, which is why this never
    // fired before.
    const rc = document.querySelector("#reply-control");
    return !!rc && rc.classList.contains("composer-action-reply");
}
function dextraShowBumpWarning(days, btn) {
    if (document.querySelector(".dextra-bump-warning")) return;
    const modalHTML = `
<div class="modal-container dextra-bump-warning">
  <div class="modal d-modal create-invite-modal" aria-modal="true" role="dialog">
    <div class="d-modal__container">
      <div class="d-modal__header">
        <div class="d-modal__title"><h1 class="d-modal__title-text">Bump this topic?</h1></div>
      </div>
      <div class="d-modal__body"><p>This topic hasn't had a reply in ${days} days. Are you sure you want to bump it?</p></div>
      <div class="d-modal__footer">
        <button class="btn btn-text btn-primary dextra-bump-yes" type="button">Yes, post anyway</button>
        <button class="btn btn-text btn-transparent dextra-bump-no" type="button">Cancel</button>
      </div>
    </div>
  </div>
  <div class="d-modal__backdrop"></div>
</div>`;
    const droot = document.querySelector(".discourse-root") || document.body;
    droot.insertAdjacentHTML("beforeend", modalHTML);
    const modal = document.querySelector(".dextra-bump-warning");
    modal.querySelector(".dextra-bump-yes").onclick = () => {
        modal.remove();
        dextraBumpConfirmed = true;
        btn.click();
    };
    modal.querySelector(".dextra-bump-no").onclick = () => modal.remove();
}
function dextraWireBumpWarning() {
    document.querySelectorAll("#reply-control .btn.btn-primary.create").forEach(btn => {
        if (btn.dataset.dextraBumpWired) return;
        btn.dataset.dextraBumpWired = "true";
        btn.addEventListener("click", function (e) {
            if (dextraBumpConfirmed) {
                dextraBumpConfirmed = false;
                return;
            }
            if (!dextraIsReplyingToExistingTopic()) return;
            const lastMs = dextraGetTopicLastActivityMs();
            if (!lastMs) return;
            const days = Math.floor((Date.now() - lastMs) / 86400000);
            if (days < DEXTRA_BUMP_WARN_DAYS) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            dextraShowBumpWarning(days, btn);
        }, true);
    });
}

// ===== Block user (from their user card) =====
function dextraGetBlockedUsers() {
    return LStorage("dextraBlockedUsers", []);
}
function dextraSetBlockedUsers(list) {
    SetStorage("dextraBlockedUsers", list);
}
function dextraIsBlocked(username) {
    return dextraGetBlockedUsers().includes(username);
}
function dextraToggleBlockUser(username) {
    const list = dextraGetBlockedUsers();
    const idx = list.indexOf(username);
    const wasBlocked = idx >= 0;
    if (wasBlocked) {
        list.splice(idx, 1);
    } else {
        list.push(username);
    }
    dextraSetBlockedUsers(list);
    if (wasBlocked) {
        document.querySelectorAll(`.dextra-blocked-placeholder[data-dextra-blocked-placeholder="${CSS.escape(username)}"]`).forEach(placeholder => {
            const showBtn = placeholder.querySelector(".dextra-blocked-show");
            if (showBtn) showBtn.click();
        });
    }
}
function dextraGetPostAuthorUsername(postEl) {
    const names = postEl.querySelector(".names.trigger-user-card");
    if (!names) return null;
    const el = names.querySelector(".second") || names.querySelector(".first");
    return el ? el.textContent.trim() : null;
}
function dextraUpdatePlaceholderText(placeholder) {
    const count = placeholder.dataset.dextraBlockedCount;
    const username = placeholder.dataset.dextraBlockedPlaceholder;
    placeholder.querySelector(".dextra-blocked-show").textContent = `Show ${count} message${count === "1" ? "" : "s"} from blocked user @${username}`;
}
function dextraApplyBlockedUsers() {
    const blocked = dextraGetBlockedUsers();
    if (blocked.length === 0) return;
    const posts = Array.from(document.querySelectorAll(".topic-post"));
    posts.forEach(post => {
        if (post.dataset.dextraBlockedPlaceholder) return;
        if (post.dataset.dextraBlockedHidden === "true") return;
        const username = dextraGetPostAuthorUsername(post);
        if (!username || !blocked.includes(username)) return;
        post.style.display = "none";
        post.dataset.dextraBlockedHidden = "true";
        const prev = post.previousElementSibling;
        if (prev && prev.dataset && prev.dataset.dextraBlockedPlaceholder === username) {
            prev.dataset.dextraBlockedCount = String(Number(prev.dataset.dextraBlockedCount) + 1);
            dextraUpdatePlaceholderText(prev);
            return;
        }
        const placeholder = document.createElement("div");
        placeholder.className = "dextra-blocked-placeholder";
        placeholder.dataset.dextraBlockedPlaceholder = username;
        placeholder.dataset.dextraBlockedCount = "1";
        placeholder.innerHTML = `<button class="btn btn-flat dextra-blocked-show" type="button"></button>`;
        dextraUpdatePlaceholderText(placeholder);
        placeholder.querySelector(".dextra-blocked-show").onclick = () => {
            let node = placeholder.nextElementSibling;
            let count = Number(placeholder.dataset.dextraBlockedCount);
            while (node && count > 0 && node.dataset && node.dataset.dextraBlockedHidden === "true") {
                node.style.display = "";
                delete node.dataset.dextraBlockedHidden;
                count--;
                node = node.nextElementSibling;
            }
            placeholder.remove();
        };
        post.parentElement.insertBefore(placeholder, post);
    });
}
function dextraWireUserCardBlockButton() {
    document.querySelectorAll(".card-content").forEach(card => {
        if (card.querySelector(".dextra-block-btn")) return;
        const featured = card.querySelector(".featured-topic");
        if (!featured) return;
        const link = card.querySelector('a[href^="/u/"]');
        if (!link) return;
        const username = decodeURIComponent(link.getAttribute("href").split("/u/")[1].split("/")[0].split("?")[0]);
        if (!username) return;
        const btn = document.createElement("button");
        btn.className = "btn btn-default dextra-block-btn";
        btn.type = "button";
        const refresh = () => {
            btn.textContent = dextraIsBlocked(username) ? `Unblock @${username}` : `Block @${username}`;
        };
        refresh();
        btn.onclick = () => {
            dextraToggleBlockUser(username);
            refresh();
        };
        featured.insertAdjacentElement("afterend", btn);
    });
}

function doit(targetTextarea) {
    var droot = document.querySelector(".discourse-root");
    var html = `<div class="modal-container">


    <div class="modal d-modal create-invite-modal" data-keyboard="false" aria-modal="true" role="dialog" aria-labelledby="discourse-modal-title">
        <div class="d-modal__container">


            <div class="d-modal__header">


<!---->
                <div class="d-modal__title">
                  <h1 id="discourse-modal-title" class="d-modal__title-text">Encode Message</h1>

<!---->

                </div>




    <button class="btn no-text btn-icon btn-transparent modal-close dextra-hailnah2" title="close" type="button">
<svg class="fa d-icon d-icon-xmark svg-icon svg-string" xmlns="http://www.w3.org/2000/svg"><use href="#xmark"></use></svg>      <span aria-hidden="true">
          ​
        </span>
    </button>


                          </div>


<!---->


<!---->

          <div class="d-modal__body" tabindex="-1">

            <p>
              Copy text that will create a secret message.
            </p>
            <br>
            Text to be displayed
            <textarea class="dextra-yay" style="resize:none;"></textarea>
            <br>
            User to be sent to (set blank to be visible to everyone)
            <input type="text" class="dextra-useryay">

          </div>

            <div class="d-modal__footer">



    <button class="btn btn-text btn-primary dextra-lesgo" autofocus="true" type="button">
<!----><span class="d-button-label">Copy and close<!----></span>
    </button>




    <button class="btn btn-text btn-transparent dextra-hailnah" type="button">
<!----><span class="d-button-label">Cancel<!----></span>
    </button>



            </div>


        </div>
      </div>

        <div class="d-modal__backdrop"></div>
    </div>`;
    var ele = document.createElement("div");
    var key = "";
    ele.innerHTML = html;
    ele
        .querySelector(".dextra-lesgo")
        .onclick = function () {
        if (document.querySelector(".dextra-yay").value == "") {
            alert("gib me text");
            return
        }
        var val = document
        .querySelector(".dextra-yay")
        .value;
        if (document.querySelector(".dextra-useryay").value == "") {
            key = "discourse"
        } else {
            key = document
                .querySelector(".dextra-useryay")
                .value
        }
        var username = document
        .querySelector("img.avatar")
        .src
        .split("/")[6];
        var pmTag = "[pm]" + encodeObfuscated("dextrapm" + val, key) + "|:|" + encodeObfuscated("dextrapm" + val, username) + "[/pm]";
        if (targetTextarea) {
            var start = targetTextarea.selectionStart ?? targetTextarea.value.length;
            var end = targetTextarea.selectionEnd ?? targetTextarea.value.length;
            targetTextarea.value = targetTextarea.value.slice(0, start) + pmTag + targetTextarea.value.slice(end);
            targetTextarea.dispatchEvent(new Event("input", {bubbles: true}));
            targetTextarea.focus();
        } else {
            GM_setClipboard(pmTag);
        }
        ele.remove()
    };
    ele
        .querySelector(".dextra-hailnah")
        .onclick = function () {
        ele.remove()
    };
    ele
        .querySelector(".dextra-hailnah2")
        .onclick = function () {
        ele.remove()
    };
    droot.appendChild(ele)
}
async function waitForElement(selector, timeout = 5000) {
    const start = Date.now();

    while (true) {
        const el = document.querySelector(selector);
        if (el) return el;
        if (Date.now() - start > timeout) throw new Error(`Timeout waiting for ${selector}`);

        // wait a bit before checking again, so browser doesn’t freeze
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

waitForElement('#sidebar-section-content-community').then(elhasmentos => {
    dextraShowIntro();
    applyTheme();
    addButtons();
    watchAndApplyTheme();
    dextraWireThemeHeaderIcon();
    dextraRenderFavoritesSidebar();
    document
        .querySelectorAll('.cooked')
        .forEach(processCookedElement);
    dextraWireComposerPmShorthand();
    dextraWireComposerPmButton();
    dextraWireFlagSpamButton();
}).catch(err => {
    console.error('not found:', err);
});
