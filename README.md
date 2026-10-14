# Meta Lead Outreach Automation

A multilingual lead-management automation that connects **Meta Lead Ads**, **Google Sheets**, **Google Apps Script**, and **Gmail**.

This repository is a sanitized reference implementation based on a production retail-partner lead workflow.

## Architecture

```text
Meta Lead Ads
      ↓
Google Sheets Raw Tabs
      ↓
Lead Normalization + Deduplication
      ↓
Master Leads
      ↓
Language Routing
      ↓
Automated Gmail Outreach
      ↓
Human Follow-Up
```

## Features

- Collects leads from multiple localized Meta Instant Forms
- Supports English, French, Japanese, Korean, and Arabic
- Consolidates all new leads into one `Master Leads` sheet
- Deduplicates using Meta Lead ID and normalized email
- Ignores Meta-generated test leads
- Routes outreach by language
- Sends Gmail messages from Apps Script
- Marks successful sends with `Email Sent = YES`
- Stores an `Email Sent At` timestamp
- Uses scheduled triggers for unattended execution
- Keeps human follow-up after the automated first touch

## Stack

- Meta Lead Ads / Instant Forms
- Google Sheets
- Google Apps Script (JavaScript)
- Gmail

## Sheet structure

Use one workbook with these tabs:

```text
English Raw
French Raw
Japanese Raw
Korean Raw
Arabic Raw
Master Leads
```

Each Meta form should write to its matching Raw tab.

**Do not point Meta directly at `Master Leads`.**

## Master Leads columns

| Column | Header |
|---|---|
| A | Meta Lead ID |
| B | Created Time |
| C | Full Name |
| D | Email |
| E | Business / Store Name |
| F | Language |
| G | Campaign |
| H | Ad Set |
| I | Form Name |
| J | Email Sent |
| K | Email Sent At |
| L | Replied |
| M | Replied At |
| N | Status |
| O | Notes |

A ready-to-import header file is included as `sample-sheet-structure.csv`.

## Setup

### 1. Connect Meta forms to Google Sheets

Create one mapping per localized form:

```text
English form  -> English Raw
French form   -> French Raw
Japanese form -> Japanese Raw
Korean form   -> Korean Raw
Arabic form   -> Arabic Raw
```

### 2. Add Apps Script

Open the spreadsheet:

```text
Extensions -> Apps Script
```

Paste the contents of `Code.gs`.

Update:

```javascript
CONFIG.BRAND_NAME
```

and the Raw tab names if needed.

### 3. Authorize

Run manually once:

```javascript
syncMetaLeadsToMaster()
sendRetailLeadEmails()
```

Google will request the necessary permissions.

### 4. Add triggers

Recommended:

#### Lead sync

```text
Function: syncMetaLeadsToMaster
Event source: Time-driven
Frequency: Every 5 minutes
```

#### Email outreach

```text
Function: sendRetailLeadEmails
Event source: Time-driven
Frequency: Every 15 minutes
```

The default batch cap is:

```javascript
MAX_EMAILS_PER_RUN: 10
```

Adjust it according to your own sending policy and Google Workspace limits.

## Sender account

Installable Apps Script triggers run as the Google account that created the trigger.

If outreach must come from a specific business inbox, create the `sendRetailLeadEmails` trigger while logged into that account.

## Duplicate protection

The lead sync checks:

```text
Meta Lead ID
+
normalized email
```

The email workflow also checks emails already marked:

```text
Email Sent = YES
```

to avoid intentionally sending the same first-touch message again.

## Testing

Before enabling the email trigger:

1. Change the recipient inside `testAutomatedRetailEmail()`.
2. Run it manually.
3. Confirm sender, subject, body, and inbox placement.
4. Temporarily lower `MAX_EMAILS_PER_RUN`.
5. Run `sendRetailLeadEmails()` manually.
6. Verify `Email Sent` and `Email Sent At` update only after successful sends.

## Security and privacy

Never commit:

- real customer names
- real customer emails
- exported lead CSVs
- Meta account IDs
- Meta form IDs
- Google Sheet IDs
- access tokens
- credentials
- API secrets

This repository intentionally contains none of those values.

## Production design notes

The Raw-tab / Master-tab separation is intentional. It makes it easier to:

- audit source data
- recover from mapping mistakes
- re-run consolidation safely
- preserve one clean CRM-style lead table
- troubleshoot Meta integrations without losing historical leads

## Possible next improvements

- Detect Gmail replies and set `Replied = YES`
- Send follow-ups only to leads with no reply
- Add store name / website as higher-intent fields
- Send qualified-lead events back to Meta
- Add reply-rate and qualified-lead reporting
- Add retry logic and failure alerts
- Move configuration to Script Properties

## License

MIT
