const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync, execSync } = require('child_process');
const https = require('https');
const http = require('http');
const socketIo = require('socket.io');
const chokidar = require('chokidar');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const PORT = 8080;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const os = require('os');

const HOME_DIR = os.homedir();
const PROJECTS_DIR = path.join(HOME_DIR, '.gemini', 'config', 'projects');
const BRAIN_DIR = path.join(HOME_DIR, '.gemini', 'antigravity', 'brain');
const LANGUAGE_SERVER_EXE = path.join(
  HOME_DIR, 'AppData', 'Local', 'Programs',
  'Antigravity', 'resources', 'bin', 'language_server.exe'
);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Basic Auth middleware
const AUTH_USER = 'admin';
const AUTH_PASS = 'AntiGravity2025!';

function basicAuth(req, res, next) {
  // Allow health endpoint without auth
  if (req.path === '/health' || req.path === '/api/health') return next();

  // Allow direct artifact downloads without auth since they use unguessable UUIDs and browser img/a tags can't send headers
  // Note: req.path has '/api' stripped off because of app.use('/api', basicAuth)
  if (req.path.match(/^\/conversations\/[a-f0-9-]+\/artifacts\/[^\/]+$/i)) {
      return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Antigravity Dashboard"');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
  const [user, pass] = decoded.split(':');

  if (user === AUTH_USER && pass === AUTH_PASS) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Antigravity Dashboard"');
  return res.status(401).json({ error: 'Invalid credentials' });
}

app.use('/api', basicAuth);

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Language Server Discovery & Process Verification Helpers
// ---------------------------------------------------------------------------

function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

let envLsPidCache = {
  pid: null,
  port: null,
  lastChecked: 0
};

function getPidForPort(port) {
  try {
    const output = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes(`:${port}`) && line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(pid) && pid > 0) {
          return pid;
        }
      }
    }
  } catch (err) {
    console.error('[Discovery] Error running netstat to find PID for port:', err.message);
  }
  return null;
}

function getActiveLanguageServer() {
  // 1. High priority: check environment variables (e.g. from active IDE session)
  if (process.env.ANTIGRAVITY_LS_ADDRESS && process.env.ANTIGRAVITY_CSRF_TOKEN) {
    const address = process.env.ANTIGRAVITY_LS_ADDRESS;
    const token = process.env.ANTIGRAVITY_CSRF_TOKEN;
    const portMatch = address.match(/:(\d+)$/);
    if (portMatch) {
      const port = parseInt(portMatch[1], 10);
      const now = Date.now();
      
      // Use cached PID if it matches the port and is verified within the last 5 seconds
      if (envLsPidCache.port === port && envLsPidCache.pid && (now - envLsPidCache.lastChecked < 5000)) {
        if (isPidRunning(envLsPidCache.pid)) {
          return {
            address,
            token,
            pid: envLsPidCache.pid
          };
        }
      }
      
      // Resolve/verify the PID from the port
      const pid = getPidForPort(port);
      if (pid) {
        envLsPidCache = { pid, port, lastChecked: now };
        return { address, token, pid };
      }
    }
  }
  
  // 2. Fallback: discover from ls_*.json files in daemon directory
  const daemonDir = path.join(os.homedir(), '.gemini', 'antigravity', 'daemon');
  if (fs.existsSync(daemonDir)) {
    const files = fs.readdirSync(daemonDir).filter(f => f.startsWith('ls_') && f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(daemonDir, file), 'utf8');
        const lsInfo = JSON.parse(raw);
        if (lsInfo.pid && lsInfo.httpPort && lsInfo.csrfToken) {
          if (isPidRunning(lsInfo.pid)) {
            return {
              address: `localhost:${lsInfo.httpPort}`,
              token: lsInfo.csrfToken,
              pid: lsInfo.pid
            };
          }
        }
      } catch (err) {
        // ignore malformed files
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip XML-style tags like <USER_REQUEST>...</USER_REQUEST> from content.
 */
function stripXmlTags(text) {
  if (!text) return text;
  return text
    .replace(/<USER_REQUEST>[\s\S]*?<\/USER_REQUEST>/gi, (match) => {
      // Extract inner content
      return match
        .replace(/<USER_REQUEST>/gi, '')
        .replace(/<\/USER_REQUEST>/gi, '');
    })
    .replace(/<\/?[A-Z_]+>/gi, '')
    .trim();
}

/**
 * Read the first line of a transcript.jsonl file and extract summary info.
 */
function readFirstTranscriptLine(conversationId) {
  const transcriptPath = path.join(
    BRAIN_DIR, conversationId,
    '.system_generated', 'logs', 'transcript.jsonl'
  );

  try {
    if (!fs.existsSync(transcriptPath)) return null;

    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const firstLine = content.split('\n').find((line) => line.trim().length > 0);
    if (!firstLine) return null;

    const entry = JSON.parse(firstLine);
    let messageContent = entry.content || '';
    messageContent = stripXmlTags(messageContent);

    return {
      firstMessage: messageContent.substring(0, 150),
      createdAt: entry.created_at || null,
    };
  } catch (err) {
    return null;
  }
}

function getLastTranscriptTimeAndMessage(conversationId) {
  const transcriptPath = path.join(
    BRAIN_DIR, conversationId,
    '.system_generated', 'logs', 'transcript.jsonl'
  );
  try {
    if (!fs.existsSync(transcriptPath)) return null;
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length === 0) return null;
    
    let lastTime = null;
    let lastContent = null;
    
    // Read backwards to find the latest time and latest actual text content
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
            const entry = JSON.parse(line);
            if (!lastTime && entry.created_at) {
                lastTime = entry.created_at;
            }
            if (!lastContent && entry.content && typeof entry.content === 'string') {
                lastContent = stripXmlTags(entry.content).substring(0, 200);
            }
            if (lastTime && lastContent) break;
        } catch (e) {}
    }
    
    return {
        updatedAt: lastTime,
        lastMessage: lastContent
    };
  } catch (err) {
    return null;
  }
}

