# CLAUDE.md — DentalCP Repository Rules

This file is loaded automatically every Claude Code session. All rules below are mandatory.

## HIPAA Compliance

This repository serves a pediatric dental practice. HIPAA rules apply at all times.

### Never do the following:
- Store, log, display, or output any patient data (names, DOB, insurance, treatment records, contact info)
- Write code that persists form submissions locally or in the repo
- Commit any file that could contain Protected Health Information (PHI)
- Log PHI to the console, a file, or any third-party service
- Send patient data to any third party without explicit written instruction from the user

### Always do the following:
- Treat any data submitted through appointment or records forms as PHI
- Flag any code that transmits data to external services for explicit review before implementing
- Confirm data handling before building any feature that touches patient input

## Security Rules

### Credentials and secrets:
- Never write API keys, passwords, tokens, or secrets directly in code
- All secrets must use environment variables only (`process.env.NAME`)
- Never read, display, or echo the contents of `.env`
- Never suggest committing `.env` or any file containing credentials
- If a secret is accidentally exposed in code, flag it immediately and stop

### Before every commit:
- Confirm no credentials are staged
- Confirm no PHI is staged
- Confirm `.env` is not staged

### Files never to touch:
- `.env` — blocked by deny rule, do not attempt to read
- `secrets.txt` — do not read or modify
- `credentials.json` — do not read or modify

## Code Changes

- Do not add third-party scripts, pixels, or tracking without explicit approval
- Any new external API integration must be reviewed before implementation
- Form handling code must never store submissions in the repo or in client-side storage

## If in doubt:
Stop and ask. Do not guess on anything touching patient data or credentials.
