const API_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
const API_KEY = window.CONFIG && window.CONFIG.API_KEY ? window.CONFIG.API_KEY : "";
const MODEL_NAME = "accounts/fireworks/models/gpt-oss-120b";
const STORAGE_KEY = 'sage_ai';

let allSessions = [];
let currentSessionId = null;
let isImageMode = false;

// DOM Elements
const sidebar = document.getElementById('sidebar');
const edgeToggleBtn = document.getElementById('edgeToggleBtn');
const newChatBtn = document.getElementById('newChatBtn');
const sessionList = document.getElementById('sessionList');
const messageHistory = document.getElementById('messageHistory');
const welcomeScreen = document.getElementById('welcomeScreen');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const submitBtn = document.getElementById('submitBtn');
const stopBtn = document.getElementById('stopBtn');
const imageModeToggle = document.getElementById('imageModeToggle');
const chatContainer = document.getElementById('chatContainer');
const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');

let currentAbortController = null;

// Scroll button visibility control
function checkScrollButtonVisibility() {
    const isScrollable = chatContainer.scrollHeight > chatContainer.clientHeight + 100;
    const distanceToBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;

    if (isScrollable && distanceToBottom > 150) {
        scrollToBottomBtn.classList.add('visible');
    } else {
        scrollToBottomBtn.classList.remove('visible');
    }
}
chatContainer.addEventListener('scroll', checkScrollButtonVisibility);

scrollToBottomBtn.addEventListener('click', () => {
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
});

stopBtn.addEventListener('click', () => {
    if (currentAbortController) {
        currentAbortController.abort();
    }
});

document.addEventListener('DOMContentLoaded', loadSessions);

function loadSessions() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            allSessions = JSON.parse(saved);
            allSessions.sort((a, b) => b.timestamp - a.timestamp);
        } catch (e) {
            console.error("Failed to parse local storage", e);
            allSessions = [];
        }
    }
    renderSessionList();
    if (allSessions.length > 0) { loadChat(allSessions[0].id); }
}

function saveSessions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allSessions));
}

function renderSessionList() {
    sessionList.innerHTML = '';
    allSessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'session-item';
        item.dataset.sessionId = session.id;
        if (session.id === currentSessionId) item.classList.add('active');

        const titleSpan = document.createElement('span');
        titleSpan.className = 'session-title';
        titleSpan.textContent = session.title;
        titleSpan.onclick = () => loadChat(session.id);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'session-delete-btn';
        deleteBtn.type = 'button';
        deleteBtn.title = 'Delete chat';
        deleteBtn.innerHTML = '<span aria-hidden="true">✕</span>';
        deleteBtn.onclick = (event) => {
            event.stopPropagation();
            deleteSession(session.id);
        };

        item.appendChild(titleSpan);
        item.appendChild(deleteBtn);
        sessionList.appendChild(item);
    });
}

function deleteSession(sessionId) {
    allSessions = allSessions.filter(s => s.id !== sessionId);
    if (currentSessionId === sessionId) {
        currentSessionId = null;
        messageHistory.innerHTML = '';
        welcomeScreen.style.display = 'flex';
    }
    saveSessions();
    renderSessionList();
}

function loadChat(sessionId) {
    if (currentSessionId && currentSessionId !== sessionId) {
        const prevSession = allSessions.find(s => s.id === currentSessionId);
        if (prevSession && prevSession.messages.length === 0) {
            prevSession.title = "New Chat";
            saveSessions();
        }
    }

    currentSessionId = sessionId;
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;

    welcomeScreen.style.display = 'none';
    messageHistory.innerHTML = '';
    renderSessionList();

    session.messages.forEach(msg => {
        const aiId = msg.role === 'assistant' ? `ai-msg-${Date.now()}-${Math.random()}` : '';
        const uiRole = msg.role === 'assistant' ? 'ai' : 'user';
        appendMessage(msg.role === 'user' ? msg.content : '...', uiRole, aiId, true);

        if (msg.role === 'assistant') {
            const bubble = document.getElementById(aiId);
            if (msg.type === 'image') {
                bubble.innerHTML = `<img src="${msg.content}" class="generated-image" />`;
            } else {
                bubble.innerHTML = formatTextAsHTML(msg.content);
                if (typeof hljs !== 'undefined') {
                    bubble.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
                }
                addCopyButtons(bubble);
            }
        }
    });
    scrollToBottom();
}

function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
}
edgeToggleBtn.addEventListener('click', toggleSidebar);

messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
    submitBtn.disabled = messageInput.value.trim() === '';
});

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!submitBtn.disabled) {
            chatForm.dispatchEvent(new Event('submit'));
        }
    }
});

newChatBtn.addEventListener('click', () => {
    currentSessionId = null;
    messageHistory.innerHTML = '';
    welcomeScreen.style.display = 'flex';
    renderSessionList();
});

