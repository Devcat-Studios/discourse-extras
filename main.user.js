// ==UserScript==
// @name         Discourse Extras
// @namespace    devcat
// @version      2.4
// @description  More for viewing, less for writing.
// @author       Devcat Studios
// @match        https://x-camp.discourse.group/*
// @icon         https://d3bpeqsaub0i6y.cloudfront.net/user_avatar/meta.discourse.org/discourse/48/148734_2.png
// @grant       GM_setClipboard
// @grant       unsafeWindow
// @downloadURL  https://github.com/ethandacat/flask-hello-world/raw/refs/heads/main/api/world/d-extra/d-extra.user.js
// @updateURL    https://github.com/ethandacat/flask-hello-world/raw/refs/heads/main/api/world/d-extra/d-extra.user.js
// ==/UserScript==

var script = document.createElement("script");
script.src = "https://kit.fontawesome.com/fcc6f02ae0.js";
script.crossOrigin = "anonymous";
document.head.appendChild(script);


async function showRaw(postId) {
    const response = await fetch(`/posts/${postId}.json`);
    const data = await response.json();
    console.log(data.raw);
    return data.raw;
}
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
const rawbuttonhtml = `
<i class="fa-brands fa-markdown"></i>
<span aria-hidden="true">
        </span>
`


function doesFAIconExist(iconClass) {
    // Create temp element
    const el = document.createElement('i');
    el.className = `fa fa-${iconClass}`;
    el.style.position = 'absolute';
    el.style.visibility = 'hidden';
    document.body.appendChild(el);

    // Check computed style (content)
    const style = window.getComputedStyle(el, '::before');
    const content = style.getPropertyValue('content');

    document.body.removeChild(el);

    return content && content !== 'none' && content !== '""';
}

function encodeObfuscated(str, key) {
    let strBytes = new TextEncoder().encode(str);
    let keyBytes = new TextEncoder().encode(key);
    let encodedBytes = strBytes.map((b, i) => b ^ keyBytes[i % keyBytes.length]);
    let base64 = btoa(String.fromCharCode(...encodedBytes));
    return "XxH@" + base64.split("").reverse().join("") + "@HxX";
}

function decodeObfuscated(obfStr, key, triedFallback = false) {
    try {
        let cleaned = obfStr.replace(/^XxH@/, "").replace(/@HxX$/, "");
        let reversed = cleaned.split("").reverse().join("");
        let decodedStr = atob(reversed);
        let decodedBytes = new Uint8Array([...decodedStr].map(c => c.charCodeAt(0)));

        let keyBytes = new TextEncoder().encode(key);
        let originalBytes = decodedBytes.map((b, i) => b ^ keyBytes[i % keyBytes.length]);
        let cem = new TextDecoder().decode(originalBytes);

        if (!cem.startsWith("dextrapm")) {
            if (!triedFallback && key !== "discourse") {
                return decodeObfuscated(obfStr, "discourse", true);
            }
            return "[This message is NOT for you!]";
        }

        return cem.replace("dextrapm", "");
    } catch (e) {
        if (!triedFallback && key !== "discourse") {
            return decodeObfuscated(obfStr, "discourse", true);
        }
        return "[This message is NOT for you!]";
    }
}



function descCode(element) {
    while (element) {
        if (element.tagName && element.tagName.toLowerCase() === 'code') {
            return true;
        }
        element = element.parentElement;
    }
    return false;
}

