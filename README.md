# Meraki AP Replacement Portal

A web-based portal for automating Cisco Meraki access point replacement with complete configuration transfer. This tool streamlines the process of replacing failed access points by automatically copying all settings, configurations, and network positioning to the replacement device.


### Features

🔧 Automated Replacement Process


- Complete configuration transfer from failed to replacement device
- Network positioning and floor plan data transfer
- Device tags and custom settings replication

📡 Multi-Device Support


- Wireless access points (radio settings transfer)
- Automatic device type detection

🎯 Organization-Specific Operation


- Targeted one or multiple organizations for larger enterprises
- Search all configured organizations for the failed device
- Tool will perform replacements within the correct organization context

🔍 Real-time Validation


- Display which organization contains each device during validation
- Serial number format validation
- Device availability verification
- Network conflict detection
- Pre-flight configuration checks

📊 Progress Tracking


- Step-by-step operation monitoring
- Real-time status updates
- Comprehensive error reporting
- Operation audit logging

🛡️ Security & Reliability


- Log operations with organization-specific details
- API rate limiting
- Input validation and sanitization

Prerequisites

- Node.js (v16 or higher)
- Cisco Meraki Dashboard account with API access
- Meraki API key with appropriate permissions
- Access to the target Meraki organization

### Quick Start

1. Clone the Repository

```
git clone https://github.com/eschrive/meraki_ap_rma.git
```
2. Install Dependencies

```
npm install 
```

3. Configure Environment

Edit the .env file with API key and Org ID

```
# Meraki API Configuration
MERAKI_BASE_URL=https://api.meraki.com/api/v1

# Organization-to-API-Key Mapping (format: ORG_ID:API_KEY)
# Single org: MERAKI_ORGS=012345:your_api_key_for_org_012345
# Multiple orgs: MERAKI_ORGS=012345:api_key_1,123456:api_key_2,789012:api_key_3
MERAKI_ORGS=012345:xxxxxxxxxxxxxxxxxxxxxxxxxxx,123456:xxxxxxxxxxxxxxxxxxxxxxxxxxx

# Application Configuration
PORT=3000
NODE_ENV=development

# Optional: Logging
LOG_TO_FILE=true
```

4. Start the Application

```
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

5. Access the Portal

Open your browser to http://localhost:3000


### Getting Your Meraki API Key

Log into your Meraki Dashboard
Navigate to Organization > Settings > Dashboard API access
Enable API access if not already enabled
Click Generate API key
Copy the generated key to your .env file

⚠️ Important: Keep your API key secure and never commit it to version control.


### Usage

Basic Replacement Process: 

1. Enter Serial Numbers
2. Input the failed device serial number (format: XXXX-XXXX-XXXX)
3. Input the replacement device serial number
4. Validate Devices
5. Click "Validate Devices" to verify both devices exist
6. Review device information and configuration preview
7. Execute Replacement
8. Click "Replace Access Point" to start the automated process
9. Monitor progress through the step-by-step interface

### What Gets Transferred

✅ Device Configuration


- hostname (no modifications)
- Device tags and labels
- Physical location and address
- GPS coordinates
- Floor plan positioning

✅ Wireless Settings (for APs)


- Radio configurations
- Power settings
- Channel assignments
- SSID associations

✅ Network Settings


- Management VLAN
- Device notes (with replacement tracking)


## Configuration Options

### Environment Variables

| Variable	| Description	| Default	| Modification Required |
----------- | ----------- | ------- | -------- |
| MERAKI_API_KEY	| Your Meraki Dashboard API key |	- |	✅ |
| MERAKI_ORGANIZATION_ID	| Target organization ID	| - |	✅ |
| MERAKI_BASE_URL |	Meraki API base URL |	https://api.meraki.com/api/v1 |	❌ |
| PORT	| Application port |	3000 |	❌ |
| NODE_ENV	| Environment mode |	development |	❌ |
| LOG_TO_FILE |	Enable file logging |	true |	❌ |