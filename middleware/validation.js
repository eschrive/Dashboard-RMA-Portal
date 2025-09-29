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


const { validationResult } = require('express-validator');

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.stack);
    
    // Handle different types of errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: err.errors
        });
    }
    
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        return res.status(503).json({
            success: false,
            message: 'Service temporarily unavailable. Please try again later.'
        });
    }
    
    // Default error response
    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message
    });
};

// Validation result checker middleware
const checkValidationResult = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

module.exports = {
    errorHandler,
    checkValidationResult
};