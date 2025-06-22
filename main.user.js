// ==UserScript==
// @name         Discourse Extras
// @namespace    devcat
// @version      3.1
// @description  More for viewing, less for writing.
// @author       Devcat Studios
// @match        https://x-camp.discourse.group/*
// @icon         https://d3bpeqsaub0i6y.cloudfront.net/user_avatar/meta.discourse.org/discourse/48/148734_2.png
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        unsafeWindow
// @grant        GM_info
// ==/UserScript==

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


function getTitles(users) {
  return fetch('https://ethan-codes.com/discourse-extras-theme/titles/?users=' + encodeURIComponent(users.join(',')))
    .then(res => res.json());
}
function setTitle(username, title) {
  return fetch('https://ethan-codes.com/discourse-extras-theme/titles/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, title })
  }).then(res => res.json());
}
function deleteTitle(username) {
  return fetch('https://ethan-codes.com/discourse-extras-theme/titles/', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  }).then(res => res.json());
}

let iDid = false;
function titleStuff() {
  if (window.location.href.includes("/u/") && window.location.href.endsWith("/preferences/account") && !iDid) {
    iDid = true;
    var combobox = document.querySelector(".select-kit.single-select.combobox.combo-box").parentElement;
    combobox.innerHTML = `
      <input placeholder="" maxlength="255" class="ember-text-field input-xxlarge ember-view" type="text" id="dextra-title-input">
    `;
    var username = getTextBetweenDashes(document.querySelector(".avatar").src);

    getTitles([username]).then(titles => {
      combobox.querySelector("#dextra-title-input").value = titles[username] || "";
      var savebutton = document.querySelector(".save-changes");
      savebutton.onclick = function() {
          setTitle(username, combobox.querySelector("#dextra-title-input").value);
      }
    }).catch(err => {
      console.error("Failed to get titles:", err);
    });
  }else{
      if (!(window.location.href.includes("/u/") && window.location.href.endsWith("/preferences/account"))) {
          iDid = false;
      }
  }
}


const titleCache = {};
const pendingUsernames = new Set();
const usernameToElements = new Map();
let batchTimeout = null;

