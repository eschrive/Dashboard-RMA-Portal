/**
 * @module meraki_ap_rma
 * @author Eric Schriver <eschrive@cisco.com>
 * @copyright Copyright (c) 2025 Cisco and/or its affiliates.
 * @license Cisco Sample Code License, Version 1.1
 */

/**
 * @license
 * Copyright (c) 2025 Cisco and/or its affiliates.
 *
 * This software is licensed to you under the terms of the Cisco Sample
 * Code License, Version 1.1 (the "License"). You may obtain a copy of the
 * License at
 *
 *                https://developer.cisco.com/docs/licenses
 *
 * All use of the material herein must be in accordance with the terms of
 * the License. All rights not expressly granted by the License are
 * reserved. Unless required by applicable law or agreed to separately in
 * writing, software distributed under the License is distributed on an "AS
 * IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied.
 */


require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import custom modules
const apiRoutes = require('./routes/api');
const { errorHandler } = require('./middleware/validation');
const MerakiAPI = require('./config/meraki');

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Disable CSP for development
}));
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    }
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API routes
app.use('/api', apiRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Verify organization access on startup
async function verifyOrganizationAccess() {
    try {
        if (!process.env.MERAKI_ORGS) {
            console.warn('⚠️  WARNING: Missing required environment variable');
            console.warn('   MERAKI_ORGS must be set with format: ORG_ID:API_KEY,ORG_ID:API_KEY');
            return false;
        }

        const merakiAPI = new MerakiAPI();
        const allOrgsInfo = await merakiAPI.getAllOrganizationsInfo();
        
        if (allOrgsInfo.success) {
            console.log(`✅ Multi-organization setup verified:`);
            allOrgsInfo.organizations.forEach(org => {
                if (org.accessible) {
                    console.log(`   ✅ ${org.name} (ID: ${org.id}) - ${org.networkCount} networks - API Key: ${org.apiKeyMasked}`);
                } else {
                    console.log(`   ❌ Organization ${org.id} - ${org.error} - API Key: ${org.apiKeyMasked}`);
                }
            });
            
            const accessibleOrgs = allOrgsInfo.organizations.filter(org => org.accessible);
            if (accessibleOrgs.length === 0) {
                console.error('❌ No organizations are accessible! Please check API keys and permissions.');
                return false;
            }
            
            console.log(`🔑 Using ${accessibleOrgs.length} API keys for ${accessibleOrgs.length} organizations`);
            return true;
        } else {
            console.error('❌ Failed to verify organizations:', allOrgsInfo.message);
            return false;
        }
    } catch (error) {
        console.error('❌ Organization verification failed:', error.message);
        return false;
    }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log('🚀 Meraki AP Replacement Portal (Multi-Org) started successfully!');
    console.log(`📱 Server running on: http://localhost:${PORT}`);
    console.log(`🔧 API endpoints available at: http://localhost:${PORT}/api`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log('---');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    const orgMappings = process.env.MERAKI_ORGS;
    if (orgMappings) {
        const orgCount = orgMappings.split(',').length;
        console.log(`🔑 Configured for ${orgCount} organizations with  API keys`);
    }
    
    console.log('---');
    
    // Verify organization access
    await verifyOrganizationAccess();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
    process.exit(1);
});

module.exports = app;