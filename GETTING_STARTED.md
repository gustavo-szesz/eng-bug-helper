# Getting Started Guide

## Installation

### 1. Install the Browser Extension

1. Open `chrome://extensions`
2. Toggle **Developer mode** in the top right
3. Click **Load unpacked**
4. Select the `extension/` folder from this project

### 2. Configure the Intake Endpoint (Optional)

To automatically send incidents to your backend:

1. Click the extension icon
2. Go to **Configuration** tab
3. Enter your endpoint URL (e.g., `http://localhost:4020/internal/auto-snapshot`)
4. (Optional) Enter API token if needed
5. Toggle **Auto-send on error detection**
6. Click **Save**

To test locally, run in another terminal:
```bash
npm run intake:serve
```

### 3. Test the Extension

1. Open any website
2. Open DevTools (F12)
3. Go to **Console** tab
4. Type and run: `throw new Error("Test error")`
5. The extension automatically captures it

## Capturing Incidents

### What Gets Captured

- JavaScript errors and unhandled rejections
- Failed GraphQL operations (with operationName, query, variables)
- Fetch and XHR request failures
- Browser context (timezone, online status, viewport, cookies)
- Network request details

### Creating a Snapshot

1. Reproduce the error in your application
2. Click the extension icon
3. Go to **Configuration** tab
4. Click **Create Snapshot**
5. The snapshot appears in the **Data** tab as JSON

## Generating Reports

### From the Browser

1. After creating a snapshot, click **Open Report Generator**
2. A new tab opens with the report builder form
3. Fill in the incident details:
   - **Incident Title**: Automatically filled from page title
   - **Organization ID**: Auto-extracted from URL (pattern: `/org/[id]`)
   - **Client Name**: Your customer or team
   - **Reference Links**: URLs for context (one per line)
   - **Stakeholders**: People to mention (comma or line separated)
   - **Executive Summary**: Plain language description of what happened

4. Click **Generate Report**
5. Review the formatted incident report in the preview
6. Click **Copy to Clipboard**
7. Paste into Slack, Teams, or your incident tracking system

### From the CLI

```bash
# Create snapshot
npm run snapshot -- --input sample-incident.json

# Generate report
npm run report -- --input snapshots/bug-*.json

# Generate Slack thread
npm run thread -- \
  --input reports/bug-*.json \
  --org-id "63c022ce0d2d6f000858c442" \
  --client-name "Acme Corporation" \
  --mentions "@alice,@bob,@dev-team" \
  --useful-links "https://dashboard.example.com/incidents" \
  --description "Payment processing timed out for high-volume transactions"
```

## Report Format

The generated report includes:

```
Incident Report: [Title]

Status: OPEN
Severity: HIGH

Organization ID: [ID]
Client: [Name]
Incident ID: [Snapshot ID]
Captured: [Date and Time]

Stakeholders: @alice @bob

---

Summary:
[Your description]

---

GraphQL Errors:
1. Operation: GetUserProfile
   Status: 504
   Error: Server temporarily unavailable

---

Technical Information:
Total Events: 45
Runtime Errors: 3
Network Calls: 8
Page: Sample App
URL: https://app.example.com/dashboard

Reference Links:
- https://dashboard.example.com/incidents
- https://docs.api.example.com/errors
```

## Features

### Automatic OrgId Detection
The report generator extracts organization ID from URL patterns like `/org/[id]`. You can override it manually if needed.

### Persistent Form
All form data is saved to browser localStorage. If you accidentally close the tab, the data is preserved.

### GraphQL Error Visibility
If any GraphQL operations failed, they are automatically listed with:
- Operation name
- HTTP status code
- Error message

### Copy to Clipboard
One-click copy of the entire formatted report ready to paste into any communication platform.

## Troubleshooting

**Q: Extension doesn't capture errors**
- A: Make sure DevTools is open on the page with the error. The extension listens for JavaScript errors.

**Q: Report page doesn't open**
- A: Check if popups are allowed in your browser. Go to Settings > Privacy > Pop-ups and Redirects.

**Q: Form data disappears after refresh**
- A: Make sure you're not in a private/incognito window. localStorage is disabled in private mode.

**Q: GraphQL errors not showing**
- A: Only GraphQL calls that failed (status >= 400) are captured. Successful calls are not shown.

**Q: "No incident data loaded" message**
- A: You need to create a snapshot in the popup first. Click "Create Snapshot" on the Configuration tab.

## Advanced Usage

### Custom Report Templates

Edit `extension/report.html` to customize the form fields for your organization:

```html
<div class="form-group">
    <label for="customField">Custom Field</label>
    <input id="customField" type="text" />
</div>
```

Then update `extension/report.js` to include it in the report:

```javascript
const customValue = customFieldEl.value.trim();
if (customValue) {
    lines.push(`Custom Field: ${customValue}`);
}
```

### Filtering Events

Modify `extension/background.js` to filter which events are captured:

```javascript
// Only capture errors, not all network requests
const buffer = ensureBuffer(tabId);
buffer.events = buffer.events.filter(e => 
    e.type.includes('error') || e.type.includes('graphql')
);
```

### Sanitization Rules

Edit `src/snapshot.ts` to customize data sanitization:

```typescript
// Add custom sanitization pattern
const sanitizedUrl = url.replace(/apiKey=[^&]*/g, 'apiKey=***');
```

## Best Practices

1. **Use descriptive titles**: "Login flow timeout on production" vs "Error"
2. **Provide context**: Describe what the user was trying to do
3. **Tag stakeholders**: Mention the right people for faster resolution
4. **Include links**: Reference your dashboard, documentation, or monitoring
5. **Clean up sensitive data**: The system auto-masks tokens, but review before sharing

## Support

- Report issues on GitHub
- Check documentation in `/docs`
- See examples in `/examples`