function applyTitle(el) {
  const names = el.parentElement.parentElement.querySelector(".names.trigger-user-card");
  if (!names) return;

  let usernameEl = names.querySelector(".second") || names.querySelector(".first");
  if (!usernameEl) return;

  const username = usernameEl.textContent.trim();
  if (!username) return;

  let titleEl = names.querySelector(".user-title");
  if (!titleEl) {
    titleEl = document.createElement("span");
    titleEl.className = "user-title";
    names.appendChild(titleEl);
  }

  // if cached, apply (even if empty string)
  if (titleCache.hasOwnProperty(username)) {
    if (titleCache[username]) titleEl.textContent = titleCache[username];
    return;
  }

  // map username -> elements (can be multiple)
  if (!usernameToElements.has(username)) {
    usernameToElements.set(username, []);
  }
  usernameToElements.get(username).push(titleEl);

  // add username to pending batch set
  pendingUsernames.add(username);

  // debounce batch fetch
  if (!batchTimeout) {
    batchTimeout = setTimeout(() => {
      const usersToFetch = Array.from(pendingUsernames);
      pendingUsernames.clear();
      batchTimeout = null;

      getTitles(usersToFetch).then(titles => {
        usersToFetch.forEach(user => {
          const newTitle = titles[user] || "";
          const elements = usernameToElements.get(user) || [];

          if (newTitle) {
            titleCache[user] = newTitle;
            elements.forEach(el => {
              el.textContent = newTitle;
            });
          } else {
            titleCache[user] = ""; // cache the blank title so we don't refetch
            // don't overwrite existing el.textContent
          }

          usernameToElements.delete(user);
        });
      });
    }, 50);
  }
}


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
                    colors[key] = LStorage(key, themeKeys[key])
                });
            document
                .body
                .removeChild(container);
            resolve({id, name, description, user, colors})
        };
        document
            .body
            .appendChild(container);
        idInput.focus()
    })
}
function openMarketplace() {
    if (document.querySelector("#theme-marketplace-popup")) {
        return
    }
    const mkplace = document.createElement("div");
    mkplace.id = "theme-marketplace-popup";
    mkplace.innerHTML = `
    <header style="padding:20px; background-color:var(--primary); color:var(--secondary); display:flex;">
      <i class="fa-solid fa-xmark close-mkplace" style="cursor:pointer;"></i>
      <div style="margin:auto;">Theme Marketplace</div>
    </header>
    <div id="marketplace-content" style="padding:20px;"></div>
    <footer style="padding:20px; border-top:1px solid #ccc; background:#f8f8f8; position:fixed; bottom:0; width:100%; display: flex;">
      <button id="upload-current-theme" class="btn btn-primary">Upload Current Theme</button>
    </footer>
  `;
    Object.assign(mkplace.style, {
        zIndex: "1001",
        width: "100vw",
        height: "100vh",
        position: "fixed",
        top: "0",
        left: "0",
        backgroundColor: "var(--header_background)",
        overflowY: "auto"
    });
    mkplace
        .querySelector(".close-mkplace")
        .onclick = () => mkplace.remove();
    document
        .body
        .appendChild(mkplace);
    getScripts().then(scripts => {
        const content = mkplace.querySelector("#marketplace-content");
        if (!Array.isArray(scripts)) {
            content.innerHTML = "<p>Failed to load themes.</p>";
            return
        }
        scripts.sort((a, b) => a.name.localeCompare(b.name));
        scripts.forEach(script => {
            const box = document.createElement("div");
            box.style.border = "1px solid #ccc";
            box.style.margin = "10px 0";
            box.style.padding = "10px";
            box.style.background = "var(--secondary);";
            box.style.borderRadius = "6px";
            box.innerHTML = `
        <div><b>${script.name || "Unnamed Theme"}</b> <i style="color:var(--primary-high);">${script.id}</i></div>
        <div><i style="color:var(--primary-high); font-size:.8em;">by <a class='mention'>@${script.user || "unknown"}</a></i></div>
        <div style="margin: 5px 0; font-size:90%">${script.description || "No description"}</div>
        <button style="margin-top:5px;" class="apply-theme btn btn-primary">Apply</button>
      `;
            box
                .querySelector(".apply-theme")
                .onclick = () => {
                if (script.colors) {
                    Object
                        .entries(script.colors)
                        .forEach(([key, val]) => {
                            console.log(key, val);
                            SetStorage(key, val)
                        });
                    applyTheme()
                    location.reload();
                } else {
                    console.log(script)
                }
            };
            content.appendChild(box)
        })
    }).catch(err => {
        const content = mkplace.querySelector("#marketplace-content");
        content.innerHTML = "<p>Error loading themes.</p>";
        console.error(err)
    });
    mkplace
        .querySelector("#upload-current-theme")
        .onclick = () => {
        getCurrentThemeObject().then((themeObj) => addScript(themeObj).then(() => alert("Theme uploaded!")).catch(console.error))
    }
}
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