if (imageModeToggle) {
    imageModeToggle.addEventListener('click', () => {
        isImageMode = !isImageMode;
        if (isImageMode) {
            imageModeToggle.classList.add('active');
            messageInput.placeholder = "Describe an image to generate...";
        } else {
            imageModeToggle.classList.remove('active');
            messageInput.placeholder = "Type a message...";
        }
    });
}

function getOrCreateSession() {
    if (currentSessionId) {
        const session = allSessions.find(s => s.id === currentSessionId);
        if (session) return session;
    }

    const newSession = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        title: 'New Chat',
        timestamp: Date.now(),
        messages: []
    };
    allSessions.unshift(newSession);
    currentSessionId = newSession.id;
    return newSession;
}

// --- Chat Submission Handler ---
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const userText = messageInput.value.trim();
    if (!userText) return;

    welcomeScreen.style.display = 'none';
    messageInput.value = '';
    messageInput.style.height = 'auto';
    submitBtn.disabled = true;
    submitBtn.style.display = 'none';
    stopBtn.style.display = 'flex';

    const session = getOrCreateSession();
    const isFirstTime = session.messages.length === 0;

    appendMessage(userText, 'user');
    session.messages.push({ role: 'user', type: 'text', content: userText });
    session.timestamp = Date.now();
    allSessions.sort((a, b) => b.timestamp - a.timestamp);
    saveSessions();
    renderSessionList();

    // Append AI placeholder
    const aiBubbleId = `ai-msg-${Date.now()}`;
    appendMessage('...', 'ai', aiBubbleId);
    const aiBubble = document.getElementById(aiBubbleId);
    const statusText = isImageMode ? 'Generating' : 'Typing';
    aiBubble.innerHTML = `<span class="typing-text">${statusText}</span><span class="typing-dots"></span>`;

    // Execute title generation asynchronously without blocking UI
    if (isFirstTime) {
        generateChatTitle(userText, session.id);
    }

    const apiMessages = session.messages
        .filter(m => m.type === 'text')
        .map(m => ({ role: m.role, content: m.content }));

    // --- Image Generation (if enabled) ---
    if (isImageMode) {
        try {
            currentAbortController = new AbortController();
            const response = await fetch('https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-dev-fp8/text_to_image', {
                method: 'POST',
                headers: {
                    'Accept': 'image/jpeg',
                    'Content-Type': 'application/json',
                    'Authorization': API_KEY
                },
                body: JSON.stringify({
                    aspect_ratio: "1:1",
                    guidance_scale: 3.5,
                    prompt: userText,
                    seed: 0
                }),
                signal: currentAbortController.signal
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const blob = await response.blob();

            // Convert to Base64 for localStorage
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result;
                aiBubble.innerHTML = `<img src="${base64data}" alt="Generated: ${userText}" class="generated-image" />`;
                session.messages.push({ role: 'assistant', type: 'image', content: base64data });
                session.timestamp = Date.now();
                allSessions.sort((a, b) => b.timestamp - a.timestamp);
                saveSessions();
                renderSessionList();
                scrollToBottom();
            };
            reader.readAsDataURL(blob);

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Image generation aborted by user.');
                if (aiBubble.querySelector('.typing-dots')) {
                    aiBubble.innerHTML = "<em>[Response interrupted by user]</em>";
                    aiBubble.style.color = "var(--text-secondary)";

                    const loadedSession = getSession(session.id);
                    if (loadedSession) {
                        loadedSession.messages.push({ role: 'assistant', type: 'text', content: "*[Response interrupted by user]*" });
                        saveSessions();
                        renderSessionList();
                    }
                }
            } else {
                console.error("Image generation error:", error);
                if (aiBubble.querySelector('.typing-dots')) {
                    aiBubble.innerHTML = `<span style="color: red;">Failed to generate image: ${error.message}</span>`;
                }
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.style.display = 'flex';
            stopBtn.style.display = 'none';
            currentAbortController = null;
            scrollToBottom();
        }

        return;
    }

    // --- Text Generation ---
    let aiResponseText = "";
    try {
        currentAbortController = new AbortController();
        const payload = {
            model: MODEL_NAME,
            stream: true,
            max_tokens: 16384,
            top_p: 1,
            top_k: 40,
            presence_penalty: 0,
            frequency_penalty: 0,
            temperature: 0.6,
            messages: apiMessages
        };
        const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
            method: "POST",
            headers: {
                "Accept": "text/event-stream",
                "Content-Type": "application/json",
                "Authorization": API_KEY // Use API_KEY constant
            },
            body: JSON.stringify(payload),
            signal: currentAbortController.signal
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Chat API Error: ${response.status} - ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, newlineIndex).trim();
                    buffer = buffer.slice(newlineIndex + 1);

                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        if (dataStr === '[DONE]') continue;

                        try {
                            const data = JSON.parse(dataStr);
                            const content = data?.choices?.[0]?.delta?.content
                                || data?.choices?.[0]?.message?.content
                                || data?.choices?.[0]?.text
                                || data?.result?.[0]?.content
                                || "";

                            if (content) {
                                if (aiResponseText === "") {
                                    aiBubble.innerHTML = "";
                                }
                                aiResponseText += content;
                                aiBubble.innerHTML = formatTextAsHTML(aiResponseText);
                                scrollToBottom();
                            }
                        } catch (err) {
                            console.error("Error parsing JSON chunk:", err, "Chunk:", dataStr);
                        }
                    }
                }
            }
        } catch (abortErr) {
            if (abortErr.name === 'AbortError') {
                console.log('Stream aborted by user.');
                if (aiResponseText === "") {
                    aiResponseText = "*[Response interrupted by user]*";
                } else {
                    aiResponseText += "\n\n*[Response interrupted by user]*";
                }
                aiBubble.innerHTML = formatTextAsHTML(aiResponseText);
            } else {
                throw abortErr;
            }
        }

        if (buffer.trim() && buffer.startsWith('data: ')) {
            const dataStr = buffer.slice(6).trim();
            if (dataStr !== '[DONE]') {
                try {
                    const data = JSON.parse(dataStr);
                    const content = data?.choices?.[0]?.delta?.content
                        || data?.choices?.[0]?.message?.content
                        || data?.choices?.[0]?.text
                        || data?.result?.[0]?.content
                        || "";
                    if (content) {
                        if (aiResponseText === "") {
                            aiBubble.innerHTML = "";
                        }
                        aiResponseText += content;
                        aiBubble.innerHTML = formatTextAsHTML(aiResponseText);
                    }
                } catch (err) { }
            }
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Request aborted manually.');
            if (aiBubble.querySelector('.typing-dots')) {
                aiBubble.innerHTML = "<em>[Response interrupted by user]</em>";
                aiBubble.style.color = "var(--text-secondary)";
                aiResponseText = "*[Response interrupted by user]*";
            }
        } else {
            console.error("API Error:", error);
            if (aiBubble.querySelector('.typing-dots')) {
                aiBubble.innerHTML = "Oops! Something went wrong! Please try again.";
                aiBubble.style.color = "#d93025";
            }
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        currentAbortController = null;

        scrollToBottom();

        if (typeof hljs !== 'undefined') {
            aiBubble.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
            });
        }

        addCopyButtons(aiBubble);

        const currentSession = allSessions.find(s => s.id === currentSessionId);
        if (currentSession && aiResponseText) {
            currentSession.messages.push({ role: 'assistant', type: 'text', content: aiResponseText });
            currentSession.timestamp = Date.now();
            allSessions.sort((a, b) => b.timestamp - a.timestamp);
        }

        saveSessions();
        renderSessionList();
    }
});