/**
 * Extract actual conversation titles from the Antigravity protobuf summary file.
 */
function getConversationTitles() {
  const pbPath = path.join(BRAIN_DIR, '..', 'agyhub_summaries_proto.pb');
  const titles = {};
  if (!fs.existsSync(pbPath)) return titles;
  try {
    const data = fs.readFileSync(pbPath, 'latin1');
    const uuids = [...data.matchAll(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/g)];
    for (let match of uuids) {
      const idx = match.index;
      const chunk = data.substring(idx + 36, idx + 200);
      const titleMatch = chunk.match(/\x0a.([A-Z][A-Za-z0-9 _\-\.,:'"]{5,100})/);
      if (titleMatch) {
        titles[match[1]] = titleMatch[1];
      }
    }
  } catch (err) {
    console.error('Error parsing pb:', err);
  }
  return titles;
}

/**
 * Run a language_server.exe agentapi command and return parsed JSON or raw output.
 */
function runAgentApi(args, parseJson = true, projectId = null) {
  const options = {
    encoding: 'utf-8',
    timeout: 30000,
    windowsHide: true,
    env: { ...process.env }
  };

  const activeLS = getActiveLanguageServer();
  if (activeLS) {
    options.env.ANTIGRAVITY_LS_ADDRESS = activeLS.address;
    options.env.ANTIGRAVITY_CSRF_TOKEN = activeLS.token;
  }

  if (projectId) {
    options.env.ANTIGRAVITY_PROJECT_ID = projectId;
  }

  const result = execFileSync(LANGUAGE_SERVER_EXE, args, options);

  if (parseJson) {
    try {
      return JSON.parse(result);
    } catch {
      return result.trim();
    }
  }
  return result.trim();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Global Cache-Control middleware to prevent browser from caching API responses
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ---------------------------------------------------------------------------
// Telegram Integration & Monitoring Settings
// ---------------------------------------------------------------------------
const CONFIG_FILE = path.join(__dirname, 'dashboard-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading config:', err.message);
  }
  return { telegramBotToken: '', telegramChatId: '', enabledProjects: {} };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving config:', err.message);
  }
}

function sendTelegramMessage(token, chatId, text, replyMarkup = null) {
  console.log(`[Telegram Debug] Sending message to chat ${chatId}: ${text.replace(/\n/g, ' ')}`);
  return new Promise((resolve, reject) => {
    if (!token || !chatId) {
      return reject(new Error('Bot token and Chat ID are required'));
    }
    const payload = {
      chat_id: chatId,
      text: text
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const data = JSON.stringify(payload);

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.ok) {
            resolve(json.result);
          } else {
            reject(new Error(json.description || 'Failed to send Telegram message'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

function discoverChatId(token) {
  return new Promise((resolve, reject) => {
    if (!token) return reject(new Error('Bot token is required'));
    
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/getUpdates?limit=5`,
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (!json.ok) {
            return reject(new Error(json.description || 'Failed to fetch updates'));
          }
          const updates = json.result || [];
          if (updates.length === 0) {
            return resolve(null);
          }
          // Find latest update with a valid chat object
          for (let i = updates.length - 1; i >= 0; i--) {
            const update = updates[i];
            const msg = update.message || update.channel_post || update.edited_message;
            if (msg && msg.chat && msg.chat.id) {
              return resolve({
                chatId: msg.chat.id.toString(),
                firstName: msg.chat.first_name || '',
                username: msg.chat.username || '',
                title: msg.chat.title || ''
              });
            }
          }
          resolve(null);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

// Memory cache for transcript monitoring
const monitoredConversations = {};
let projectCache = [];
let lastActiveConvoId = null;
let lastUpdateId = 0;

function updateProjectCache() {
  if (!fs.existsSync(PROJECTS_DIR)) return;
  try {
    const files = fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith('.json'));
    const tempProjects = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf-8');
        const project = JSON.parse(raw);
        tempProjects.push(project);
      } catch (err) {}
    }
    projectCache = tempProjects;
  } catch (err) {}
}

function formatToolDescription(tc) {
  const name = tc.name;
  const args = tc.args || {};
  
  if (name === 'run_command') {
    return `Command - ${args.CommandLine || 'unknown'}`;
  }
  if (name === 'write_to_file' || name === 'replace_file_content' || name === 'multi_replace_file_content') {
    const file = args.TargetFile || args.Path || 'unknown file';
    const action = name === 'write_to_file' ? 'Create' : 'Edit';
    return `${action} File - ${path.basename(file)}`;
  }
  if (name === 'ask_permission') {
    return `Permission - ${args.Reason || 'Requires authorization'}`;
  }
  if (name === 'ask_question') {
    return `Question - ${args.Question || 'Clarification needed'}`;
  }
  return `Tool - ${name}`;
}

function getProjectName(projectId) {
  const p = projectCache.find(proj => proj.id === projectId);
  return p ? p.name : 'Unknown Project';
}

function resolveProjectForConvo(convoId) {
  try {
    const metaResult = runAgentApi(['agentapi', 'get-conversation-metadata', convoId], true);
    if (metaResult && metaResult.projectId) {
      return metaResult.projectId;
    }
  } catch (e) {}
  return null;
}

function pollTranscripts() {
  if (!fs.existsSync(BRAIN_DIR)) return;
  
  const config = loadConfig();
  if (!config.telegramBotToken || !config.telegramChatId) return;

  updateProjectCache();

  try {
    const convoDirs = fs.readdirSync(BRAIN_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^[a-f0-9-]+$/i.test(entry.name));

    for (const dir of convoDirs) {
      const convoId = dir.name;
      const transcriptPath = path.join(BRAIN_DIR, convoId, '.system_generated', 'logs', 'transcript.jsonl');
      
      if (!fs.existsSync(transcriptPath)) continue;

      let lastLineCount = monitoredConversations[convoId];
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      
      // Initialize if we haven't seen this conversation yet
      if (lastLineCount === undefined) {
        monitoredConversations[convoId] = lines.length;
        continue;
      }
      if (lastLineCount !== undefined && lines.length < lastLineCount) {
        console.log(`[Telegram Debug] Convo ${convoId} truncated: reset cache from ${lastLineCount} to ${lines.length}`);
        monitoredConversations[convoId] = lines.length;
        lastLineCount = lines.length;
      }

      if (lines.length > lastLineCount) {
        console.log(`[Telegram Debug] Convo ${convoId} changed: ${lastLineCount} -> ${lines.length} lines.`);
        const newLines = lines.slice(lastLineCount);
        monitoredConversations[convoId] = lines.length;

        const projectId = resolveProjectForConvo(convoId);
        console.log(`[Telegram Debug] Convo ${convoId} resolved projectId: ${projectId}`);
        if (!projectId && convoId !== '99999999-9999-9999-9999-999999999999') {
          console.log(`[Telegram Debug] Skipping non-project convo ${convoId}`);
          continue;
        }
        
        // Notify if notifications are enabled for this project
        // If enabledProjects is empty/unset, defaults to enabled
        const isEnabled = !config.enabledProjects || 
                          config.enabledProjects[projectId] === undefined || 
                          config.enabledProjects[projectId] === true;
        console.log(`[Telegram Debug] Convo ${convoId} project enabled: ${isEnabled}`);
        if (!isEnabled) continue;

        const projectName = projectId ? getProjectName(projectId) : 'Default Project';

        for (const line of newLines) {
          try {
            const entry = JSON.parse(line);
            console.log(`[Telegram Debug] Parsing step index ${entry.step_index}, type=${entry.type}, status=${entry.status}`);
            
            // 1. Check for Errors
            if (entry.status === 'ERROR') {
              let errorMsg = entry.content || 'An unexpected error occurred.';
              errorMsg = stripXmlTags(errorMsg);
              const cleanMsg = errorMsg.length > 100 ? errorMsg.substring(0, 97) + '...' : errorMsg;
              
              const text = `❌ Antigravity Error Alert\n` +
                           `📁 Project: ${projectName}\n` +
                           `⚠️ Error: ${cleanMsg}\n` +
                           `👉 Open dashboard to view.`;
              
              console.log(`[Telegram Debug] Triggering error alert payload: ${text.replace(/\n/g, ' ')}`);
              sendTelegramMessage(config.telegramBotToken, config.telegramChatId, text)
                .catch(err => console.error('[Telegram Monitoring] Send failed:', err.message));
            }
            
            // 2. Check for proposed tool calls requiring approval
            if (entry.type === 'PLANNER_RESPONSE' && entry.tool_calls && entry.tool_calls.length > 0) {
              const hasSensitive = entry.tool_calls.some(tc => 
                ['run_command', 'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'ask_permission', 'ask_question'].includes(tc.name)
              );
              console.log(`[Telegram Debug] Proposed tools: ${entry.tool_calls.map(tc => tc.name).join(', ')}, hasSensitive=${hasSensitive}`);

              if (hasSensitive) {
                lastActiveConvoId = convoId;

                const pendingTools = entry.tool_calls.map(tc => formatToolDescription(tc)).join(', ');
                const cleanActionMsg = pendingTools.length > 100 ? pendingTools.substring(0, 97) + '...' : pendingTools;

                const text = `⚠️ Antigravity Action Required\n` +
                             `📁 Project: ${projectName}\n` +
                             `🛠️ Action: ${cleanActionMsg}\n` +
                             `👉 Open dashboard to approve.`;

                const replyMarkup = {
                  inline_keyboard: [
                    [
                      { text: '✓ Allow', callback_data: `allow:${convoId}` },
                      { text: '✕ Deny', callback_data: `deny:${convoId}` }
                    ]
                  ]
                };

                console.log(`[Telegram Debug] Triggering action required alert payload: ${text.replace(/\n/g, ' ')}`);
                sendTelegramMessage(config.telegramBotToken, config.telegramChatId, text, replyMarkup)
                  .catch(err => console.error('[Telegram Monitoring] Send failed:', err.message));
              }
            }
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    console.error('[Telegram Monitoring] Error polling transcripts:', err.message);
  }
}

// Start polling loop every 5 seconds
setInterval(pollTranscripts, 5000);

function editTelegramMessage(token, chatId, messageId, text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text
    });
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/editMessageText`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve());
    });
    req.on('error', err => reject(err));
    req.write(data);
    req.end();
  });
}

function answerCallbackQuery(token, callbackQueryId, text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text
    });
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/answerCallbackQuery`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve());
    });
    req.on('error', err => reject(err));
    req.write(data);
    req.end();
  });
}

function startTelegramPolling() {
  const config = loadConfig();
  if (!config.telegramBotToken || !config.telegramChatId) {
    setTimeout(startTelegramPolling, 10000);
    return;
  }

  const poll = () => {
    const currentConfig = loadConfig();
    const currentToken = currentConfig.telegramBotToken;
    const currentChatId = currentConfig.telegramChatId;

    if (!currentToken || !currentChatId) {
      setTimeout(poll, 5000);
      return;
    }

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${currentToken}/getUpdates?offset=${lastUpdateId}&timeout=10`,
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', async () => {
        try {
          const json = JSON.parse(body);
          if (json.ok && json.result) {
            if (json.result.length > 0) {
              console.log(`[Telegram Debug] Poll received ${json.result.length} new updates.`);
            }
            for (const update of json.result) {
              lastUpdateId = update.update_id + 1;
              console.log(`[Telegram Debug] Processing update: ID=${update.update_id}, callback=${!!update.callback_query}, message=${!!update.message}`);

              // Handle button clicks
              if (update.callback_query) {
                const callback = update.callback_query;
                const callbackData = callback.data || '';
                const chat = callback.message.chat;
                const messageId = callback.message.message_id;

                let action = '';
                let targetConvoId = '';
                if (callbackData.startsWith('allow:')) {
                  action = 'Allow';
                  targetConvoId = callbackData.replace('allow:', '');
                } else if (callbackData.startsWith('deny:')) {
                  action = 'Deny';
                  targetConvoId = callbackData.replace('deny:', '');
                }

                if (action && targetConvoId) {
                  try {
                    console.log(`[Telegram Debug] Handling callback query: action=${action}, convo=${targetConvoId}`);
                    if (targetConvoId !== '99999999-9999-9999-9999-999999999999') {
                      console.log(`[Telegram Debug] Calling agentapi send-message for convo ${targetConvoId}`);
                      runAgentApi(['agentapi', 'send-message', targetConvoId, action]);
                    }

                    // Edit original Telegram alert message
                    const updatedText = callback.message.text + `\n\nResult: ${action === 'Allow' ? 'Allow ✅' : 'Deny ❌'}`;
                    await editTelegramMessage(currentToken, chat.id, messageId, updatedText);

                    // Acknowledge callback click
                    await answerCallbackQuery(currentToken, callback.id, `Recorded: ${action}`);
                    console.log(`[Telegram Debug] Callback action resolved successfully.`);
                  } catch (err) {
                    console.error(`[Telegram Debug] Callback handling error:`, err.message);
                    await answerCallbackQuery(currentToken, callback.id, `Error: ${err.message}`);
                  }
                }
              }

              // Handle typed messages forwarded to conversation context
              if (update.message && update.message.text) {
                const messageText = update.message.text;
                if (messageText.startsWith('/')) continue;

                const convoId = lastActiveConvoId;
                if (convoId) {
                  try {
                    runAgentApi(['agentapi', 'send-message', convoId, messageText]);
                    await sendTelegramMessage(currentToken, currentChatId, `Forwarded text reply to agent: "${messageText}"`);
                  } catch (err) {
                    await sendTelegramMessage(currentToken, currentChatId, `Failed to forward reply: ${err.message}`);
                  }
                } else {
                  await sendTelegramMessage(currentToken, currentChatId, `No active conversation context mapped. Open dashboard to reply.`);
                }
              }
            }
          }
        } catch (e) {
          console.error('[Telegram Polling] Update parsing error:', e.message);
        }
        setTimeout(poll, 1500);
      });
    });

    req.on('error', (err) => {
      console.error('[Telegram Polling] Loop network error:', err.message);
      setTimeout(poll, 5000);
    });
    req.end();
  };

  poll();
}

