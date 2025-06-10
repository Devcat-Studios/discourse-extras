# Discourse Extras

A userscript to extend Discourse post rendering with extra visual and secret-message features.  
**More for viewing, less for writing.**

---

## Features

- !{emoji square-check} Custom markdown tags like `!​{color red}`, `!​{style ...}`, `!​{embed}`, etc.
- !{emoji gear} Obfuscated private messages with per-user visibility
- !{emoji palette} Inline styling for posts (color, background, font size)
- !{emoji flask} Auto-injected message encoding modal
- !{emoji thumbtack} Mutation observer for live content injection in `.cooked` and `.chat-message-text`

---

## !{emoji screwdriver-wrench} Installation

Install with a userscript manager like **Violentmonkey** or **Tampermonkey**:

- [Direct install link](https://github.com/Devcat-Studios/discourse-extras/raw/refs/heads/main/main.user.js)

---

## !{emoji star} Custom Tags

These work inside posts, chat, and the editor preview in Discourse:

|Tag | Usage Example | Result|
|--- | --- | ---|
|`!​{phantom}` | Hidden content | *(renders nothing)*|
|`!​{bgc red}` | Background color | `red` background span|
|`!​{color blue}` | Text color | Blue-colored span|
|`!​{style color:red}` | Custom inline style | Any style applied via span|
|`!​{size 24}` | Font size | `24px` font-size span|
|`!​{codepen examplePerson project}` | Embed CodePen project | Loads the CodePen project by examplePerson with ID project.|
|`!​{embed <link>}` | Embed external link | Loads iframe preview|
|`!​{mention @bob}` | Mention someone without giving notifications. | `<a class='mention'>@bob</a>`|
|`!​{pm ...}` | Private message (obfuscated) | Only visible to targeted user|
|`!​{s}` | Close span | Ends the current style span|
|`!​{html} <h1>v2.2 out now!</h1>` | Render custom HTML | `<h1>v2.2 out now!</h1>`|
|`!{emoji twitter brands}` | Render icons from FontAwesome. By default, the kit is `fa-solid`. | Shows the twitter logo.|

---

## !{emoji desktop} Raw Button
The raw button is a button that will show the **raw markdown/contents** of a post.
![image|690x114](upload://jC3vzX0Anmsxsbnca8d6QXlXFSR.png)


---

## !{emoji lock} Obfuscated PMs

You can encode a private message that will only decode for a specific username.

### How to create:
1. Click **"Encode Message"** in the Discourse sidebar (after loading the script).
2. Type the visible message and the **username** (leave blank for public view).
3. Click **Copy and Close** — a `!​{pm ...}` tag is copied to clipboard.

### Decryption:
Only the target user can see the message. Others will get `[This message is NOT for you!]`.

---

## !{emoji spinner} Technical Notes

- Tags are processed using regex inside `.innerHTML` (with some injection sanitization).
- MutationObserver handles dynamic posts/chats.
- Uses XOR + reversed Base64 for encoding PMs.
- Only handles elements within `.cooked` and `.chat-message-text`.

---

## !{emoji keyboard} Author

**@e**
Credits to:
@i for the great UI and username detector code
@Ivan_Zong for some great ideas
ChatGPT - for writing 90% of the code

---

# License

[CAT License](https://github.com/ethandacat/discourse-extras/blob/main/LICENSE.MD) © ethandacat

---

# Bonus: check if you have Discourse Extras installed
If you have it installed, you should see Hello World here.

!{pm XxH@==AAJEQHC8EDfUQAt4hAU0xFLwAA@HxX}