function applyTheme() {
    document
        .documentElement
        .style
        .setProperty('--primary', LStorage("sPrimary", "#000000"));
    document
        .documentElement
        .style
        .setProperty('--primary-high', LStorage("sPrimaryHigh", "#111111"));
    document
        .documentElement
        .style
        .setProperty('--primary-medium', LStorage("sPrimaryMedium", "#101010"));
    document
        .documentElement
        .style
        .setProperty('--primary-low', LStorage("sPrimaryLow", "#fefefe"));
    document
        .documentElement
        .style
        .setProperty('--secondary', LStorage("sBG", "#ffffff"));
    document
        .documentElement
        .style
        .setProperty('--secondary-rgb', hexToRgbString(LStorage("sBG", "#ffffff")));
    document
        .documentElement
        .style
        .setProperty('--primary-rgb', LStorage("sBorder", "#555555"));
    document
        .documentElement
        .style
        .setProperty('--d-sidebar-active-background', LStorage("sHighlight", "#eeeeff"));
    document
        .documentElement
        .style
        .setProperty('--tertiary', LStorage("sAccent", "#000000"));
    document
        .documentElement
        .style
        .setProperty('--tertiary-low', LStorage("sAccentLow", "#ffffff"));
    document
        .documentElement
        .style
        .setProperty('--tertiary-med-or-tertiary', LStorage("sAccentLow", "#0f0f0f"));
    document
        .documentElement
        .style
        .setProperty('--header_background', LStorage("sBG", "#0f0f0f"));
    document
        .documentElement
        .style
        .setProperty('--tertiary-50', LStorage("sAccentLow", "#0f0f0f"));
    document
        .documentElement
        .style
        .setProperty('--tertiary-hover', LStorage("sAccent", "0"));
    document
        .documentElement
        .style
        .setProperty('--primary-very-low', LStorage("sBG", "0"));
    const logo = document.querySelector(".logo-big");
    if (logo) {
        logo.src = "https://us1.discourse-cdn.com/flex020/uploads/x_camp/original/1X/2cfa84d1826975a" +
                "c3ea4973b91923be11dc36dd1.png"
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
    const marketplace = document.createElement("button");
    marketplace.classList = "btn btn-primary";
    marketplace.textContent = "Theme Marketplace";
    marketplace.onclick = () => {
        openMarketplace()
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
    panel.appendChild(marketplace);
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
            input.value = LStorage(key, def);
            input.addEventListener("input", () => {
                SetStorage(key, input.value);
                applyTheme()
            });
            row.appendChild(label);
            row.appendChild(input);
            pickerBox.appendChild(row)
        });
    panel.appendChild(pickerBox);
    document
        .body
        .appendChild(panel);
    const toggleButton = document.createElement("li");
    toggleButton.classList = "sidebar-section-link-wrapper";
    toggleButton.innerHTML = `          <a id="ember5" class="ember-view sidebar-section-link sidebar-row" title="All topics" data-link-name="dextra" href="javascript:void(0)">
      <span class="sidebar-section-link-prefix icon">
          <svg class="fa d-icon d-icon-layer-group svg-icon prefix-icon svg-string" xmlns="http://www.w3.org/2000/svg"><use href="#palette"></use></svg>
</span>
            <span class="sidebar-section-link-content-text">
              Theme Changer
            </span>
</a>`;
    toggleButton.onclick = () => {
        if (panel.style.display === "none") {
            panel.style.display = "block"
        } else {
            panel.style.display = "none"
        }
    };
    document
        .querySelector("#sidebar-section-content-community")
        .appendChild(toggleButton)
}
function watchAndApplyTheme() {
    let last = JSON.stringify(Object.fromEntries(Object.keys(themeKeys).map(k => [
        k,
        LStorage(k, themeKeys[k])
    ])));
    setInterval(() => {
        const now = JSON.stringify(Object.fromEntries(Object.keys(themeKeys).map(k => [
            k,
            LStorage(k, themeKeys[k])
        ])));
        if (now !== last) {
            applyTheme();
            last = now
        }
    }, 1000)
}
const API_URL = 'https://ethan-codes.com/discourse-extras-theme/';
async function getScripts() {
    const res = await fetch(API_URL);
    if (!res.ok) {
        throw new Error('Failed to fetch scripts')
    }
    return await res.json()
}
async function addScript(scriptObj) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(scriptObj)
    });
    if (!res.ok) {
        throw new Error('Failed to add script')
    }
    return await res.json()
}
GM_addStyle(`
  .mfp-bg {
    background: rgba(0, 0, 0, 0.8) !important;
  }
  .c-navbar-container {
      z-index:10000;
  }
`);
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
function setupMFP(element) {
    const $ = unsafeWindow.jQuery;
    const imgs = $(element).find('img');
    const items = imgs.map((_, img) => ({src: img.src})).get();
    imgs.each(function (i) {
        $(this)
            .on('click', function (e) {
                e.preventDefault();
                $
                    .magnificPopup
                    .open({
                        items,
                        gallery: {
                            enabled: true
                        },
                        type: 'image',
                        mainClass: 'mfp-with-zoom',
                        closeOnContentClick: true,
                        image: {
                            verticalFit: true
                        },
                        index: i
                    })
            })
    })
}
function parseDiscourseExtras(text) {
    const regex = /!\{((?:\\\}|[^}])*)\}/gs;
    let lastIndex = 0;
    const frag = document.createDocumentFragment();
    let match;

    while ((match = regex.exec(text)) !== null) {
        const before = text.slice(lastIndex, match.index);
        if (before) frag.appendChild(document.createTextNode(before));

        const p1 = match[1];
        const ql = p1
            .split("</p>").join("")
            .split("<p>").join("")
            .split(/[\n ]+/);
        const cmd = ql[0];
        const arg = ql[1];
        const argt = ql.slice(2).join(" ");
        let mna = "";

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
                mna = `</span>`;
                break;
            case "size":
                mna = `<span style="font-size:${arg}px;">`;
                break;
            case "codepen":
                mna = `<iframe src="https://cdpn.io/${arg}/fullpage/${argt}?view=" frameborder="0" width="90%" height="600px" style="clip-path: inset(120px 0 0 0); margin-top: -120px;"></iframe>`;
                break;
            case "embed": {
                const pw = `${arg} ${argt}`.replace("<a href=\"", "");
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
                        mna = `<blockquote>${arg1}</blockquote>`;
                    } else if (arg1 === "[This message is NOT for you!]") {
                        mna = `<blockquote>${arg2}</blockquote>`;
                    } else {
                        mna = `<blockquote>${arg1}</blockquote>`;
                    }
                } catch {
                    mna = `<blockquote>Incorrectly formatted message</blockquote>`;
                }
                break;
            case "html": {
                const htmlContent = p1.slice(cmd.length).trim();
                const safeContent = htmlContent.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
                mna = `<iframe srcdoc='${safeContent}'></iframe>`;
                break;
            }
            case "emoji":
                mna = argt
                    ? `<i class="fa-${argt} fa-${arg}"></i>`
                    : `<i class="fa-solid fa-${arg}"></i>`;
                break;
            default:
                mna = `<span style='color:red; background-color:yellow; padding:1px; margin:1px; border: 1px solid red;'>Invalid Discourse Extras Tag!</span>`;
                break;
        }

        const temp = document.createElement("div");
        temp.innerHTML = mna;
        for (const node of Array.from(temp.childNodes)) {
            frag.appendChild(node);
        }

        lastIndex = regex.lastIndex;
    }

    const rest = text.slice(lastIndex);
    if (rest) frag.appendChild(document.createTextNode(rest));

    return frag;
}