function appendMessage(text, role, id = '', skipScroll = false) {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    if (id) bubble.id = id;

    if (role === 'user') {
        bubble.textContent = text;
    }

    wrapper.appendChild(bubble);
    messageHistory.appendChild(wrapper);
    if (!skipScroll) { scrollToBottom(); }
}

function scrollToBottom() {
    const container = document.getElementById('chatContainer');
    container.scrollTop = container.scrollHeight;

    if (typeof checkScrollButtonVisibility === 'function') {
        checkScrollButtonVisibility();
    }
}

function addCopyButtons(container) {
    const copySvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    const checkSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>';

    container.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.copy-code-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'copy-code-btn';
        btn.innerHTML = copySvg;

        btn.addEventListener('click', async () => {
            const codeBlock = pre.querySelector('code');
            if (!codeBlock) return;

            try {
                await navigator.clipboard.writeText(codeBlock.innerText);
                btn.innerHTML = checkSvg;
                btn.classList.add('copied');

                setTimeout(() => {
                    btn.innerHTML = copySvg;
                    btn.classList.remove('copied');
                }, 2000);
            } catch (err) {
                console.error("Failed to copy code", err);
            }
        });

        pre.appendChild(btn);
    });
}

function formatTextAsHTML(text) {
    if (typeof marked !== 'undefined') {
        let html = marked.parse(text);
        html = html.replace(/<table/g, '<div class="table-wrapper"><table');
        html = html.replace(/<\/table>/g, '</table></div>');
        return html;
    }

    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
}

async function generateChatTitle(firstMessage, sessionId) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': API_KEY
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                stream: false,
                max_tokens: 150, // Increased to allow reasoning model to finish
                messages: [
                    { role: 'system', content: 'You are a helpful assistant that summarizes a user message into a strictly concise 2 to 4 word title.' },
                    { role: 'user', content: `Generate a 2 to 4 word title summarizing this message without quotes or conversational filler: "${firstMessage}"` }
                ]
            })
        });

        if (response.ok) {
            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content
                || data?.choices?.[0]?.text
                || data?.result?.[0]?.content;

            if (content) {
                // Strips out <think> tags from the reasoning model and removes surrounding quotes
                const title = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().replace(/^["']|["']$/g, '');

                const session = allSessions.find(s => s.id === sessionId);
                if (session) {
                    session.title = title;
                    saveSessions();
                    renderSessionList();
                }
            }
        } else {
            console.error(`Title API Error: ${response.status} ${response.statusText}`);
        }
    } catch (e) {
        console.error("Title generation failed:", e);
    }
}