# wuffi

**A quiet place to write. A little companion when you need one.**

[Official website](https://wuffi.app/en/) · **English** · [繁體中文](README.zh-TW.md)

![wuffi writing companion](assets/brand/wuffi.png)

wuffi is a free, open-source Markdown desktop editor for notes, stories, and ideas that need room to grow. Keep your documents on your computer, switch between visual editing and Markdown, and invite an AI writing companion into the conversation whenever you want a second perspective.

Your words stay yours. AI suggestions are yours to accept or reject.

## Make yourself at home

- **Write your way.** Visual editing, Markdown source, split preview, an outline, and find and replace.
- **Stay with the thought.** Focus mode, typewriter mode, themes, and keyboard shortcuts.
- **Go beyond paragraphs.** Tables, code blocks, local images, formulas, and diagrams.
- **Keep your work close.** Local files, persistent drafts, workspace search, and save-conflict protection.
- **Take your writing elsewhere.** HTML and PDF export, printing, and document conversion with Pandoc, including Word and EPUB.
- **Think out loud.** Discuss ideas with your AI companion or review proposed edits one sentence at a time.
- **Bring a friend.** Choose a dog companion or use a photo of your own.

No account is required for desktop editing or Local AI. No trial countdown, activation key, or subscription unlocks.

## Download and install

[Download for Windows x64](https://github.com/gary0122g/wuffi/releases/tag/v1.0.0-rc.3)

Download `wuffi_1.0.0-rc.3_x64-setup.exe`, run the installer, then open **wuffi** from the Start menu. No Node.js, Rust, or compilation required. The installer downloads WebView2 if it is missing.

This installer is not digitally signed, so Windows may show an unknown-publisher notice. SHA-256 checksums are included with the download. Supports Windows 10/11 x64.

[Code signing policy](CODE_SIGNING.md) · [Desktop privacy policy](PRIVACY.md)

## Run from source

These instructions target **Windows x64**. Install Git, Node.js **22.13+**, Rust **1.88+** (MSVC), Visual Studio C++ Build Tools with the Windows SDK, and WebView2 Runtime.

```powershell
git clone https://github.com/gary0122g/wuffi.git
cd wuffi
npm ci --ignore-scripts
npm run dev
```

`npm run dev` builds and launches the local development app; `npm start` launches an existing debug build. You can also double-click `Start-Wuffi.cmd`, which installs dependencies on the first run. Use `npm run release` to build an installer.

Markdown files remain wherever you save them. Pandoc is downloaded with your confirmation when a conversion first needs it; after installation, those conversions work offline too.

## wuffi Cloud AI

Open **Settings → AI**, choose **wuffi Cloud AI**, and click **Sign in to wuffi**. Sign in in your browser, then click **Connect desktop**. The desktop app completes sign-in automatically—no code to copy. Your plan and allowance are shared with [wuffi on the web](https://app.wuffi.app/) and visible in the desktop panel.

Document context and conversation are sent only when you select Cloud AI and send a request. Credentials remain in memory until the app closes. An expired cloud plan never restricts local editing or Local AI.

## Set up Local AI

wuffi connects to a model service you run separately. It does not download or start a language model for you. With a downloaded local model and a running local server, you can use AI offline.

### Ollama

1. Install [Ollama](https://ollama.com/download) and keep it running.
2. Download a local model, for example:

   ```powershell
   ollama pull qwen2.5:7b
   ollama list
   ```

3. Open **Settings → AI** to edit the connection. The AI panel’s **⋯** button also opens this page.
4. Set **Base URL** to `http://127.0.0.1:11434/v1` and **Model** to `qwen2.5:7b` (or your downloaded model's exact name).
5. Save, test the connection, and send a short writing request.

If Ollama is not running, start it with `ollama serve`. See [Ollama's compatibility guide](https://docs.ollama.com/api/openai-compatibility).

### LM Studio

1. Install [LM Studio](https://lmstudio.ai/), download a chat/instruct model, and load it.
2. Start the local server in **Developer**. Keep it bound to your own computer. wuffi's connection form does not currently send API authentication tokens, so use a local server without required authentication.
3. In wuffi's AI connection settings, enter `http://127.0.0.1:1234/v1` (adjust the port if needed).
4. Copy the exact model identifier from LM Studio into **Model**, save, and test.

See [LM Studio's compatibility guide](https://lmstudio.ai/docs/developer/openai-compat). You can also inspect `http://127.0.0.1:1234/v1/models` for model IDs.

### Connection tips

| If you see… | Check… |
| --- | --- |
| Connection refused | The model service is running and its port matches the Base URL. |
| Model not found | The model name matches the service's `/v1/models` response. |
| Connected, but generation fails | The model/server supports chat completions and JSON output (`response_format: json_object`). A connection test alone does not test generation. |
| Very slow responses | Try a smaller model and a shorter passage; inference uses its own RAM/VRAM. |

The prefilled `http://127.0.0.1:8080/v1` and model name are editable defaults, not a bundled model. Replace both with your service's values. The URL should end in `/v1`, not `/chat/completions`.

AI requests include selected text or document context and conversation history. They go to the configured service when you send a request. To keep inference local, use a local model—not a cloud-backed model—with a localhost address.

## Made to be shared

wuffi's own code is available under the [MIT License](LICENSE). Use it, change it, and make it your own. Third-party components retain their respective licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md).

Have an idea or found something that gets in the way of writing? Open an [issue](https://github.com/gary0122g/wuffi/issues) or send a pull request. Start with the [contribution guide](CONTRIBUTING.md).
