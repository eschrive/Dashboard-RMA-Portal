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


const axios = require('axios');

class MerakiAPI {
    constructor() {
        this.baseURL = process.env.MERAKI_BASE_URL;
        
        // Parse organization-to-API-key mapping from environment variable
        const orgMappings = process.env.MERAKI_ORGS;
        if (!orgMappings) {
            throw new Error('MERAKI_ORGS environment variable is required (format: ORG_ID:API_KEY,ORG_ID:API_KEY)');
        }
        
        // Parse the organization mappings
        this.organizations = new Map();
        this.clients = new Map();
        
        try {
            const mappings = orgMappings.split(',');
            for (const mapping of mappings) {
                const [orgId, apiKey] = mapping.trim().split(':');
                if (!orgId || !apiKey) {
                    throw new Error(`Invalid mapping format: ${mapping}. Expected format: ORG_ID:API_KEY`);
                }
                
                this.organizations.set(orgId.trim(), apiKey.trim());
                
                // Create individual axios client for each organization
                this.clients.set(orgId.trim(), axios.create({
                    baseURL: this.baseURL,
                    headers: {
                        'X-Cisco-Meraki-API-Key': apiKey.trim(),
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }));
            }
        } catch (error) {
            throw new Error(`Failed to parse MERAKI_ORGS: ${error.message}`);
        }
        
        console.log(`🏢 Configured for ${this.organizations.size} organizations: ${Array.from(this.organizations.keys()).join(', ')}`);
        
        // Add interceptors to all clients
        this.setupInterceptors();
    }

    setupInterceptors() {
        for (const [orgId, client] of this.clients) {
            client.interceptors.request.use(
                config => {
                    console.log(`📡 API Request [${orgId}]: ${config.method.toUpperCase()} ${config.url}`);
                    return config;
                },
                error => Promise.reject(error)
            );

            client.interceptors.response.use(
                response => response,
                error => {
                    console.error(`❌ API Error [${orgId}]: ${error.response?.status} ${error.response?.statusText}`);
                    if (error.response?.data?.errors) {
                        console.error(`API Error Details [${orgId}]:`, error.response.data.errors);
                    }
                    return Promise.reject(error);
                }
            );
        }
    }

    // Get client for specific organization
    getClient(organizationId) {
        const client = this.clients.get(organizationId);
        if (!client) {
            throw new Error(`No API client configured for organization ${organizationId}`);
        }
        return client;
    }

    async validateDevices(failedSerial, replacementSerial) {
        try {
            console.log(`🔍 Validating devices across ${this.organizations.size} organizations: ${failedSerial} -> ${replacementSerial}`);
            
            let failedDevice = null;
            let networkId = null;
            let foundOrganizationId = null;
            let foundOrganization = null;

            // Search across all configured organizations
            for (const [orgId, apiKey] of this.organizations) {
                try {
                    console.log(`🏢 Searching organization: ${orgId}`);
                    const client = this.getClient(orgId);
                    
                    // Get organization info
                    const orgResponse = await client.get(`/organizations/${orgId}`);
                    const organization = orgResponse.data;
                    console.log(`   Organization name: ${organization.name}`);

                    // Get networks in this organization
                    const networksResponse = await client.get(`/organizations/${orgId}/networks`);
                    const networks = networksResponse.data;
                    console.log(`   Networks found: ${networks.length}`);

                    // Search for failed device in this organization's networks
                    for (const network of networks) {
                        try {
                            console.log(`🔍 Checking network: ${network.name} (${network.id})`);
                            const deviceResponse = await client.get(`/networks/${network.id}/devices/${failedSerial}`);
                            
                            if (deviceResponse.data) {
                                failedDevice = {
                                    ...deviceResponse.data,
                                    networkName: network.name,
                                    networkId: network.id,
                                    organizationName: organization.name,
                                    organizationId: orgId
                                };
                                networkId = network.id;
                                foundOrganizationId = orgId;
                                foundOrganization = organization;
                                console.log(`✅ Found failed device in organization: ${organization.name}, network: ${network.name}`);
                                break;
                            }
                        } catch (error) {
                            // Device not in this network, continue searching
                            if (error.response?.status === 404) {
                                console.log(`   Device not found in network: ${network.name}`);
                                continue;
                            } else {
                                console.warn(`   Error checking network ${network.name}:`, error.message);
                                continue;
                            }
                        }
                    }

                    if (failedDevice) break;

                } catch (error) {
                    console.warn(`⚠️  Could not access organization ${orgId}:`, error.message);
                    continue;
                }
            }

            if (!failedDevice) {
                throw new Error(`Failed device ${failedSerial} not found in any of the configured organizations: ${Array.from(this.organizations.keys()).join(', ')}`);
            }

            // Validate replacement device in the SAME organization where failed device was found
            console.log(`🔍 Checking inventory for replacement device in organization ${foundOrganizationId}`);
            const client = this.getClient(foundOrganizationId);
            const inventoryResponse = await client.get(`/organizations/${foundOrganizationId}/inventoryDevices`);
            const inventory = inventoryResponse.data;
            
            const replacementDevice = inventory.find(device => device.serial === replacementSerial);

            if (!replacementDevice) {
                throw new Error(`Replacement device ${replacementSerial} not found in organization ${foundOrganization.name} inventory. Device must be in the same organization as the failed device.`);
            }

            console.log(`✅ Found replacement device in inventory: ${replacementDevice.model}`);

            // Check if replacement device is already claimed by a different network
            if (replacementDevice.networkId && replacementDevice.networkId !== networkId) {
                const claimedNetworkResponse = await client.get(`/networks/${replacementDevice.networkId}`);
                throw new Error(`Replacement device is already claimed by network: ${claimedNetworkResponse.data.name}`);
            }

            // Get additional device details for display
            const enhancedFailedDevice = await this.getEnhancedDeviceInfo(failedDevice, foundOrganizationId);
            const enhancedReplacementDevice = {
                ...replacementDevice,
                organizationName: foundOrganization.name
            };

            return {
                success: true,
                devices: {
                    failed: enhancedFailedDevice,
                    replacement: enhancedReplacementDevice
                },
                networkId,
                organizationId: foundOrganizationId,
                organizationName: foundOrganization.name
            };

        } catch (error) {
            console.error('❌ Device validation failed:', error.message);
            return {
                success: false,
                message: this.formatErrorMessage(error)
            };
        }
    }

    async getEnhancedDeviceInfo(device, organizationId) {
        try {
            const client = this.getClient(organizationId);
            const statusResponse = await client.get(`/organizations/${organizationId}/devices/statuses`);
            const deviceStatus = statusResponse.data.find(status => status.serial === device.serial);
            
            return {
                ...device,
                status: deviceStatus?.status || 'unknown',
                lastReportedAt: deviceStatus?.lastReportedAt || null,
                publicIp: deviceStatus?.publicIp || null,
                lanIp: deviceStatus?.lanIp || null
            };
        } catch (error) {
            console.warn('Could not get enhanced device info:', error.message);
            return device;
        }
    }

    async replaceDevice(failedSerial, replacementSerial, networkId, organizationId) {
        const operations = [];
        
        try {
            console.log(`🔄 Starting replacement process in network ${networkId}, organization ${organizationId}`);
            const client = this.getClient(organizationId);
            
            operations.push({ 
                step: 1, 
                message: "Retrieving failed device configuration", 
                status: "in-progress",
                timestamp: new Date().toISOString()
            });
            
            // Get failed device details
            const failedDeviceResponse = await client.get(`/networks/${networkId}/devices/${failedSerial}`);
            const failedDevice = failedDeviceResponse.data;
            console.log(`📋 Retrieved configuration for: ${failedDevice.name || failedSerial}`);

            // Get radio settings (if wireless device)
            let radioSettings = null;
            try {
                const radioResponse = await client.get(`/networks/${networkId}/devices/${failedSerial}/wireless/radio/settings`);
                radioSettings = radioResponse.data;
                console.log(`📡 Retrieved wireless radio settings`);
            } catch (error) {
                if (error.response?.status === 404) {
                    console.log('ℹ️  Device has no wireless radio settings (not a wireless device)');
                } else {
                    console.warn('⚠️  Could not retrieve radio settings:', error.message);
                }
            }

            // Get switch port settings (if switch device)
            let switchPorts = null;
            try {
                const switchResponse = await client.get(`/networks/${networkId}/devices/${failedSerial}/switch/ports`);
                switchPorts = switchResponse.data;
                console.log(`🔌 Retrieved switch port settings`);
            } catch (error) {
                if (error.response?.status === 404) {
                    console.log('ℹ️  Device has no switch port settings (not a switch device)');
                } else {
                    console.warn('⚠️  Could not retrieve switch port settings:', error.message);
                }
            }

            operations[0].status = "completed";
            operations.push({ 
                step: 2, 
                message: "Claiming replacement device to network", 
                status: "in-progress",
                timestamp: new Date().toISOString()
            });

            // Claim replacement device to the network
            try {
                await client.post(`/networks/${networkId}/devices/claim`, {
                    serials: [replacementSerial]
                });
                console.log(`✅ Claimed device ${replacementSerial} to network`);
            } catch (error) {
                if (error.response?.data?.errors?.[0]?.includes('already claimed')) {
                    console.log('ℹ️  Device already claimed in this network');
                } else {
                    throw error;
                }
            }

            operations[1].status = "completed";
            operations.push({ 
                step: 3, 
                message: "Applying configuration to replacement device", 
                status: "in-progress",
                timestamp: new Date().toISOString()
            });

            // Apply configuration to replacement device - COPY EXACT HOSTNAME
            const configData = {};

            // Copy the exact name/hostname if it exists
            if (failedDevice.name && failedDevice.name.trim() !== '') {
                configData.name = failedDevice.name;
                console.log(`📝 Copying hostname: "${failedDevice.name}"`);
            } else {
                // Only use serial as fallback if no name exists
                configData.name = replacementSerial;
                console.log(`📝 No hostname found, using serial: ${replacementSerial}`);
            }

            // Copy other configuration elements
            if (failedDevice.tags && failedDevice.tags.length > 0) {
                configData.tags = failedDevice.tags;
                console.log(`🏷️  Copying tags: ${failedDevice.tags.join(', ')}`);
            }

            if (failedDevice.address && failedDevice.address.trim() !== '') {
                configData.address = failedDevice.address;
                console.log(`📍 Copying address: ${failedDevice.address}`);
            }

            if (failedDevice.lat && failedDevice.lng) {
                configData.lat = failedDevice.lat;
                configData.lng = failedDevice.lng;
                console.log(`🗺️  Copying coordinates: ${failedDevice.lat}, ${failedDevice.lng}`);
            }

            if (failedDevice.floorPlanId) {
                configData.floorPlanId = failedDevice.floorPlanId;
                console.log(`🏢 Copying floor plan ID: ${failedDevice.floorPlanId}`);
            }

            // Add notes to track the replacement (but don't change the hostname)
            const originalNotes = failedDevice.notes || '';
            const replacementNote = `[Replaced ${failedSerial} on ${new Date().toISOString()}]`;
            
            if (originalNotes.trim() !== '') {
                configData.notes = `${originalNotes} ${replacementNote}`;
            } else {
                configData.notes = replacementNote;
            }

            // Apply the configuration
            await client.put(`/networks/${networkId}/devices/${replacementSerial}`, configData);
            console.log(`✅ Applied configuration to replacement device with hostname: "${configData.name}"`);

            // Apply radio settings if available
            if (radioSettings) {
                try {
                    await client.put(`/networks/${networkId}/devices/${replacementSerial}/wireless/radio/settings`, radioSettings);
                    console.log('✅ Applied wireless radio settings');
                } catch (error) {
                    console.warn('⚠️  Failed to apply radio settings:', error.message);
                }
            }

            // Apply switch port settings if available
            if (switchPorts && switchPorts.length > 0) {
                try {
                    for (const port of switchPorts) {
                        const portConfig = { ...port };
                        delete portConfig.portId; // Remove read-only field
                        
                        await client.put(`/networks/${networkId}/devices/${replacementSerial}/switch/ports/${port.portId}`, portConfig);
                    }
                    console.log('✅ Applied switch port settings');
                } catch (error) {
                    console.warn('⚠️  Failed to apply switch port settings:', error.message);
                }
            }

            operations[2].status = "completed";
            operations.push({ 
                step: 4, 
                message: "Removing failed device from network", 
                status: "in-progress",
                timestamp: new Date().toISOString()
            });

            // Remove failed device from network
            await client.post(`/networks/${networkId}/devices/${failedSerial}/remove`);
            console.log(`✅ Removed failed device ${failedSerial} from network`);

            operations[3].status = "completed";

            // Log successful operation with hostname info
            this.logOperation('SUCCESS', {
                organizationId,
                networkId,
                failedSerial,
                replacementSerial,
                hostnameTransferred: configData.name,
                originalHostname: failedDevice.name || 'None',
                configurationApplied: {
                    basic: true,
                    hostname: true,
                    wireless: !!radioSettings,
                    switch: !!switchPorts
                },
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                message: `Device replacement completed successfully in organization ${organizationId}`,
                operations,
                summary: {
                    failedDevice: failedSerial,
                    replacementDevice: replacementSerial,
                    networkId,
                    organizationId,
                    hostnameTransferred: configData.name,
                    configurationTypes: [
                        `Hostname: "${configData.name}"`,
                        'Device location and tags',
                        ...(radioSettings ? ['Wireless radio settings'] : []),
                        ...(switchPorts ? ['Switch port settings'] : [])
                    ]
                }
            };

        } catch (error) {
            console.error('❌ Replacement failed:', error.message);
            
            // Mark current operation as failed
            if (operations.length > 0) {
                operations[operations.length - 1].status = "failed";
                operations[operations.length - 1].error = error.message;
            }
            
            // Log failed operation
            this.logOperation('FAILED', {
                organizationId,
                networkId,
                failedSerial,
                replacementSerial,
                error: error.message,
                timestamp: new Date().toISOString()
            });

            return {
                success: false,
                message: this.formatErrorMessage(error),
                operations
            };
        }
    }

    formatErrorMessage(error) {
        if (error.response?.data?.errors) {
            return error.response.data.errors[0];
        }
        
        if (error.response?.status === 404) {
            return 'Resource not found. Please check the serial numbers and organization access.';
        }
        
        if (error.response?.status === 403) {
            return 'Access forbidden. Please check API key permissions for this organization.';
        }
        
        if (error.response?.status === 429) {
            return 'Rate limit exceeded. Please try again in a moment.';
        }
        
        return error.message;
    }

    logOperation(status, details) {
        const logEntry = {
            status,
            timestamp: new Date().toISOString(),
            ...details
        };
        
        if (process.env.LOG_TO_FILE === 'true') {
            const fs = require('fs');
            const path = require('path');
            
            try {
                const logFile = path.join(__dirname, '../logs/operations.log');
                fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
            } catch (error) {
                console.error('Failed to write to log file:', error.message);
            }
        }
        
        console.log(`📝 Operation logged: ${status}`, details);
    }

    // Get all configured organizations info
    async getAllOrganizationsInfo() {
        const organizations = [];
        
        for (const [orgId, apiKey] of this.organizations) {
            try {
                const client = this.getClient(orgId);
                const orgResponse = await client.get(`/organizations/${orgId}`);
                const networksResponse = await client.get(`/organizations/${orgId}/networks`);
                
                organizations.push({
                    id: orgId,
                    name: orgResponse.data.name,
                    url: orgResponse.data.url,
                    networkCount: networksResponse.data.length,
                    accessible: true,
                    apiKeyMasked: `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`
                });
            } catch (error) {
                organizations.push({
                    id: orgId,
                    name: 'Unknown',
                    accessible: false,
                    error: this.formatErrorMessage(error),
                    apiKeyMasked: `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`
                });
            }
        }
        
        return {
            success: true,
            organizations
        };
    }

    // Search for a device across all organizations
    async searchDeviceAcrossOrganizations(serial) {
        const results = [];
        
        for (const [orgId, apiKey] of this.organizations) {
            try {
                const client = this.getClient(orgId);
                const orgResponse = await client.get(`/organizations/${orgId}`);
                const organization = orgResponse.data;
                
                const networksResponse = await client.get(`/organizations/${orgId}/networks`);
                const networks = networksResponse.data;

                for (const network of networks) {
                    try {
                        const deviceResponse = await client.get(`/networks/${network.id}/devices/${serial}`);
                        if (deviceResponse.data) {
                            results.push({
                                device: deviceResponse.data,
                                organizationId: orgId,
                                organizationName: organization.name,
                                networkId: network.id,
                                networkName: network.name
                            });
                        }
                    } catch (error) {
                        // Device not in this network, continue
                        continue;
                    }
                }
            } catch (error) {
                console.warn(`Could not search organization ${orgId}:`, error.message);
                continue;
            }
        }
        
        return {
            success: true,
            results,
            found: results.length > 0
        };
    }

    // Method to get first accessible organization info (backward compatibility)
    async getOrganizationInfo() {
        try {
            // Try to get info from the first organization
            const [firstOrgId] = this.organizations.keys();
            const client = this.getClient(firstOrgId);
            const response = await client.get(`/organizations/${firstOrgId}`);
            return {
                success: true,
                organization: response.data
            };
        } catch (error) {
            return {
                success: false,
                message: this.formatErrorMessage(error)
            };
        }
    }

    // Method to get networks from all organizations
    async getNetworks() {
        try {
            let allNetworks = [];
            
            for (const [orgId, apiKey] of this.organizations) {
                try {
                    const client = this.getClient(orgId);
                    const response = await client.get(`/organizations/${orgId}/networks`);
                    const orgNetworks = response.data.map(network => ({
                        ...network,
                        organizationId: orgId
                    }));
                    allNetworks = allNetworks.concat(orgNetworks);
                } catch (error) {
                    console.warn(`Could not get networks for organization ${orgId}:`, error.message);
                    continue;
                }
            }
            
            return {
                success: true,
                networks: allNetworks
            };
        } catch (error) {
            return {
                success: false,
                message: this.formatErrorMessage(error)
            };
        }
    }
}

module.exports = MerakiAPI;