// Start Telegram Polling loop
startTelegramPolling();

// Settings Routes
app.get('/api/settings', (_req, res) => {
  const config = loadConfig();
  res.json(config);
});

app.post('/api/settings', (req, res) => {
  try {
    const { telegramBotToken, telegramChatId, enabledProjects } = req.body;
    const config = loadConfig();

    if (telegramBotToken !== undefined) config.telegramBotToken = telegramBotToken.trim();
    if (telegramChatId !== undefined) config.telegramChatId = telegramChatId.trim();
    if (enabledProjects !== undefined) config.enabledProjects = enabledProjects;

    saveConfig(config);
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings', details: err.message });
  }
});

app.post('/api/settings/discover-chat', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Bot token is required' });
    }
    const discovery = await discoverChatId(token);
    if (discovery) {
      res.json({ success: true, discovery });
    } else {
      res.json({ success: false, message: 'No messages found. Send a message or start command to your Telegram bot, then try again.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Discovery failed', details: err.message });
  }
});

app.post('/api/settings/test-telegram', async (req, res) => {
  try {
    const { token, chatId } = req.body;
    if (!token || !chatId) {
      return res.status(400).json({ error: 'Bot token and Chat ID are required' });
    }
    const text = `🤖 Antigravity Test Alert\n` +
                 `📁 Project: Test Configuration\n` +
                 `✅ Message: Telegram notifications configured!`;
    
    await sendTelegramMessage(token, chatId, text);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send test message', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// Socket.IO WebSocket Streaming Server
// ---------------------------------------------------------------------------
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
  if (!token) {
    return next(new Error('Authentication error: Missing token'));
  }
  
  let credentials = '';
  if (token.startsWith('Basic ')) {
    credentials = Buffer.from(token.slice(6), 'base64').toString();
  } else {
    credentials = Buffer.from(token, 'base64').toString();
  }
  
  const [user, pass] = credentials.split(':');
  if (user === AUTH_USER && pass === AUTH_PASS) {
    return next();
  }
  return next(new Error('Authentication error: Invalid credentials'));
});

const activeWatchers = {};

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  
  socket.on('subscribe', (conversationId) => {
    if (!/^[a-f0-9-]+$/i.test(conversationId)) {
      return socket.emit('error-msg', 'Invalid conversation ID format');
    }
    
    const transcriptPath = path.join(
      BRAIN_DIR, conversationId,
      '.system_generated', 'logs', 'transcript.jsonl'
    );
    
    if (!fs.existsSync(transcriptPath)) {
      return socket.emit('error-msg', 'Conversation not found');
    }
    
    socket.join(`convo-${conversationId}`);
    console.log(`[Socket] Client ${socket.id} subscribed to conversation: ${conversationId}`);
    
    if (!activeWatchers[conversationId]) {
      console.log(`[Socket] Creating file watcher for conversation: ${conversationId}`);
      
      let lastByteOffset = 0;
      try {
        const stats = fs.statSync(transcriptPath);
        lastByteOffset = stats.size;
      } catch (err) {
        console.error(`[Socket] Error getting stats for ${conversationId}:`, err);
      }
      
      const watcher = chokidar.watch(transcriptPath, {
        usePolling: true,
        interval: 500,
        binaryInterval: 1000,
        ignoreInitial: true,
        depth: 0
      });
      
      watcher.on('change', () => {
        handleTranscriptChange(conversationId, transcriptPath);
      });
      
      watcher.on('error', (err) => {
        console.error(`[Socket] Watcher error for ${conversationId}:`, err);
      });
      
      // Setup tasks directory watcher
      const tasksDir = path.join(BRAIN_DIR, conversationId, '.system_generated', 'tasks');
      fs.mkdirSync(tasksDir, { recursive: true });
      
      console.log(`[Socket] Creating tasks watcher for conversation: ${conversationId}`);
      const tasksWatcher = chokidar.watch(tasksDir, {
        usePolling: true,
        interval: 500,
        binaryInterval: 1000,
        ignoreInitial: true,
        depth: 0
      });
      
      const taskOffsets = {};
      
      tasksWatcher.on('all', (event, filePath) => {
        if (!filePath.endsWith('.log')) return;
        
        const filename = path.basename(filePath);
        const taskId = filename.replace('.log', '');
        
        if (event === 'add' || event === 'change') {
          handleTaskLogChange(conversationId, taskId, filePath, taskOffsets);
        }
      });
      
      activeWatchers[conversationId] = {
        watcher,
        tasksWatcher,
        clients: new Set([socket.id]),
        lastByteOffset
      };
    } else {
      activeWatchers[conversationId].clients.add(socket.id);
    }
  });
  
  socket.on('unsubscribe', (conversationId) => {
    handleUnsubscribe(socket, conversationId);
  });
  
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    for (const conversationId of Object.keys(activeWatchers)) {
      if (activeWatchers[conversationId].clients.has(socket.id)) {
        handleUnsubscribe(socket, conversationId);
      }
    }
  });
});

