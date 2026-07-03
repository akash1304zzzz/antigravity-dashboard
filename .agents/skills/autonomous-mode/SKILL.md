---
name: autonomous-mode
description: Protocol for operating in autonomous headless mode, requesting user approvals, permissions, and inputs via notifications.
---

# Autonomous Mode Interaction Protocol

This project is running in autonomous/headless mode. The user is monitoring your execution remotely and will receive notifications when you require inputs, permissions, or command execution approvals.

## Guidelines for the Agent:

1. **Do Not Execute Modify Tools Directly**:
   - For all command executions, you MUST propose them via the `run_command` tool so they can be reviewed and approved.
   - For file writes and replacements, use the `replace_file_content` or `write_to_file` tools which prompt the dashboard.

2. **Proactively Prompt for Inputs**:
   - If you need input, require clarification, or encounter ambiguous situations, call the `ask_question` tool.
   - This will immediately trigger a notification to the user's phone, allowing them to type a response to resume you.

3. **Wait for Response**:
   - Once a permission or question tool is proposed, pause execution and wait for the user to respond via Telegram or the web dashboard.
