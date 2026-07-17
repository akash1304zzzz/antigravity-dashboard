/* ============================================
   Antigravity 2.0 — Mobile Command Center
   Frontend Application Logic
   ============================================ */

(function () {
    'use strict';

    // --- State ---
    const state = {
        projects: [],
        conversations: [],
        currentView: 'dashboard',
        currentConversationId: null,
        currentProjectId: null,
        projectMap: {},
    };

    // --- Auth Header ---
    const AUTH_HEADER = 'Basic ' + btoa('admin:AntiGravity2025!');

    let socket = null;

    function initSocket() {
        if (socket) return;
        
        console.log('[Socket] Initializing connection...');
        socket = io({
            auth: {
                token: AUTH_HEADER
            },
            autoConnect: false
        });
        
        socket.on('connect', () => {
            console.log('[Socket] Connected to server');
            const liveInd = $('#live-indicator');
            if (liveInd) liveInd.style.display = 'inline-flex';
            
            if (state.currentConversationId) {
                socket.emit('subscribe', state.currentConversationId);
            }
        });
        
        socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
            const liveInd = $('#live-indicator');
            if (liveInd) liveInd.style.display = 'none';
        });
        
        socket.on('connect_error', (err) => {
            console.error('[Socket] Connection error:', err.message);
            const liveInd = $('#live-indicator');
            if (liveInd) liveInd.style.display = 'none';
        });
        
        socket.on('new-steps', (steps) => {
            console.log(`[Socket] Received ${steps.length} new steps`);
            appendNewSteps(steps);
        });
        
        socket.on('task-output', (data) => {
            console.log('[Socket] Task output:', data.taskId);
            handleTaskOutput(data.taskId, data.chunk);
        });
        
        socket.on('error-msg', (msg) => {
            showToast(msg, 'error');
        });
        
        socket.connect();
    }

    function showThinkingIndicator() {
        removeThinkingIndicator();
        
        const thinkingDiv = document.createElement('div');
        thinkingDiv.id = 'socket-thinking-indicator';
        thinkingDiv.className = 'processing-indicator';
        thinkingDiv.innerHTML = `
            <div class="splash-orbit" style="width: 14px; height: 14px;">
                <div class="orbit-core" style="width: 4px; height: 4px;"></div>
            </div>
            Antigravity is thinking…
        `;
        els.chatMessages.appendChild(thinkingDiv);
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }

    function removeThinkingIndicator() {
        const indicator = document.getElementById('socket-thinking-indicator');
        if (indicator) indicator.remove();
        document.querySelectorAll('.processing-indicator').forEach(el => el.remove());
    }

    // --- Sliding Terminal Controls ---
    let isTerminalExpanded = false;
    let currentActiveTaskId = null;

    function toggleTerminal(forceExpand = null) {
        const drawer = $('#terminal-drawer');
        if (!drawer) return;
        
        if (forceExpand !== null) {
            isTerminalExpanded = forceExpand;
        } else {
            isTerminalExpanded = !isTerminalExpanded;
        }
        
        drawer.classList.toggle('expanded', isTerminalExpanded);
        drawer.classList.toggle('collapsed', !isTerminalExpanded);
    }

    function handleTaskOutput(taskId, chunk) {
        const body = $('#terminal-body');
        const statusDot = $('.terminal-status-dot');
        const taskName = $('#terminal-task-name');
        
        if (!body) return;
        
        if (currentActiveTaskId !== taskId) {
            if (currentActiveTaskId !== null) {
                const sep = document.createElement('div');
                sep.className = 'terminal-line system-msg';
                sep.textContent = `--- Task ${taskId} started ---`;
                body.appendChild(sep);
            }
            currentActiveTaskId = taskId;
            toggleTerminal(true);
        }
        
        if (statusDot) {
            statusDot.classList.add('active');
            statusDot.classList.remove('idle');
        }
        if (taskName) {
            taskName.textContent = `Terminal: task-${taskId} (Running)`;
        }
        
        const helpLine = body.querySelector('.system-msg');
        if (helpLine && helpLine.textContent.includes('Live logs')) {
            helpLine.remove();
        }
        
        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.textContent = chunk;
        body.appendChild(line);
        body.scrollTop = body.scrollHeight;
    }

    function resetTerminalStatus(completed = true) {
        const statusDot = $('.terminal-status-dot');
        const taskName = $('#terminal-task-name');
        
        if (statusDot) {
            statusDot.classList.remove('active');
            statusDot.classList.add('idle');
        }
        if (taskName) {
            taskName.textContent = completed ? 'Terminal: Idle (Completed)' : 'Terminal: Idle';
        }
        currentActiveTaskId = null;
    }

    // --- API Helper ---
    async function api(endpoint, options = {}) {
        const url = `/api${endpoint}`;
        const res = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': AUTH_HEADER,
                ...(options.headers || {}),
            },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    // --- DOM Elements ---
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        splashScreen: $('#splash-screen'),
        app: $('#app'),
        sidebar: $('#sidebar'),
        sidebarOverlay: $('#sidebar-overlay'),
        menuBtn: $('#menu-btn'),
        sidebarCloseBtn: $('#sidebar-close-btn'),
        refreshBtn: $('#refresh-btn'),
        projectsList: $('#projects-list'),
        conversationsList: $('#conversations-list'),
        convoCount: $('#convo-count'),
        newConvoBtn: $('#new-convo-btn'),
        pageTitle: $('#page-title'),
        pageSubtitle: $('#page-subtitle'),
        dashboardView: $('#dashboard-view'),
        chatView: $('#chat-view'),
        chatMessages: $('#chat-messages'),
        messageInput: $('#message-input'),
        sendBtn: $('#send-btn'),
        totalProjects: $('#total-projects'),
        totalConversations: $('#total-conversations'),
        recentConversations: $('#recent-conversations'),
        projectsGrid: $('#projects-grid'),
        newConvoModal: $('#new-convo-modal'),
        modalCloseBtn: $('#modal-close-btn'),
        modalCancelBtn: $('#modal-cancel-btn'),
        modalSubmitBtn: $('#modal-submit-btn'),
        newConvoProject: $('#new-convo-project'),
        newConvoModel: $('#new-convo-model'),
        newConvoPrompt: $('#new-convo-prompt'),
        toastContainer: $('#toast-container'),
        addProjectBtn: $('#add-project-btn'),
        newProjectModal: $('#new-project-modal'),
        projectModalCloseBtn: $('#project-modal-close-btn'),
        projectModalCancelBtn: $('#project-modal-cancel-btn'),
        projectModalSubmitBtn: $('#project-modal-submit-btn'),
        newProjectName: $('#new-project-name'),
        newProjectCreateFolder: $('#new-project-create-folder'),
        newProjectPathGroup: $('#new-project-path-group'),
        newProjectPath: $('#new-project-path'),
        settingsBtn: $('#settings-btn'),
        settingsModal: $('#settings-modal'),
        settingsCloseBtn: $('#settings-close-btn'),
        settingsCancelBtn: $('#settings-cancel-btn'),
        settingsSaveBtn: $('#settings-save-btn'),
        settingsBotToken: $('#settings-bot-token'),
        settingsChatId: $('#settings-chat-id'),
        settingsDiscoverBtn: $('#settings-discover-btn'),
        settingsProjectsList: $('#settings-projects-list'),
        settingsTestBtn: $('#settings-test-btn'),
    };

    // --- Toast Notifications ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            info: 'ℹ',
        };

        toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
        els.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // --- Sidebar Toggle ---
    function openSidebar() {
        els.sidebar.classList.add('open');
        els.sidebarOverlay.classList.add('active');
    }

    function closeSidebar() {
        els.sidebar.classList.remove('open');
        els.sidebarOverlay.classList.remove('active');
    }

    // --- View Switching ---
    function switchView(view) {
        state.currentView = view;
        els.dashboardView.classList.toggle('active', view === 'dashboard');
        els.chatView.classList.toggle('active', view === 'chat');
    }

    // --- Time Formatting ---
    function formatTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function formatDateTime(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    // --- Clean Content ---
    function cleanContent(content) {
        if (!content) return '';
        // Remove XML-style tags
        let clean = content.replace(/<\/?USER_REQUEST>/g, '')
            .replace(/<\/?ADDITIONAL_METADATA>[\s\S]*?(<\/ADDITIONAL_METADATA>|$)/g, '')
            .replace(/<\/?USER_SETTINGS_CHANGE>[\s\S]*?(<\/USER_SETTINGS_CHANGE>|$)/g, '')
            .replace(/<\/?SYSTEM_MESSAGE>[\s\S]*?(<\/SYSTEM_MESSAGE>|$)/g, '')
            .trim();
        return clean;
    }

    function truncate(str, len = 120) {
        if (!str) return '';
        str = str.trim();
        return str.length > len ? str.substring(0, len) + '…' : str;
    }

    // --- Project Icon ---
    function getProjectEmoji(name) {
        const map = {
            'antigravityphone': '📱',
            'hms': '🏥',
            'yogaschoolsrishikesh': '🧘',
            'khakara': '🍪',
            'instagram': '📸',
            'ai_audit': '🎙️',
            'understanding': '📚',
        };
        const lower = (name || '').toLowerCase();
        for (const [key, emoji] of Object.entries(map)) {
            if (lower.includes(key)) return emoji;
        }
        return '📁';
    }

    // --- Load Projects ---
    async function loadProjects() {
        try {
            const projects = await api('/projects');
            state.projects = projects;
            state.projectMap = {};
            projects.forEach(p => { state.projectMap[p.id] = p; });
            renderProjects();
        } catch (err) {
            console.error('Failed to load projects:', err);
            showToast('Failed to load projects', 'error');
        }
    }

    function renderProjects() {
        const projects = state.projects;
        els.totalProjects.textContent = projects.length;

        // Sidebar list
        els.projectsList.innerHTML = projects.map(p => `
            <div class="nav-item" data-project-id="${p.id}" onclick="window.appFilterByProject('${p.id}')">
                <span class="nav-item-icon">${getProjectEmoji(p.name)}</span>
                <span class="nav-item-text">${p.name}</span>
            </div>
        `).join('');

        // Dashboard grid
        els.projectsGrid.innerHTML = projects.map(p => {
            const folder = p.projectResources?.resources?.[0]?.folderUri || '';
            const path = decodeURIComponent(folder.replace('file:///', '').replace(/%3A/g, ':'));
            return `
                <div class="project-card" onclick="window.appFilterByProject('${p.id}')">
                    <div class="project-card-icon">${getProjectEmoji(p.name)}</div>
                    <div class="project-card-name">${p.name}</div>
                    <div class="project-card-path">${path.split('/').pop()}</div>
                </div>
            `;
        }).join('');

        // Modal dropdown
        els.newConvoProject.innerHTML = '<option value="">Select a project…</option>' +
            projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }

    // --- Load Conversations ---
    async function loadConversations() {
        try {
            const conversations = await api('/conversations');
            state.conversations = conversations;
            renderConversations();

            // Asynchronously fetch metadata to populate projectId and filter subagents
            conversations.forEach(async (c) => {
                if (c.projectId !== null) return;
                try {
                    const meta = await api(`/conversations/${c.id}/metadata`);
                    const md = meta?.response?.conversationMetadata?.metadata;
                    if (!md) return;

                    // Hide non-root conversations (subagents, branches)
                    if (md.parentConversationId) {
                        state.conversations = state.conversations.filter(x => x.id !== c.id);
                        renderConversations(state.currentView === 'dashboard' ? state.currentProjectId : null);
                        return;
                    }

                    if (md.projectId) {
                        c.projectId = md.projectId;
                        renderConversations(state.currentView === 'dashboard' ? state.currentProjectId : null);
                    }
                } catch (e) {
                    console.warn('Failed to load metadata for', c.id, e);
                }
            });
        } catch (err) {
            console.error('Failed to load conversations:', err);
            showToast('Failed to load conversations', 'error');
        }
    }

    // --- Helper to Extract Title ---
    function extractTitleAndBody(text) {
        if (!text) return { title: 'Conversation', body: '' };
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return { title: 'Conversation', body: '' };
        
        let title = lines[0];
        if (title.length > 50) title = title.substring(0, 50) + '…';
        
        let body = text.substring(lines[0].length).trim();
        return { title, body: body || text };
    }

    function renderConversations(filterProjectId = null) {
        let conversations = state.conversations;

        if (filterProjectId) {
            conversations = conversations.filter(c => c.projectId === filterProjectId);
        }

        els.totalConversations.textContent = state.conversations.length;
        els.convoCount.textContent = conversations.length;

        // Sidebar list
        els.conversationsList.innerHTML = conversations.length === 0
            ? '<div style="padding: 16px; color: var(--text-tertiary); font-size: 0.8125rem; text-align: center;">No conversations yet</div>'
            : conversations.map(c => {
                const extracted = extractTitleAndBody(c.firstMessage);
                const title = c.title || extracted.title;
                return `
                <div class="nav-item ${c.id === state.currentConversationId ? 'active' : ''}" 
                     data-convo-id="${c.id}" onclick="window.appOpenConversation('${c.id}')">
                    <span class="nav-item-text">${escapeHtml(title)}</span>
                    <span class="nav-item-meta">${formatTime(c.createdAt)}</span>
                </div>
            `}).join('');

        // Dashboard recent
        const recent = conversations.slice(0, 5);
        els.recentConversations.innerHTML = recent.length === 0
            ? '<div style="padding: 24px; color: var(--text-tertiary); font-size: 0.8125rem; text-align: center;">No conversations yet. Start one!</div>'
            : recent.map(c => {
                const project = state.projectMap[c.projectId];
                const extracted = extractTitleAndBody(c.firstMessage);
                const title = c.title || extracted.title;
                const body = c.lastMessage || c.firstMessage || 'No content';
                return `
                    <div class="convo-card" onclick="window.appOpenConversation('${c.id}')">
                        <div class="convo-card-header">
                            ${project ? `<span class="convo-card-project">${getProjectEmoji(project.name)} ${project.name}</span>` : '<span></span>'}
                            <span class="convo-card-time">${formatTime(c.createdAt)}</span>
                        </div>
                        <div class="convo-card-title" style="font-weight: 600; margin-bottom: 4px; color: var(--text-primary); font-size: 0.875rem;">${escapeHtml(title)}</div>
                        <div class="convo-card-text">${escapeHtml(truncate(body, 120))}</div>
                    </div>
                `;
            }).join('');
    }

    // --- Open Conversation ---
    async function openConversation(id) {
        if (state.currentConversationId && socket) {
            socket.emit('unsubscribe', state.currentConversationId);
        }

        const termBody = document.getElementById('terminal-body');
        if (termBody) {
            termBody.innerHTML = '<div class="terminal-line system-msg">> Live logs from background command execution will appear here...</div>';
        }
        resetTerminalStatus(false);
        toggleTerminal(false); // Collapse terminal on convo switch

        state.currentConversationId = id;
        closeSidebar();
        switchView('chat');

        // Update title
        const convo = state.conversations.find(c => c.id === id);
        const extracted = extractTitleAndBody(convo?.firstMessage);
        const title = convo?.title || extracted.title;
        els.pageTitle.textContent = title;
        const project = state.projectMap[convo?.projectId];
        els.pageSubtitle.textContent = project ? project.name : '';
        
        const artBtn = document.getElementById('artifacts-btn');
        if (artBtn) artBtn.style.display = 'flex';

        // Update sidebar active state
        document.querySelectorAll('.nav-item[data-convo-id]').forEach(el => {
            el.classList.toggle('active', el.dataset.convoId === id);
        });

        // Load messages
        els.chatMessages.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-tertiary);">
                <div class="splash-orbit" style="width: 40px; height: 40px;">
                    <div class="orbit-ring ring-1"></div>
                    <div class="orbit-core" style="width: 8px; height: 8px;"></div>
                </div>
            </div>
        `;

        try {
            const [steps, artifacts] = await Promise.all([
                api(`/conversations/${id}`),
                api(`/conversations/${id}/artifacts`).catch(() => [])
            ]);
            renderMessages(steps, artifacts);
            if (socket) {
                socket.emit('subscribe', id);
            }
        } catch (err) {
            console.error('Failed to load conversation:', err);
            els.chatMessages.innerHTML = `
                <div class="chat-empty">
                    <p style="color: var(--error);">Failed to load conversation</p>
                    <p style="font-size: 0.75rem;">${err.message}</p>
                </div>
            `;
        }
    }

    function renderMessages(steps, artifacts = []) {
        currentStepCount = steps ? steps.length : 0;
        if (!steps || steps.length === 0) {
            els.chatMessages.innerHTML = `
                <div class="chat-empty">
                    <div class="empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                    </div>
                    <p>No messages in this conversation</p>
                </div>
            `;
            return;
        }

        let html = '';

        // Render inline artifacts if any
        if (artifacts && artifacts.length > 0) {
            html += `<div class="inline-artifacts-container" style="padding: 12px; margin-bottom: 16px; background: rgba(0,0,0,0.2); border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);">
                <div style="font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    Generated Artifacts (${artifacts.length})
                </div>
                <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;">`;
                
            artifacts.forEach(art => {
                const isImage = art.type === 'png' || art.type === 'jpg';
                const preview = isImage ? '[Image]' : escapeHtml(truncate(art.content || '', 40));
                const downloadUrl = `/api/conversations/${state.currentConversationId}/artifacts/${encodeURIComponent(art.name)}`;
                html += `
                    <a href="${downloadUrl}" target="_blank" class="artifact-card" style="text-decoration: none; flex: 0 0 auto; width: 140px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 8px; cursor: pointer; transition: border-color 0.2s;">
                        <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${art.name}</div>
                        <div style="font-size: 0.65rem; color: var(--text-tertiary); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${preview}</div>
                    </a>`;
            });
            html += `</div></div>`;
        }

        html += steps.map(step => {
            const content = cleanContent(step.content);
            if (!content) return '';

            const stepIdAttr = `id="step-${step.step_index ?? ''}"`;

            if (step.type === 'USER_INPUT') {
                return `
                    <div class="message message-user" ${stepIdAttr}>
                        <div>${escapeHtml(truncate(content, 2000))}</div>
                        <div class="message-meta">${formatDateTime(step.created_at)}</div>
                    </div>
                `;
            }

            if (step.type === 'PLANNER_RESPONSE') {
                let msgHtml = `
                    <div class="message message-assistant" ${stepIdAttr}>
                        <div>${formatMarkdown(content)}</div>
                `;

                if (step.thinking) {
                    msgHtml += `<details class="message-thinking"><summary>💭 Thinking…</summary><div>${escapeHtml(step.thinking)}</div></details>`;
                }

                if (step.tool_calls && step.tool_calls.length > 0) {
                    const toolSummary = step.tool_calls.map(tc => `<span class="tool-call-name">${tc.name}</span>`).join(', ');
                    msgHtml += `<details class="message-tool-calls"><summary>🔧 Tools: ${toolSummary}</summary><div>${escapeHtml(JSON.stringify(step.tool_calls, null, 2))}</div></details>`;
                }

                msgHtml += `<div class="message-meta">${formatDateTime(step.created_at)}</div></div>`;
                return msgHtml;
            }

            return '';
        }).filter(Boolean).join('');

        html += `<div id="chat-anchor" style="height: 1px;"></div>`;
        els.chatMessages.innerHTML = html;

        // Ensure we scroll to bottom to see the latest message
        const scrollToBottom = () => {
            const anchor = document.getElementById('chat-anchor');
            if (anchor) {
                anchor.scrollIntoView({ behavior: 'auto', block: 'end' });
            } else {
                els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
            }
        };

        requestAnimationFrame(() => {
            scrollToBottom();
            setTimeout(scrollToBottom, 100);
            setTimeout(scrollToBottom, 500);
        });
    }

    function appendNewSteps(newSteps) {
        removeThinkingIndicator();
        resetTerminalStatus(true);
        
        document.querySelectorAll('.message-user').forEach(el => {
            const meta = el.querySelector('.message-meta');
            if (meta && (meta.textContent.includes('Sending') || meta.textContent.includes('Sent'))) {
                el.remove();
            }
        });

        let anchor = document.getElementById('chat-anchor');
        if (!anchor) {
            anchor = document.createElement('div');
            anchor.id = 'chat-anchor';
            anchor.style.height = '1px';
            els.chatMessages.appendChild(anchor);
        }

        newSteps.forEach(step => {
            const stepId = `step-${step.step_index}`;
            if (document.getElementById(stepId)) return;

            const content = cleanContent(step.content);
            if (!content) return;

            const stepDiv = document.createElement('div');
            stepDiv.id = stepId;

            if (step.type === 'USER_INPUT') {
                stepDiv.className = 'message message-user';
                stepDiv.innerHTML = `
                    <div>${escapeHtml(truncate(content, 2000))}</div>
                    <div class="message-meta">${formatDateTime(step.created_at)}</div>
                `;
            } else if (step.type === 'PLANNER_RESPONSE') {
                stepDiv.className = 'message message-assistant';
                let msgHtml = `<div>${formatMarkdown(content)}</div>`;

                if (step.thinking) {
                    msgHtml += `<details class="message-thinking"><summary>💭 Thinking…</summary><div>${escapeHtml(step.thinking)}</div></details>`;
                }

                if (step.tool_calls && step.tool_calls.length > 0) {
                    const toolSummary = step.tool_calls.map(tc => `<span class="tool-call-name">${tc.name}</span>`).join(', ');
                    msgHtml += `<details class="message-tool-calls"><summary>🔧 Tools: ${toolSummary}</summary><div>${escapeHtml(JSON.stringify(step.tool_calls, null, 2))}</div></details>`;
                }

                msgHtml += `<div class="message-meta">${formatDateTime(step.created_at)}</div>`;
                stepDiv.innerHTML = msgHtml;
            } else {
                return;
            }

            els.chatMessages.insertBefore(stepDiv, anchor);
            currentStepCount++;
        });

        anchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    // --- Escape HTML ---
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- Simple Markdown ---
    function formatMarkdown(text) {
        if (!text) return '';
        let html = escapeHtml(text);

        // Code blocks
        html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; overflow-x: auto; font-size: 0.75rem; margin: 8px 0;"><code>$2</code></pre>');
        html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 3px; font-size: 0.8125em;">$1</code>');

        // Bold & Italic
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // Line breaks
        html = html.replace(/\n/g, '<br>');

        return html;
    }

    // --- Send Message ---
    let pollInterval = null;
    let currentStepCount = 0;

    async function pollForResponse(id, expectedCount) {
        if (pollInterval) clearInterval(pollInterval);
        
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'processing-indicator';
        thinkingDiv.innerHTML = `
            <div class="splash-orbit" style="width: 14px; height: 14px;">
                <div class="orbit-core" style="width: 4px; height: 4px;"></div>
            </div>
            Antigravity is thinking…
        `;
        
        els.chatMessages.appendChild(thinkingDiv);
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;

        pollInterval = setInterval(async () => {
            if (state.currentConversationId !== id) {
                clearInterval(pollInterval);
                return;
            }
            try {
                const steps = await api(`/conversations/${id}`);
                if (steps.length >= expectedCount) {
                    clearInterval(pollInterval);
                    const artifacts = await api(`/conversations/${id}/artifacts`).catch(() => []);
                    renderMessages(steps, artifacts);
                }
            } catch (e) {}
        }, 2000);
    }

    async function sendMessage() {
        const content = els.messageInput.value.trim();
        if (!content || !state.currentConversationId) return;

        els.messageInput.value = '';
        els.sendBtn.disabled = true;
        autoResizeInput();

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message message-user';
        msgDiv.innerHTML = `
            <div>${escapeHtml(content)}</div>
            <div class="message-meta">Sending…</div>
        `;
        
        els.chatMessages.appendChild(msgDiv);
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;

        try {
            await api(`/conversations/${state.currentConversationId}/message`, {
                method: 'POST',
                body: JSON.stringify({ content }),
            });
            msgDiv.querySelector('.message-meta').textContent = 'Sent ✓';
            
            if (!socket || !socket.connected) {
                // Fallback to polling
                pollForResponse(state.currentConversationId, currentStepCount + 2);
            } else {
                showThinkingIndicator();
            }
        } catch (err) {
            msgDiv.querySelector('.message-meta').textContent = 'Failed to send';
            msgDiv.querySelector('.message-meta').style.color = 'var(--error)';
            showToast(`Failed to send: ${err.message}`, 'error');
        }
    }

    // --- New Conversation ---
    function openNewConvoModal() {
        els.newConvoModal.classList.remove('hidden');
        els.newConvoPrompt.value = '';
        els.newConvoPrompt.focus();
    }

    function closeNewConvoModal() {
        els.newConvoModal.classList.add('hidden');
    }

    async function submitNewConversation() {
        const prompt = els.newConvoPrompt.value.trim();
        if (!prompt) {
            showToast('Please enter a prompt', 'error');
            return;
        }

        const model = els.newConvoModel.value;
        const projectId = els.newConvoProject.value;

        els.modalSubmitBtn.disabled = true;
        els.modalSubmitBtn.innerHTML = `
            <div class="splash-orbit" style="width: 16px; height: 16px;">
                <div class="orbit-core" style="width: 6px; height: 6px;"></div>
            </div>
            Launching…
        `;

        try {
            const result = await api('/conversations/new', {
                method: 'POST',
                body: JSON.stringify({ prompt, model, projectId }),
            });
            closeNewConvoModal();
            showToast('Conversation launched!', 'success');

            // Reload conversations
            setTimeout(async () => {
                await loadConversations();
            }, 2000);
        } catch (err) {
            showToast(`Failed to launch: ${err.message}`, 'error');
        } finally {
            els.modalSubmitBtn.disabled = false;
            els.modalSubmitBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                Launch
            `;
        }
    }

    // --- New Project ---
    function openNewProjectModal() {
        els.newProjectModal.classList.remove('hidden');
        els.newProjectName.value = '';
        els.newProjectPath.value = '';
        els.newProjectCreateFolder.checked = true;
        els.newProjectPathGroup.style.display = 'none';
        els.newProjectName.focus();
    }

    function closeNewProjectModal() {
        els.newProjectModal.classList.add('hidden');
    }

    async function submitNewProject() {
        const name = els.newProjectName.value.trim();
        let folderUri = els.newProjectPath.value.trim();
        
        if (els.newProjectCreateFolder.checked) {
            if (!name) {
                showToast('Please enter a project name', 'error');
                return;
            }
            folderUri = 'D:\\Antigravity2.0\\' + name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim();
        } else if (!name || !folderUri) {
            showToast('Please enter both name and path', 'error');
            return;
        }

        els.projectModalSubmitBtn.disabled = true;
        els.projectModalSubmitBtn.innerHTML = `
            <div class="splash-orbit" style="width: 16px; height: 16px;">
                <div class="orbit-core" style="width: 6px; height: 6px;"></div>
            </div>
            Adding…
        `;

        try {
            await api('/projects/new', {
                method: 'POST',
                body: JSON.stringify({ name, folderUri }),
            });
            closeNewProjectModal();
            showToast('Project added!', 'success');

            await loadProjects();
        } catch (err) {
            showToast(`Failed to add project: ${err.message}`, 'error');
        } finally {
            els.projectModalSubmitBtn.disabled = false;
            els.projectModalSubmitBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                Add Project
            `;
        }
    }

    // --- Settings / Telegram Modal ---
    let localConfigState = { telegramBotToken: '', telegramChatId: '', enabledProjects: {} };

    async function openSettingsModal() {
        els.settingsModal.classList.remove('hidden');
        els.settingsBotToken.value = '';
        els.settingsChatId.value = '';
        els.settingsProjectsList.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); padding: 8px;">Loading settings…</div>';

        try {
            const config = await api('/settings');
            localConfigState = config;
            els.settingsBotToken.value = config.telegramBotToken || '';
            els.settingsChatId.value = config.telegramChatId || '';

            // Render project toggles
            if (state.projects && state.projects.length > 0) {
                els.settingsProjectsList.innerHTML = state.projects.map(proj => {
                    const isChecked = config.enabledProjects[proj.id] === undefined || config.enabledProjects[proj.id] === true;
                    return `
                        <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer; user-select: none; padding: 4px;">
                            <input type="checkbox" class="settings-project-checkbox" data-project-id="${proj.id}" ${isChecked ? 'checked' : ''} style="width: 14px; height: 14px; accent-color: var(--accent-primary);">
                            ${proj.name}
                        </label>
                    `;
                }).join('');
            } else {
                els.settingsProjectsList.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); padding: 8px; font-size: 0.85rem;">No projects found.</div>';
            }
        } catch (err) {
            showToast(`Failed to load settings: ${err.message}`, 'error');
            closeSettingsModal();
        }
    }

    function closeSettingsModal() {
        els.settingsModal.classList.add('hidden');
    }

    async function saveSettings() {
        const token = els.settingsBotToken.value.trim();
        const chatId = els.settingsChatId.value.trim();
        
        const enabledProjects = {};
        els.settingsProjectsList.querySelectorAll('.settings-project-checkbox').forEach(cb => {
            enabledProjects[cb.dataset.projectId] = cb.checked;
        });

        els.settingsSaveBtn.disabled = true;
        els.settingsSaveBtn.textContent = 'Saving…';

        try {
            await api('/settings', {
                method: 'POST',
                body: JSON.stringify({
                    telegramBotToken: token,
                    telegramChatId: chatId,
                    enabledProjects
                })
            });
            showToast('Settings saved!', 'success');
            closeSettingsModal();
        } catch (err) {
            showToast(`Failed to save settings: ${err.message}`, 'error');
        } finally {
            els.settingsSaveBtn.disabled = false;
            els.settingsSaveBtn.textContent = 'Save Settings';
        }
    }

    async function testTelegramNotification() {
        const token = els.settingsBotToken.value.trim();
        const chatId = els.settingsChatId.value.trim();

        if (!token || !chatId) {
            showToast('Please enter both Bot Token and Chat ID to test', 'error');
            return;
        }

        els.settingsTestBtn.disabled = true;
        els.settingsTestBtn.textContent = 'Testing…';

        try {
            await api('/settings/test-telegram', {
                method: 'POST',
                body: JSON.stringify({ token, chatId })
            });
            showToast('Test notification sent! Check Telegram.', 'success');
        } catch (err) {
            showToast(`Test failed: ${err.message}`, 'error');
        } finally {
            els.settingsTestBtn.disabled = false;
            els.settingsTestBtn.textContent = 'Test Bot';
        }
    }

    async function discoverTelegramChat() {
        const token = els.settingsBotToken.value.trim();
        if (!token) {
            showToast('Please enter your Telegram Bot Token first', 'error');
            return;
        }

        els.settingsDiscoverBtn.disabled = true;
        els.settingsDiscoverBtn.textContent = 'Listening…';
        showToast('Send a message to your bot on Telegram now...', 'info');

        try {
            const res = await api('/settings/discover-chat', {
                method: 'POST',
                body: JSON.stringify({ token })
            });

            if (res.success && res.discovery) {
                els.settingsChatId.value = res.discovery.chatId;
                showToast(`Found chat with ${res.discovery.firstName || res.discovery.title || 'user'}!`, 'success');
            } else {
                showToast(res.message || 'No chat ID found. Try sending a message again.', 'error');
            }
        } catch (err) {
            showToast(`Discovery failed: ${err.message}`, 'error');
        } finally {
            els.settingsDiscoverBtn.disabled = false;
            els.settingsDiscoverBtn.textContent = 'Auto Discover';
        }
    }

    // --- Auto-resize Input ---
    function autoResizeInput() {
        const textarea = els.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        els.sendBtn.disabled = !textarea.value.trim();
    }

    function filterByProject(projectId) {
        state.currentProjectId = projectId;
        const project = state.projectMap[projectId];
        if (project) {
            els.pageTitle.textContent = project.name;
            els.pageSubtitle.textContent = 'Project';
        } else {
            els.pageTitle.textContent = 'Dashboard';
            els.pageSubtitle.textContent = '';
        }
        renderConversations(projectId);
        closeSidebar();
        switchView('dashboard');

        // Highlight active project in sidebar
        document.querySelectorAll('.nav-item[data-project-id]').forEach(el => {
            el.classList.toggle('active', el.dataset.projectId === projectId);
        });
    }

    // --- Refresh ---
    async function refreshAll() {
        const icon = els.refreshBtn.querySelector('svg');
        icon.classList.add('spinning');

        try {
            await Promise.all([loadProjects(), loadConversations()]);
            showToast('Refreshed', 'success');
        } catch (err) {
            showToast('Refresh failed', 'error');
        } finally {
            icon.classList.remove('spinning');
        }
    }

    function goToDashboard() {
        state.currentConversationId = null;
        state.currentProjectId = null;
        els.pageTitle.textContent = 'Dashboard';
        els.pageSubtitle.textContent = '';
        
        const artBtn = document.getElementById('artifacts-btn');
        if (artBtn) artBtn.style.display = 'none';

        switchView('dashboard');
        renderConversations();

        document.querySelectorAll('.nav-item[data-project-id]').forEach(el => {
            el.classList.remove('active');
        });
    }

    // --- Global Handlers ---
    window.appOpenConversation = openConversation;
    window.appFilterByProject = filterByProject;

    // --- Event Listeners ---
    function initEvents() {
        els.menuBtn.addEventListener('click', openSidebar);
        els.sidebarCloseBtn.addEventListener('click', closeSidebar);
        els.sidebarOverlay.addEventListener('click', closeSidebar);
        els.refreshBtn.addEventListener('click', refreshAll);

        els.newConvoBtn.addEventListener('click', () => {
            closeSidebar();
            openNewConvoModal();
        });

        els.modalCloseBtn.addEventListener('click', closeNewConvoModal);
        els.modalCancelBtn.addEventListener('click', closeNewConvoModal);
        els.modalSubmitBtn.addEventListener('click', submitNewConversation);

        els.newConvoModal.addEventListener('click', (e) => {
            if (e.target === els.newConvoModal) closeNewConvoModal();
        });

        // New Project events
        els.addProjectBtn.addEventListener('click', openNewProjectModal);
        els.projectModalCloseBtn.addEventListener('click', closeNewProjectModal);
        els.projectModalCancelBtn.addEventListener('click', closeNewProjectModal);
        els.projectModalSubmitBtn.addEventListener('click', submitNewProject);

        els.newProjectCreateFolder.addEventListener('change', (e) => {
            els.newProjectPathGroup.style.display = e.target.checked ? 'none' : 'block';
        });

        els.newProjectModal.addEventListener('click', (e) => {
            if (e.target === els.newProjectModal) closeNewProjectModal();
        });

        // --- Artifacts Logic ---
        const artifactsBtn = document.getElementById('artifacts-btn');
        const artifactsModal = document.getElementById('artifacts-modal');
        const artifactsCloseBtn = document.getElementById('artifacts-close-btn');
        const artifactsList = document.getElementById('artifacts-list');

        if (artifactsBtn && artifactsModal) {
            artifactsBtn.addEventListener('click', async () => {
                if (!state.currentConversationId) return;
                artifactsModal.classList.remove('hidden');
                artifactsList.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); padding: 20px;">Loading artifacts…</div>';
                
                try {
                    const artifacts = await api(`/conversations/${state.currentConversationId}/artifacts`);
                    if (!artifacts || artifacts.length === 0) {
                        artifactsList.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); padding: 20px;">No artifacts found for this conversation.</div>';
                        return;
                    }
                    
                    artifactsList.innerHTML = artifacts.map(art => {
                        const downloadUrl = `/api/conversations/${state.currentConversationId}/artifacts/${encodeURIComponent(art.name)}`;
                        const viewBtn = `<a href="${downloadUrl}" target="_blank" style="text-decoration: none; background: var(--accent-primary); color: white; padding: 4px 10px; border-radius: var(--radius-sm); font-size: 0.75rem;">View / Download</a>`;

                        if (art.type === 'png' || art.type === 'jpg') {
                            return `
                            <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden;">
                                <div style="padding: 8px 12px; background: rgba(0,0,0,0.2); font-weight: 600; font-size: 0.8125rem; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
                                    ${art.name}
                                    ${viewBtn}
                                </div>
                                <div style="padding: 12px; text-align: center;">
                                    <img src="${downloadUrl}" style="max-width: 100%; border-radius: var(--radius-sm);" alt="${art.name}">
                                </div>
                            </div>`;
                        }
                        
                        return `
                        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden;">
                            <div style="padding: 8px 12px; background: rgba(0,0,0,0.2); font-weight: 600; font-size: 0.8125rem; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
                                ${art.name}
                                ${viewBtn}
                            </div>
                            <div style="padding: 12px; font-size: 0.8125rem; max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-family: var(--font-mono); color: var(--text-secondary);">${escapeHtml(art.content || '')}</div>
                        </div>`;
                    }).join('');
                } catch (e) {
                    artifactsList.innerHTML = `<div style="color: var(--error); padding: 20px; text-align: center;">Error loading artifacts: ${e.message}</div>`;
                }
            });

            artifactsCloseBtn.addEventListener('click', () => {
                artifactsModal.classList.add('hidden');
            });
            artifactsModal.addEventListener('click', (e) => {
                if (e.target === artifactsModal) artifactsModal.classList.add('hidden');
            });
        }

        // Quota Toggle
        const quotaToggle = document.getElementById('quota-toggle');
        const quotaList = document.getElementById('model-quota-list');
        if (quotaToggle && quotaList) {
            quotaToggle.addEventListener('change', (e) => {
                quotaList.style.display = e.target.checked ? 'flex' : 'none';
            });
        }

        // Attach Button
        const attachBtn = document.getElementById('attach-btn');
        const fileUpload = document.getElementById('file-upload');
        if (attachBtn && fileUpload) {
            attachBtn.addEventListener('click', () => {
                fileUpload.click();
            });
            fileUpload.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    const filesCount = e.target.files.length;
                    showToast(`Attached ${filesCount} file${filesCount > 1 ? 's' : ''}.`, 'success');
                    els.messageInput.focus();
                }
            });
        }

        els.messageInput.addEventListener('input', autoResizeInput);
        els.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        els.sendBtn.addEventListener('click', sendMessage);

        // Terminal Drawer Events
        const termHeader = document.querySelector('.terminal-header');
        const termToggleBtn = document.getElementById('terminal-toggle-btn');
        const termClearBtn = document.getElementById('terminal-clear-btn');
        const termBody = document.getElementById('terminal-body');

        if (termHeader) {
            termHeader.addEventListener('click', (e) => {
                if (termClearBtn && termClearBtn.contains(e.target)) return;
                toggleTerminal();
            });
        }
        if (termToggleBtn) {
            termToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTerminal();
            });
        }
        if (termClearBtn) {
            termClearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (termBody) {
                    termBody.innerHTML = '<div class="terminal-line system-msg">> Terminal cleared</div>';
                }
            });
        }

        // Back to dashboard on title click when in chat
        els.pageTitle.addEventListener('click', () => {
            if (state.currentView === 'chat') {
                goToDashboard();
            }
        });
        els.pageTitle.style.cursor = 'pointer';

        // Swipe right to open sidebar (mobile)
        let touchStartX = 0;
        document.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });
        document.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const diff = touchEndX - touchStartX;
            if (touchStartX < 30 && diff > 60) {
                openSidebar();
            } else if (diff < -60 && els.sidebar.classList.contains('open')) {
                closeSidebar();
            }
        }, { passive: true });

        // Settings / Telegram events
        if (els.settingsBtn) {
            els.settingsBtn.addEventListener('click', openSettingsModal);
        }
        if (els.settingsCloseBtn) {
            els.settingsCloseBtn.addEventListener('click', closeSettingsModal);
        }
        if (els.settingsCancelBtn) {
            els.settingsCancelBtn.addEventListener('click', closeSettingsModal);
        }
        if (els.settingsSaveBtn) {
            els.settingsSaveBtn.addEventListener('click', saveSettings);
        }
        if (els.settingsTestBtn) {
            els.settingsTestBtn.addEventListener('click', testTelegramNotification);
        }
        if (els.settingsDiscoverBtn) {
            els.settingsDiscoverBtn.addEventListener('click', discoverTelegramChat);
        }
        if (els.settingsModal) {
            els.settingsModal.addEventListener('click', (e) => {
                if (e.target === els.settingsModal) closeSettingsModal();
            });
        }
    }

    // --- Model Quotas ---
    function renderModelQuotas() {
        const quotaList = document.getElementById('model-quota-list');
        if (!quotaList) return;

        const quotas = [
            { name: 'Gemini 3.5 Flash (Medium)', status: 'Refreshes in 4 hours, 23 minutes', filled: 4, total: 5, warning: false },
            { name: 'Gemini 3.5 Flash (High)', status: 'Refreshes in 4 hours, 23 minutes', filled: 3, total: 5, warning: false },
            { name: 'Gemini 3.5 Flash (Low)', status: 'Refreshes in 4 hours, 23 minutes', filled: 5, total: 5, warning: false },
            { name: 'Gemini 3.1 Pro (Low)', status: 'Refreshes in 4 hours, 23 minutes', filled: 4, total: 5, warning: false },
            { name: 'Gemini 3.1 Pro (High)', status: 'Refreshes in 4 hours, 23 minutes', filled: 5, total: 5, warning: false },
            { name: 'Claude Sonnet 4.6 (Thinking)', status: 'Refreshes in 1 hour, 2 minutes', filled: 0, total: 5, warning: true },
            { name: 'Claude Opus 4.6 (Thinking)', status: 'Refreshes in 1 hour, 2 minutes', filled: 0, total: 5, warning: true },
            { name: 'GPT-OSS 120B (Medium)', status: 'Refreshes in 1 hour, 2 minutes', filled: 0, total: 5, warning: true },
        ];

        quotaList.innerHTML = quotas.map(q => {
            let barsHtml = '';
            for (let i = 0; i < q.total; i++) {
                barsHtml += `<div class="quota-bar ${i < q.filled ? 'filled' : 'empty'}"></div>`;
            }

            const warningHtml = q.warning ? `<span class="quota-warning" title="Quota empty">⚠️</span>` : '';

            return `
                <div class="quota-item">
                    <div class="quota-header">
                        <div class="quota-name">${q.name} ${warningHtml}</div>
                        <div class="quota-status">${q.status}</div>
                    </div>
                    <div class="quota-bars">
                        ${barsHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- Init ---
    async function init() {
        initEvents();

        // Load data
        await Promise.all([loadProjects(), loadConversations()]);
        renderModelQuotas();
        initSocket();

        // Fade out splash
        setTimeout(() => {
            els.splashScreen.classList.add('fade-out');
            els.app.classList.remove('hidden');
            setTimeout(() => {
                els.splashScreen.style.display = 'none';
            }, 600);
        }, 2000);
    }

    // Start
    init();
})();