function handleUnsubscribe(socket, conversationId) {
  socket.leave(`convo-${conversationId}`);
  console.log(`[Socket] Client ${socket.id} unsubscribed from conversation: ${conversationId}`);
  
  const watcherInfo = activeWatchers[conversationId];
  if (watcherInfo) {
    watcherInfo.clients.delete(socket.id);
    if (watcherInfo.clients.size === 0) {
      console.log(`[Socket] Cleaning up inactive file watchers for conversation: ${conversationId}`);
      if (watcherInfo.watcher) watcherInfo.watcher.close();
      if (watcherInfo.tasksWatcher) watcherInfo.tasksWatcher.close();
      delete activeWatchers[conversationId];
    }
  }
}

function handleTranscriptChange(conversationId, transcriptPath) {
  const watcherInfo = activeWatchers[conversationId];
  if (!watcherInfo) return;
  
  try {
    const stats = fs.statSync(transcriptPath);
    const newSize = stats.size;
    const oldOffset = watcherInfo.lastByteOffset;
    
    if (newSize <= oldOffset) {
      watcherInfo.lastByteOffset = newSize;
      return;
    }
    
    const buffer = Buffer.alloc(newSize - oldOffset);
    const fd = fs.openSync(transcriptPath, 'r');
    fs.readSync(fd, buffer, 0, buffer.length, oldOffset);
    fs.closeSync(fd);
    
    watcherInfo.lastByteOffset = newSize;
    
    const chunk = buffer.toString('utf-8');
    const lines = chunk.split('\n').filter(l => l.trim().length > 0);
    const newSteps = [];
    
    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);
        const type = entry.type || '';
        
        if (type !== 'USER_INPUT' && type !== 'PLANNER_RESPONSE') continue;
        
        let messageContent = entry.content || '';
        messageContent = stripXmlTags(messageContent);
        
        newSteps.push({
          step_index: entry.step_index ?? (Date.now() + i),
          source: entry.source || null,
          type,
          status: entry.status || null,
          created_at: entry.created_at || null,
          content: messageContent,
          thinking: entry.thinking || null,
          tool_calls: entry.tool_calls || null,
        });
      } catch (parseErr) {
        // Ignore JSON parsing errors for partial lines
      }
    }
    
    if (newSteps.length > 0) {
      console.log(`[Socket] Emitting ${newSteps.length} new steps to convo-${conversationId}`);
      io.to(`convo-${conversationId}`).emit('new-steps', newSteps);
    }
  } catch (err) {
    console.error(`[Socket] Error reading transcript change for ${conversationId}:`, err);
  }
}

