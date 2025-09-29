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


const express = require('express');
const { body, validationResult } = require('express-validator');
const MerakiAPI = require('../config/meraki');

const router = express.Router();
const merakiAPI = new MerakiAPI();

// Validation middleware for serial numbers
const serialValidation = [
    body('failedSerial')
        .trim()
        .matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i)
        .withMessage('Invalid failed device serial format (should be XXXX-XXXX-XXXX)'),
    body('replacementSerial')
        .trim()
        .matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i)
        .withMessage('Invalid replacement device serial format (should be XXXX-XXXX-XXXX)')
];

// Get all configured organizations
router.get('/organizations', async (req, res) => {
    try {
        const result = await merakiAPI.getAllOrganizationsInfo();
        res.json(result);
    } catch (error) {
        console.error('Organizations endpoint error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve organizations information'
        });
    }
});

// Search device across all organizations
router.get('/search-device/:serial', async (req, res) => {
    try {
        const { serial } = req.params;
        
        // Validate serial format
        if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(serial)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid serial number format (should be XXXX-XXXX-XXXX)'
            });
        }
        
        const result = await merakiAPI.searchDeviceAcrossOrganizations(serial.toUpperCase());
        res.json(result);
    } catch (error) {
        console.error('Device search endpoint error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search for device'
        });
    }
});

// Get organization info (backward compatibility - returns first org)
router.get('/organization', async (req, res) => {
    try {
        const result = await merakiAPI.getOrganizationInfo();
        res.json(result);
    } catch (error) {
        console.error('Organization info endpoint error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve organization information'
        });
    }
});

// Get networks in all organizations
router.get('/networks', async (req, res) => {
    try {
        const result = await merakiAPI.getNetworks();
        res.json(result);
    } catch (error) {
        console.error('Networks endpoint error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve networks information'
        });
    }
});

// Validate devices endpoint
router.post('/validate-devices', serialValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }

    const { failedSerial, replacementSerial } = req.body;
    
    try {
        const result = await merakiAPI.validateDevices(
            failedSerial.toUpperCase(), 
            replacementSerial.toUpperCase()
        );
        res.json(result);
    } catch (error) {
        console.error('Validation endpoint error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during validation'
        });
    }
});

// Replace device endpoint
router.post('/replace-device', serialValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }

    const { failedSerial, replacementSerial } = req.body;
    
    try {
        // First validate devices to get network and organization context
        const validation = await merakiAPI.validateDevices(
            failedSerial.toUpperCase(), 
            replacementSerial.toUpperCase()
        );
        
        if (!validation.success) {
            return res.json(validation);
        }

        // Proceed with replacement using the found organization
        const result = await merakiAPI.replaceDevice(
            failedSerial.toUpperCase(),
            replacementSerial.toUpperCase(),
            validation.networkId,
            validation.organizationId  // Pass the organization ID
        );
        
        res.json(result);
    } catch (error) {
        console.error('Replacement endpoint error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during replacement'
        });
    }
});

// Health check endpoint
router.get('/health', async (req, res) => {
    try {
        // Check all organizations connectivity as part of health check
        const allOrgsInfo = await merakiAPI.getAllOrganizationsInfo();
        
        const accessibleOrgs = allOrgsInfo.organizations.filter(org => org.accessible);
        
        res.json({
            success: true,
            message: 'API is healthy',
            timestamp: new Date().toISOString(),
            organizations: {
                total: allOrgsInfo.organizations.length,
                accessible: accessibleOrgs.length,
                details: allOrgsInfo.organizations.map(org => ({
                    id: org.id,
                    name: org.name,
                    accessible: org.accessible,
                    networkCount: org.networkCount || 0,
                    error: org.error || null
                }))
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'API health check failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;