function walkAndReplace(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.includes("!{")) {
            const frag = parseDiscourseExtras(node.textContent);
            node.replaceWith(frag);
        }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const child of Array.from(node.childNodes)) {
            walkAndReplace(child);
        }
    }
}

function processCookedElement(element, iscooked = false) {
    walkAndReplace(element);
    setupMFP(element);
    if (iscooked) applyTitle(element);
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
    titleStuff();
}, 800);
function doit() {
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
        GM_setClipboard("!{pm " + encodeObfuscated("dextrapm" + val, key) + "|:|" + encodeObfuscated("dextrapm" + val, username) + "}");
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
    SetStorage("sHighlight", "#ffffff");
    applyTheme();
    addButtons();
    watchAndApplyTheme();
    const bcode = `
          <a id="ember5" class="ember-view sidebar-section-link sidebar-row" title="All topics" data-link-name="dextra" href="javascript:void(0)">
      <span class="sidebar-section-link-prefix icon">
          <svg class="fa d-icon d-icon-layer-group svg-icon prefix-icon svg-string" xmlns="http://www.w3.org/2000/svg"><use href="#code"></use></svg>
</span>
            <span class="sidebar-section-link-content-text">
              Encode Message
            </span>
</a>
`;
    var ab = document.createElement("li");
    ab.classList = "sidebar-section-link-wrapper";
    ab.innerHTML = bcode;
    ab.onclick = doit;
    document
        .querySelector("#sidebar-section-content-community")
        .appendChild(ab);
    document
        .querySelectorAll('.cooked')
        .forEach(processCookedElement);
    const spamRegex = /This is the spam/i;
    const btn = document.createElement('div');
    btn.innerHTML = `<a id="ember5" class="ember-view sidebar-section-link sidebar-row" title="All topics" data-link-name="dextra" href="javascript:void(0)"><span class="sidebar-section-link-prefix icon"><svg class="fa d-icon svg-icon svg-string" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><use href="#flag"></use></svg></span><span class="sidebar-section-link-content-text">Flag Spam Posts</span></a>`;
    btn.style.width = "100%";
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
    const sidebar = document.querySelector('#sidebar-section-content-community');
    if (sidebar) {
        const wrapper = document.createElement('li');
        wrapper.className = "sidebar-section-link-wrapper";
        wrapper.appendChild(btn);
        sidebar.appendChild(wrapper)
    } else {
        console.warn("Sidebar not found, cannot insert Flag Spam button.")
    }
}).catch(err => {
  console.error('not found:', err);
});
