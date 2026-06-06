const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const app = express();
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
  };

  if (projectId) {
    options.env = { ...process.env, ANTIGRAVITY_PROJECT_ID: projectId };
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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

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
app.listen(PORT, () => {
  console.log(`Antigravity Mobile Dashboard server running on http://localhost:${PORT}`);
  console.log(`Static files served from: ${path.join(__dirname, 'public')}`);
});