function gText(element) {
    const avoid = /<*>/
    const regex = /!\{(.*?)\}/gs;
    const matches = [];
    const input = element.innerHTML;
    // Replace !{stuff} with an empty string and store the matches
    const cleanedText = input.replace(regex, (match, p1) => {
        var mna;
        const ql = p1.split("</p>").join("").split("<p>").join("").split(/[\n ]+/);;
        const cmd = ql[0];
        const arg = ql[1];
        console.log(cmd);
        const argt = ql.slice(2).join(" ");
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
                mna = `<iframe src="https://cdpn.io/${arg}/fullpage/${argt}?view=" frameborder="0" width="90%" height="600px" style="clip-path: inset(120px 0 0 0); margin-top: -120px;"></iframe>`;
                break;
            case "embed":
                var pw = `${arg} ${argt}`.replace("<a href=\"", "");
                mna = `<iframe rel="" style="width:900px;height:600px;" src="${pw}" frameborder="0"></iframe>`;
                break;
            case "mention":
                mna = `<a class='mention'>${arg} ${argt}</a>`;
                break;
            case "pm":
                try {
                    var username = document.querySelector("img.avatar").src.split("/")[6];
                    var argspl = arg.split("|:|")
                    var arg1 = decodeObfuscated(argspl[0], username)
                    var arg2 = decodeObfuscated(argspl[1], username)
                    if (arg1 == "[This message is NOT for you!]" && arg2 == "[This message is NOT for you!]") {
                        mna = `<blockquote>[This message is NOT for you!]</blockquote>`;
                        break;
                    }
                    else if (arg1 == "[This message is NOT for you!]") {
                        mna = `<blockquote>${arg2}</blockquote>`
                        break;
                    }
                    mna = `<blockquote>${arg1}</blockquote>`;
                } catch {
                    mna = `<blockquote>Incorrectly formatted message</blockquote>`
                }
                break;
            case "html":
                mna = `<iframe srcdoc="${arg} ${argt}"></iframe>`
                break;
            case "emoji":
                if (argt != "") {
                    mna = `<i class="fa-${argt} fa-${arg}"></i>`;
                } else {
                    mna = `<i class="fa-solid fa-${arg}"></i>`;
                }
                break;
            default:
                mna = "<span style='color:red; background-color:yellow; padding:1px; margin:1px; border: 1px solid red; '>Invalid Discourse Extras Tag!</span>";
                break;

        }
        return mna; // Remove the matched pattern
    });

    return cleanedText.trim();
}

