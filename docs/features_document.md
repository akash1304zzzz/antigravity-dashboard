# Features Specification Document: Antigravity Mobile Dashboard

This document details the functional specifications and interface features implemented in the Antigravity Mobile Command Center.

---

## 1. Core Interface & Navigation

### 1.1 Responsive Mobile Layout
* **Adaptive Drawer**: On desktop, the project/conversation sidebar is pinned. On mobile devices, the sidebar transitions off-screen and can be toggled using a hamburger menu button.
* **Glassmorphism Theme**: Uses a sleek, dark-mode CSS theme built with blur filters (`backdrop-filter: blur()`), vibrant gradient accents, and custom font sizing optimizing mobile display real estate.
* **Loading Shimmers**: Integrated skeleton layouts that display during network fetches to ensure a high-fidelity visual experience.

### 1.2 System Status & Metrics
* **Dashboard Counters**: Real-time counter widgets displaying the total number of local projects and conversations found.
* **System Status Indicator**: Displays a heartbeat status checking Express API connectivity (Online/Offline state).

---

## 2. Conversation & Agent Management

### 2.1 Project-Specific Workspaces
* **Project Directory Registration**: Users can quickly register a workspace folder uri with options to create directories locally or map existing ones.
* **Launch Scope**: Starting a new conversation allows selecting an associated workspace project, automatically assigning path access policies to the spawned AI agent.

### 2.2 Model Selection & Quota Limits
* **Model Dropdown**: Toggle chat models on-the-fly when starting sessions or posting messages:
  - **Pro (Recommended)**: Balanced logic and coding capability.
  - **Flash**: Optimized for speed and short tasks.
  - **Flash Lite**: Ultra-lightweight and cost-efficient.
* **Model Quota Panel**: An expandable quota card detailing request counts, remaining tokens, and warning states.

---

## 3. Remote Execution Controls & Chat View

### 3.1 Expandable Thinking Blocks
* AI agent inner reasoning processes and tool calls are separated from text responses.
* The frontend parses thinking segments into expandable blocks, keeping the chat clean while allowing developers to drill down into the agent's exact logs and commands if troubleshooting.

### 3.2 Quick Action Pills
A floating command bar containing quick-reply pills allows the user to respond to agent confirmation queries with a single tap:
* **✓ Allow**: Sends the `Allow` confirmation to approve shell commands or file operations.
* **✕ Deny**: Rejects the agent's pending operation.
* **⏹ Stop**: Interrupts the agent execution and cancels the active terminal task.

### 3.3 File Attachments & Uploads
* A paperclip attachment button triggers native mobile file selectors.
* Uploaded files (images, logs, documents) are encoded in base64 format and sent to the `/api/upload` endpoint, saving them in the `uploads/` folder to be processed by the agent.

---

## 4. Artifact Management

### 4.1 Artifacts Explorer
* Click the file folder icon in the top header bar to inspect all artifacts (markdown plans, code files, diagrams, or generated mockups) produced in the active conversation thread.
* Displays preview summaries of markdown documentation.

### 4.2 Local Download Portal
* File download cards trigger browser downloads straight to the host machine or mobile storage.
* Bypasses auth credentials securely using unguessable 128-bit UUID directories, ensuring smooth mobile image rendering.

---

## 5. Web Terminal Gateway

### 5.1 Real-Time Terminal Sharing (`ttyd`)
* Runs an interactive shell on your browser, rendering a canvas-based console that lets you run git, compile programs, or manage files.
* Binds natively to the local wireless adapter, facilitating easy connections from secondary devices (tablets, smartphones) on the same subnet.