function handleTaskLogChange(conversationId, taskId, filePath, taskOffsets) {
  try {
    const stats = fs.statSync(filePath);
    const newSize = stats.size;
    const oldOffset = taskOffsets[filePath] || 0;
    
    if (newSize <= oldOffset) {
      taskOffsets[filePath] = newSize;
      return;
    }
    
    const buffer = Buffer.alloc(newSize - oldOffset);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, buffer.length, oldOffset);
    fs.closeSync(fd);
    
    taskOffsets[filePath] = newSize;
    
    const chunk = buffer.toString('utf-8');
    if (chunk.trim().length > 0) {
      console.log(`[Socket] Emitting task log delta for ${taskId} in convo-${conversationId}`);
      io.to(`convo-${conversationId}`).emit('task-output', {
        taskId,
        chunk
      });
    }
  } catch (err) {
    console.error(`[Socket] Error reading task log change for ${taskId}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// GET /api/projects
// ---------------------------------------------------------------------------
app.get('/api/projects', (_req, res) => {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) {
      return res.json([]);
    }

    const files = fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith('.json'));
    const projects = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf-8');
        const project = JSON.parse(raw);
        projects.push(project);
      } catch (err) {
        // Skip malformed project files
        console.warn(`Skipping malformed project file: ${file}`, err.message);
      }
    }

    res.json(projects);
  } catch (err) {
    console.error('Error reading projects:', err);
    res.status(500).json({ error: 'Failed to read projects', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/new
// ---------------------------------------------------------------------------
app.post('/api/projects/new', (req, res) => {
  try {
    const { name, folderUri } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required and must be a non-empty string' });
    }
    
    if (!folderUri || typeof folderUri !== 'string' || !folderUri.trim()) {
      return res.status(400).json({ error: 'folderUri is required and must be a non-empty string' });
    }

    const id = crypto.randomUUID();
    
    let formattedUri = folderUri;
    let localPath = folderUri;
    if (!formattedUri.startsWith('file://')) {
      formattedUri = 'file:///' + folderUri.replace(/\\/g, '/').replace(/:/g, '%3A');
      localPath = folderUri;
    } else {
      localPath = decodeURIComponent(folderUri.replace('file:///', '')).replace(/%3A/g, ':');
    }

    // Create the actual project directory if it doesn't exist
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    const newProject = {
      id,
      name: name.trim(),
      projectResources: {
        resources: [
          {
            folderUri: formattedUri
          }
        ]
      },
      settings: {
        fileAccessPolicy: "AGENT_SETTING_POLICY_ALLOW",
        internetPolicy: "AGENT_SETTING_POLICY_ALLOW",
        autoExecutionPolicy: "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER",
        artifactReviewMode: "ARTIFACT_REVIEW_MODE_TURBO"
      }
    };

    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }

    const filePath = path.join(PROJECTS_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(newProject, null, 2), 'utf-8');

    res.json({ success: true, project: newProject });
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({
      error: 'Failed to create new project',
      details: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/conversations
// ---------------------------------------------------------------------------
app.get('/api/conversations', (_req, res) => {
  try {
    if (!fs.existsSync(BRAIN_DIR)) {
      return res.json([]);
    }

    const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
    const conversations = [];
    const titles = getConversationTitles();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const id = entry.name;
      const summary = readFirstTranscriptLine(id);
      const lastInfo = getLastTranscriptTimeAndMessage(id);
      
      conversations.push({
        id,
        title: titles[id] || null,
        firstMessage: summary ? summary.firstMessage : null,
        lastMessage: lastInfo ? lastInfo.lastMessage : null,
        createdAt: summary ? summary.createdAt : null,
        updatedAt: (lastInfo && lastInfo.updatedAt) ? lastInfo.updatedAt : (summary ? summary.createdAt : null),
        projectId: null, // Fetched lazily by client
      });
    }

    // Sort by updatedAt descending (newest activity first)
    conversations.sort((a, b) => {
      if (!a.updatedAt && !b.updatedAt) return 0;
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    res.json(conversations);
  } catch (err) {
    console.error('Error reading conversations:', err);
    res.status(500).json({ error: 'Failed to read conversations', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/conversations/:id
// ---------------------------------------------------------------------------
app.get('/api/conversations/:id', (req, res) => {
  try {
    const conversationId = req.params.id;

    // Basic input validation – conversation IDs are UUIDs
    if (!/^[a-f0-9-]+$/i.test(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID format' });
    }

    const transcriptPath = path.join(
      BRAIN_DIR, conversationId,
      '.system_generated', 'logs', 'transcript.jsonl'
    );

    if (!fs.existsSync(transcriptPath)) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    const steps = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);
        const type = entry.type || '';

        // Filter to only USER_INPUT and PLANNER_RESPONSE for chat view
        if (type !== 'USER_INPUT' && type !== 'PLANNER_RESPONSE') continue;

        let messageContent = entry.content || '';
        messageContent = stripXmlTags(messageContent);

        steps.push({
          step_index: entry.step_index ?? i,
          source: entry.source || null,
          type,
          status: entry.status || null,
          created_at: entry.created_at || null,
          content: messageContent,
          thinking: entry.thinking || null,
          tool_calls: entry.tool_calls || null,
        });
      } catch (parseErr) {
        // Skip malformed lines
        console.warn(`Skipping malformed transcript line ${i} in ${conversationId}`);
      }
    }

    res.json(steps);
  } catch (err) {
    console.error('Error reading conversation:', err);
    res.status(500).json({ error: 'Failed to read conversation', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/conversations/:id/metadata
// ---------------------------------------------------------------------------
app.get('/api/conversations/:id/metadata', (req, res) => {
  try {
    const conversationId = req.params.id;

    if (!/^[a-f0-9-]+$/i.test(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID format' });
    }

    const result = runAgentApi(['agentapi', 'get-conversation-metadata', conversationId]);
    res.json(result);
  } catch (err) {
    console.error('Error fetching conversation metadata:', err);
    res.status(500).json({
      error: 'Failed to fetch conversation metadata',
      details: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/conversations/new
// ---------------------------------------------------------------------------
app.post('/api/conversations/new', (req, res) => {
  try {
    const { prompt, model, projectId } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required and must be a non-empty string' });
    }

    const args = ['agentapi', 'new-conversation'];

    if (model && typeof model === 'string') {
      args.push(`--model=${model}`);
    }

    args.push(prompt);

    const result = runAgentApi(args, true, projectId);
    res.json({ success: true, result });
  } catch (err) {
    console.error('Error creating conversation:', err);
    res.status(500).json({
      error: 'Failed to create new conversation',
      details: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/conversations/:id/message
// ---------------------------------------------------------------------------
app.post('/api/conversations/:id/message', (req, res) => {
  try {
    const conversationId = req.params.id;
    const { content } = req.body;

    if (!/^[a-f0-9-]+$/i.test(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID format' });
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required and must be a non-empty string' });
    }

    const result = runAgentApi(['agentapi', 'send-message', conversationId, content]);
    res.json({ success: true, result });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({
      error: 'Failed to send message',
      details: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/conversations/:id/artifacts
// ---------------------------------------------------------------------------
app.get('/api/conversations/:id/artifacts', (req, res) => {
  try {
    const conversationId = req.params.id;
    if (!/^[a-f0-9-]+$/i.test(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID format' });
    }

    const dirPath = path.join(BRAIN_DIR, conversationId);
    if (!fs.existsSync(dirPath)) {
      return res.json([]);
    }

    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    const artifacts = [];

    for (const file of files) {
      if (file.isDirectory() && file.name !== '.system_generated' && file.name !== 'scratch') {
        continue;
      }
      if (file.isFile() && (file.name.endsWith('.md') || file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.json'))) {
         // skip hidden files
         if (file.name.startsWith('.')) continue;
         const content = file.name.endsWith('.md') ? fs.readFileSync(path.join(dirPath, file.name), 'utf-8') : null;
         artifacts.push({
           name: file.name,
           type: file.name.split('.').pop(),
           content: content
         });
      }
    }
    res.json(artifacts);
  } catch (err) {
    console.error('Error fetching artifacts:', err);
    res.status(500).json({ error: 'Failed to fetch artifacts', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/conversations/:id/artifacts/:filename
// ---------------------------------------------------------------------------
app.get('/api/conversations/:id/artifacts/:filename', (req, res) => {
  try {
    const { id, filename } = req.params;
    if (!/^[a-f0-9-]+$/i.test(id)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    // Basic path traversal prevention
    const safeFilename = path.basename(filename);
    const filePath = path.join(BRAIN_DIR, id, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.download(filePath, safeFilename); // This will prompt download or open in browser depending on type
  } catch (err) {
    console.error('Error serving artifact file:', err);
    res.status(500).json({ error: 'Failed to serve artifact', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------
app.post('/api/upload', (req, res) => {
  try {
    // Increase JSON body limit if using express.json({ limit: '50mb' }), 
    // but default express.json might reject large files. 
    // Wait, let's just write a simple handler.
    const { filename, base64 } = req.body;
    if (!filename || !base64) {
      return res.status(400).json({ error: 'Missing filename or base64 data' });
    }

    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    // Clean base64 string (remove data:image/png;base64, prefix if present)
    const base64Data = base64.replace(/^data:([A-Za-z-+/]+);base64,/, '');
    const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = path.join(uploadDir, `${Date.now()}_${safeName}`);
    
    fs.writeFileSync(filePath, base64Data, 'base64');
    
    res.json({ success: true, path: filePath });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// Fallback – serve index.html for SPA routing
// ---------------------------------------------------------------------------
app.get('*', (_req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Antigravity Mobile Dashboard server running on http://0.0.0.0:${PORT}`);
  console.log(`Static files served from: ${path.join(__dirname, 'public')}`);
});
