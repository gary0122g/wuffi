# Desktop privacy policy

wuffi's local editor and Local AI do not require a wuffi account. Documents are saved to locations you choose; recovery drafts and preferences are stored locally. This policy covers the open-source desktop application, not every service it can connect to.

## AI connections

When you send an AI request, selected text or document context and conversation history are sent to the selected AI service. Local AI uses the endpoint you configure. A localhost endpoint with a local model keeps inference on your computer; remote endpoints or cloud-backed models can transmit data elsewhere. Connection tests contact the configured endpoint.

wuffi Cloud is optional. Browser sign-in uses Google authentication through https://app.wuffi.app. The desktop exchanges a temporary device request for a session and requests membership/usage information. Cloud AI requests send writing context to the wuffi backend for processing by its configured AI provider. Desktop session credentials are held in memory until the app closes. Logging out stops desktop use of that session; selecting Local AI avoids sending subsequent AI requests to wuffi Cloud. Local editing remains available without login.

## Other network requests

- The installer may download Microsoft's WebView2 runtime when it is missing.
- Document conversion offers to download Pandoc from its official GitHub release on first use, with checksum verification. Once installed, conversion can run offline.
- Rendering externally hosted images in a document can contact their hosts, revealing ordinary connection information such as your IP address. Use local images for offline documents.
- Opening website links uses your browser and the destination site's policies.

Microsoft, GitHub, Google, and any AI service you select operate under their own privacy policies. See [Microsoft](https://privacy.microsoft.com/privacystatement), [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), and [Google](https://policies.google.com/privacy). Review the selected cloud service's terms before sending sensitive documents.

Do not post private documents or credentials in public issues. For questions about desktop behavior, use https://github.com/gary0122g/wuffi/issues without including sensitive information.