// Function to process .cooked elements
function processCookedElement(element, iscooked = false) {
    // call gText() and update element
    const result = gText(element);
    element.innerHTML = result;
    const fpo = element.parentElement;
    if (iscooked) {
        // Check if button already exists — prevent duplicates
        const place = fpo.querySelector(".post-menu-area .post-controls .actions");
        if (!place.querySelector(".dextra-md")) {
            var button = document.createElement("button");
            button.innerHTML = rawbuttonhtml;
            button.classList = "btn no-text btn-icon btn-flat dextra-md";

            button.onclick = function () {
                const postId = Number(fpo.parentElement.parentElement.parentElement.getAttribute('data-post-id'));
                var dialog = document.createElement("div");
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
                                    <span aria-hidden="true"></span>
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

            var editbutton = place.querySelector(".post-action-menu__show-more");
            place.insertBefore(button, editbutton);
        }
    }
}
setInterval(() => {
    document.querySelectorAll(".cooked").forEach(element => {
        processCookedElement(element, true);
    })
    document.querySelectorAll(".chat-message-text").forEach(element => {
        processCookedElement(element, false);
    })
    document.querySelectorAll(".d-editor-preview").forEach(element => {
        processCookedElement(element, false);
    })
}, 800)


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
    </div>`
    var ele = document.createElement("div");
    var key = "";
    ele.innerHTML = html;
    ele.querySelector(".dextra-lesgo").onclick = function () {
        if (document.querySelector(".dextra-yay").value == "") {
            alert("gib me text")
            return;
        }
        var val = document.querySelector(".dextra-yay").value;
        if (document.querySelector(".dextra-useryay").value == "") {
            key = "discourse";
        } else {
            key = document.querySelector(".dextra-useryay").value;
        }
        var username = document.querySelector("img.avatar").src.split("/")[6];
        GM_setClipboard("!{pm " + encodeObfuscated("dextrapm" + val, key) + "|:|" + encodeObfuscated("dextrapm" + val, username) + "}");
        ele.remove();
    }
    ele.querySelector(".dextra-hailnah").onclick = function () { ele.remove() }
    ele.querySelector(".dextra-hailnah2").onclick = function () { ele.remove() }
    droot.appendChild(ele);
}

setTimeout(function () {
    const bcode = `
          <a id="ember5" class="ember-view sidebar-section-link sidebar-row" title="All topics" data-link-name="dextra" href="javascript:void(0)">
      <span class="sidebar-section-link-prefix icon">
          <svg class="fa d-icon d-icon-layer-group svg-icon prefix-icon svg-string" xmlns="http://www.w3.org/2000/svg"><use href="#code"></use></svg>
</span>
            <span class="sidebar-section-link-content-text">
              Encode Message
            </span>
</a>
`
    var ab = document.createElement("li");
    ab.classList = "sidebar-section-link-wrapper"
    ab.innerHTML = bcode;
    ab.onclick = doit;
    document.querySelector("#sidebar-section-content-community").appendChild(ab);
    document.querySelectorAll('.cooked').forEach(processCookedElement);
}, 1000);

(function () {
    'use strict';

    const spamRegex = /This is the spam/i;

    const btn = document.createElement('button');
    btn.innerHTML = `<span class="sidebar-section-link-prefix icon"><svg class="fa d-icon svg-icon svg-string" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><use href="#flag"></use></svg></span><span class="sidebar-section-link-content-text">Flag Spam Posts</span>`;
    btn.className = "fk-d-menu__trigger sidebar-more-section-trigger sidebar-section-link sidebar-more-section-links-details-summary sidebar-row --link-button sidebar-section-link sidebar-row";
    btn.style.margin = "10px";

    btn.onclick = () => {
        const posts = document.querySelectorAll('.topic-post');
        const spamPosts = [];

        posts.forEach(post => {
            const cooked = post.querySelector('.cooked');
            if (!cooked) return;
            if (spamRegex.test(cooked.innerText || "")) {
                spamPosts.push(post);
                cooked.style.border = "2px solid red";
                cooked.style.padding = "5px";
                cooked.style.borderRadius = "4px";
            }
        });

        if (spamPosts.length === 0) {
            alert("No spam posts found.");
            return;
        }

        const popup = window.open("", "FlagSpamPopup", "width=350,height=200");
        if (!popup) {
            alert("Popup blocked! Please allow popups.");
            return;
        }

        popup.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Flag Spam Posts</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                button { margin: 10px; padding: 10px 20px; font-size: 16px; cursor: pointer; }
              </style>
            </head>
            <body>
              <p>Found ${spamPosts.length} spam posts. Is this okay?</p>
              <button id="yesBtn" style="background-color:#d9534f; color:white;">Yes, flag them</button>
              <button id="noBtn" style="background-color:#6c757d; color:white;">No, cancel</button>
            </body>
            </html>
        `);
        popup.document.close();

        const script = popup.document.createElement('script');
        script.textContent = `
            document.getElementById('yesBtn').onclick = () => {
                window.opener.postMessage({ action: 'flagConfirmed' }, '*');
                window.close();
            };
            document.getElementById('noBtn').onclick = () => {
                window.opener.postMessage({ action: 'flagCancelled' }, '*');
                window.close();
            };
        `;
        popup.document.body.appendChild(script);

        function cleanStyles() {
            spamPosts.forEach(post => {
                const cooked = post.querySelector('.cooked');
                if (cooked) {
                    cooked.style.border = "";
                    cooked.style.padding = "";
                    cooked.style.borderRadius = "";
                }
            });
        }

        async function flagPostById(postId) {
            try {
                const csrfToken = document.querySelector("meta[name='csrf-token']")?.content;
                if (!csrfToken) {
                    console.error("CSRF token not found.");
                    return;
                }

                const formData = new URLSearchParams();
                formData.append("id", postId);
                formData.append("post_action_type_id", "8");
                formData.append("flag_topic", "false");
                //formData.append("message", "Flagged as spam by script.");

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
                    throw new Error(`Failed to flag post ${postId}: ${response.statusText}`);
                }

                const data = await response.json();
                console.log("Flagged post", postId, data);
            } catch (err) {
                console.error("Flag error:", err);
            }
        }

        function onMessage(event) {
            if (!event.data || !event.data.action) return;

            if (event.data.action === 'flagConfirmed') {
                const postIds = spamPosts
                    .map(p => p.querySelector('article[data-post-id]')?.dataset.postId)
                    .filter(Boolean);

                (async () => {
                    for (const pid of postIds) {
                        await flagPostById(pid);
                    }
                    cleanStyles();
                    alert("Flagged all spam posts.");
                })();

                window.removeEventListener('message', onMessage);
            }

            if (event.data.action === 'flagCancelled') {
                cleanStyles();
                alert("Cancelled flagging.");
                window.removeEventListener('message', onMessage);
            }
        }

        window.addEventListener('message', onMessage);
    };

    // Add the button to the sidebar
    const sidebar = document.querySelector('#sidebar-section-content-community');
    if (sidebar) {
        const wrapper = document.createElement('li');
        wrapper.className = "sidebar-section-link-wrapper";
        wrapper.appendChild(btn);
        sidebar.appendChild(wrapper);
    } else {
        console.warn("Sidebar not found, cannot insert Flag Spam button.");
    }

})();
