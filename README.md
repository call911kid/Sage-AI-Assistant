# Sage AI

A basic web-based chat interface for the Fireworks AI API. It supports real-time text streaming using `gpt-oss-120b` and image generation using the `Playground v2` model.

## Technical Details

* **Stack:** HTML, CSS, and Vanilla JavaScript. No build tools or frameworks.
* **Typography:** Playfair Display for headings and Inter for body text.
* **Libraries:** Marked.js for Markdown rendering and Highlight.js for code syntax highlighting.
* **Persistence:** Chat history is stored locally in the browser via LocalStorage.
* **Security:** API keys are managed through a local `config.js` file that is excluded from version control.

## Setup Instructions

1. Duplicate `config.example.js` and rename the copy to `config.js`.
2. Add your Fireworks AI API key inside `config.js`.
3. Open `index.html` in any modern web browser or run it using a local development server.

---

## Development Methodology

This project was 100% vibe coded. I did not write a single line of code for this project myself.