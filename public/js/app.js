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


class MerakiReplacementPortal {
    constructor() {
        this.apiBaseUrl = '/api';
        this.validationState = {
            failedSerial: false,
            replacementSerial: false
        };
        this.organizations = [];
        this.initializeEventListeners();
        this.checkAPIHealth();
        this.loadOrganizations();
    }
    
    initializeEventListeners() {
        // Form submission
        document.getElementById('replacementForm').addEventListener('submit', (e) => this.handleReplacement(e));
        
        // Button clicks
        document.getElementById('validateBtn').addEventListener('click', () => this.validateDevices());
        
        // Real-time serial validation
        document.getElementById('failedSerial').addEventListener('input', (e) => this.handleSerialInput(e, 'failed'));
        document.getElementById('replacementSerial').addEventListener('input', (e) => this.handleSerialInput(e, 'replacement'));
        
        // Format serial numbers as user types
        ['failedSerial', 'replacementSerial'].forEach(id => {
            document.getElementById(id).addEventListener('keyup', this.formatSerialNumber);
        });
    }
    
    formatSerialNumber(event) {
        let value = event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        
        if (value.length > 4 && value.length <= 8) {
            value = value.slice(0, 4) + '-' + value.slice(4);
        } else if (value.length > 8) {
            value = value.slice(0, 4) + '-' + value.slice(4, 8) + '-' + value.slice(8, 12);
        }
        
        event.target.value = value;
    }
    
    handleSerialInput(event, type) {
        const input = event.target;
        const isValid = this.validateSerialFormat(input.value);
        
        // Update validation state
        this.validationState[type + 'Serial'] = isValid;
        
        // Update UI
        input.classList.toggle('is-valid', isValid && input.value.length > 0);
        input.classList.toggle('is-invalid', !isValid && input.value.length > 0);
        
        // Update button states
        this.updateButtonStates();
    }
    
    validateSerialFormat(serial) {
        const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
        return pattern.test(serial.trim().toUpperCase());
    }
    
    updateButtonStates() {
        const validateBtn = document.getElementById('validateBtn');
        const replaceBtn = document.getElementById('replaceBtn');
        
        const bothValid = this.validationState.failedSerial && this.validationState.replacementSerial;
        
        validateBtn.disabled = !bothValid;
        // Replace button is enabled only after successful validation
    }
    
    async checkAPIHealth() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`);
            const result = await response.json();
            
            if (result.success) {
                console.log('✅ API is healthy');
                
                // Display multi-organization status
                if (result.organizations) {
                    const accessibleCount = result.organizations.accessible;
                    const totalCount = result.organizations.total;
                    
                    if (accessibleCount > 0) {
                        this.showAlert(
                            `🏢 Connected to ${accessibleCount}/${totalCount} Meraki organizations. Ready for multi-organization device replacement.`, 
                            'info'
                        );
                    } else {
                        this.showAlert(
                            `❌ No organizations are accessible. Please check API key permissions.`, 
                            'warning'
                        );
                    }
                }
            }
        } catch (error) {
            console.error('❌ API health check failed:', error);
            this.showAlert('API connection failed. Please check if the server is running.', 'danger');
        }
    }
    
    async loadOrganizations() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/organizations`);
            const result = await response.json();
            
            if (result.success) {
                this.organizations = result.organizations;
                this.displayOrganizations(result.organizations);
            } else {
                console.error('Failed to load organizations');
                this.displayOrganizationError();
            }
        } catch (error) {
            console.error('Error loading organizations:', error);
            this.displayOrganizationError();
        }
    }
    
    // Update the displayOrganizations method to show API key info
displayOrganizations(organizations) {
    const organizationsList = document.getElementById('organizationsList');
    
    if (organizations.length === 0) {
        organizationsList.innerHTML = `
            <div class="alert alert-warning mb-0">
                No organizations configured. Please check your environment configuration.
            </div>
        `;
        return;
    }
    
    let html = '<div class="row g-3">';
    
    organizations.forEach(org => {
        const statusClass = org.accessible ? 'org-status-accessible' : 'org-status-inaccessible';
        const statusIcon = org.accessible ? '✅' : '❌';
        
        html += `
            <div class="col-md-6 col-lg-4">
                <div class="org-status ${statusClass}">
                    <div class="org-icon">${statusIcon}</div>
                    <div class="org-details">
                        <div class="org-name">${org.name}</div>
                        <div class="org-meta">
                            ID: ${org.id}<br>
                            API Key: <code>${org.apiKeyMasked}</code>
                            ${org.accessible ? 
                                `<br><span class="network-count-badge">${org.networkCount} networks</span>` : 
                                `<br><small class="text-danger">Error: ${org.error}</small>`
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    // Add summary
    const accessibleCount = organizations.filter(org => org.accessible).length;
    const totalNetworks = organizations.reduce((sum, org) => sum + (org.networkCount || 0), 0);
    
    html += `
        <div class="mt-3 p-3 bg-light rounded">
            <small class="text-muted">
                📊 Summary: ${accessibleCount}/${organizations.length} organizations accessible • 
                ${totalNetworks} total networks
            </small>
        </div>
    `;
    
    organizationsList.innerHTML = html;
}
    
    displayOrganizationError() {
        const organizationsList = document.getElementById('organizationsList');
        organizationsList.innerHTML = `
            <div class="alert alert-danger mb-0">
                <strong>❌ Failed to load organizations</strong><br>
                Please check your API key and organization configuration.
            </div>
        `;
    }
    
    async validateDevices() {
        const failedSerial = document.getElementById('failedSerial').value.trim().toUpperCase();
        const replacementSerial = document.getElementById('replacementSerial').value.trim().toUpperCase();
        
        if (!this.validateSerialFormat(failedSerial) || !this.validateSerialFormat(replacementSerial)) {
            this.showAlert('Please enter valid serial numbers in XXXX-XXXX-XXXX format', 'warning');
            return;
        }
        
        if (failedSerial === replacementSerial) {
            this.showAlert('Failed and replacement serial numbers cannot be the same', 'warning');
            return;
        }
        
        this.setButtonLoading('validateBtn', true);
        this.showProgress('Validating devices across organizations...', 25);
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/validate-devices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ failedSerial, replacementSerial })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.displayDeviceInformation(result.devices, result.organizationName);
                document.getElementById('replaceBtn').disabled = false;
                this.showAlert(
                    `✅ Devices validated successfully in organization: <strong>${result.organizationName}</strong>! Ready for replacement.`, 
                    'success'
                );
            } else {
                this.showAlert(`❌ Validation failed: ${result.message}`, 'danger');
                document.getElementById('replaceBtn').disabled = true;
            }
        } catch (error) {
            console.error('Validation error:', error);
            this.showAlert(`❌ Error validating devices: ${error.message}`, 'danger');
        } finally {
            this.setButtonLoading('validateBtn', false);
            this.hideProgress();
        }
    }
    
    async handleReplacement(event) {
        event.preventDefault();
        
        const failedSerial = document.getElementById('failedSerial').value.trim().toUpperCase();
        const replacementSerial = document.getElementById('replacementSerial').value.trim().toUpperCase();
        
        // Confirmation dialog
        if (!confirm(`⚠️ CONFIRMATION REQUIRED\n\nThis will:\n• Remove ${failedSerial} from the network\n• Add ${replacementSerial} with copied settings\n\nProceed with replacement?`)) {
            return;
        }
        
        this.setButtonLoading('replaceBtn', true);
        document.getElementById('validateBtn').disabled = true;
        
        this.showProgress('Starting multi-organization replacement process...', 0);
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/replace-device`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ failedSerial, replacementSerial })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showOperationSteps(result.operations);
                this.showAlert('🎉 Access point replacement completed successfully!', 'success');
                
                // Show summary if available
                if (result.summary) {
                    this.showReplacementSummary(result.summary);
                }
                
                // Auto-reset form after successful replacement
                setTimeout(() => this.resetForm(), 5000);
            } else {
                this.showAlert(`❌ Replacement failed: ${result.message}`, 'danger');
                if (result.operations) {
                    this.showOperationSteps(result.operations);
                }
            }
        } catch (error) {
            console.error('Replacement error:', error);
            this.showAlert(`❌ Error during replacement: ${error.message}`, 'danger');
        } finally {
            this.setButtonLoading('replaceBtn', false);
            document.getElementById('validateBtn').disabled = false;
            this.hideProgress();
        }
    }
    
    displayDeviceInformation(devices, organizationName) {
        const failedInfo = document.getElementById('failedDeviceInfo');
        const replacementInfo = document.getElementById('replacementDeviceInfo');
        
        // Failed device info
        const failedHostname = devices.failed.name || 'Not set';
        failedInfo.innerHTML = `
            <div class="device-info-item">
                <span class="device-info-label">Hostname:</span> 
                <code class="bg-light p-1 rounded">${failedHostname}</code>
            </div>
            <div class="device-info-item">
                <span class="device-info-label">Model:</span> ${devices.failed.model || 'Unknown'}
            </div>
            <div class="device-info-item">
                <span class="device-info-label">Organization:</span> 
                <strong>${devices.failed.organizationName || organizationName}</strong>
            </div>
            <div class="device-info-item">
                <span class="device-info-label">Network:</span> ${devices.failed.networkName || 'Unknown'}
            </div>
            <div class="device-info-item">
                <span class="device-info-label">Status:</span> 
                <span class="badge bg-danger">Offline/Failed</span>
            </div>
            <div class="device-info-item">
                <span class="device-info-label">Location:</span> ${devices.failed.address || 'Not set'}
            </div>
            ${devices.failed.tags && devices.failed.tags.length > 0 ? `
            <div class="device-info-item">
                <span class="device-info-label">Tags:</span> 
                ${devices.failed.tags.map(tag => `<span class="badge bg-secondary me-1">${tag}</span>`).join('')}
            </div>` : ''}
        `;
        
        // Replacement device info
        replacementInfo.innerHTML = `
            <div class="device-info-item">
                <span class="device-info-label">Will inherit hostname:</span> 
                <code class="bg-success text-white p-1 rounded">${failedHostname}</code>
            </div>
            <div class="device-info-item">
                <span class="device-info-label">Model:</span> ${devices.replacement.model || 'Unknown'}
            </div>
            <div class="device-info-item">
                <span class="device-info-label">Organization:</span> 
                <strong>${devices.replacement.organizationName || organizationName}</strong>
            </div>
            <div class="device-info-item">
                <span class="device-info-label">Status:</span> 
                <span class="badge bg-success">Ready for deployment</span>
            </div>
            <div class="device-info-item">
                <span class="device-info-label">Network Status:</span> 
                ${devices.replacement.networkId ? 'Already claimed' : 'Will be claimed'}
            </div>
            <div class="device-info-item">
                <span class="device-info-label">Configuration:</span> 
                Exact copy from failed device
            </div>
        `;
        
        document.getElementById('deviceInfoSection').style.display = 'block';
    }
    
    showOperationSteps(operations) {
        const progressSteps = document.getElementById('progressSteps');
        const totalSteps = operations.length;
        let completedSteps = 0;
        
        let stepsHtml = '<h6>Operation Steps:</h6>';
        
        operations.forEach((op, index) => {
            let statusClass = 'step-pending';
            let icon = '⏳';
            
            if (op.status === 'completed') {
                statusClass = 'step-completed';
                icon = '✅';
                completedSteps++;
            } else if (op.status === 'in-progress') {
                statusClass = 'step-in-progress';
                icon = '🔄';
            } else if (op.status === 'failed') {
                statusClass = 'step-failed';
                icon = '❌';
            }
            
            stepsHtml += `
                <div class="step-item ${statusClass}">
                    ${icon} Step ${op.step}: ${op.message}
                    ${op.error ? `<br><small class="text-danger">Error: ${op.error}</small>` : ''}
                </div>
            `;
        });
        
        progressSteps.innerHTML = stepsHtml;
        
        // Update progress bar
        const percentage = (completedSteps / totalSteps) * 100;
        document.getElementById('progressBar').style.width = `${percentage}%`;
    }
    
    showReplacementSummary(summary) {
        const summaryHtml = `
            <div class="alert alert-success mt-3">
                <h6>📋 Replacement Summary:</h6>
                <ul class="mb-0">
                    <li><strong>Failed Device:</strong> ${summary.failedDevice}</li>
                    <li><strong>Replacement Device:</strong> ${summary.replacementDevice}</li>
                    <li><strong>Organization:</strong> ${summary.organizationId}</li>
                    <li><strong>Hostname Transferred:</strong> <code>${summary.hostnameTransferred}</code></li>
                    <li><strong>Configuration Applied:</strong>
                        <ul>
                            ${summary.configurationTypes.map(type => `<li>${type}</li>`).join('')}
                        </ul>
                    </li>
                </ul>
            </div>
        `;
        
        document.getElementById('progressSteps').innerHTML += summaryHtml;
    }
    
    showProgress(message, percentage) {
        const progressSection = document.getElementById('progressSection');
        const progressBar = document.getElementById('progressBar');
        const progressSteps = document.getElementById('progressSteps');
        
        progressSection.style.display = 'block';
        progressBar.style.width = `${percentage}%`;
        progressSteps.innerHTML = `<div class="alert alert-info mb-0">${message}</div>`;
    }
    
    hideProgress() {
        const progressSection = document.getElementById('progressSection');
        setTimeout(() => {
            if (document.getElementById('progressSteps').children.length === 1) {
                progressSection.style.display = 'none';
            }
        }, 2000);
    }
    
    setButtonLoading(buttonId, isLoading) {
        const button = document.getElementById(buttonId);
        
        if (isLoading) {
            button.disabled = true;
            button.classList.add('btn-loading');
        } else {
            button.disabled = false;
            button.classList.remove('btn-loading');
        }
    }
    
    showAlert(message, type) {
        const alertArea = document.getElementById('alertArea');
        
        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        
        alertArea.innerHTML = alertHtml;
        
        // Auto-dismiss success alerts after 7 seconds (longer for multi-org info)
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                const alert = alertArea.querySelector('.alert');
                if (alert) {
                    alert.classList.remove('show');
                    setTimeout(() => alertArea.innerHTML = '', 300);
                }
            }, 7000);
        }
    }
    
    resetForm() {
        document.getElementById('replacementForm').reset();
        document.getElementById('replaceBtn').disabled = true;
        document.getElementById('validateBtn').disabled = true;
        document.getElementById('deviceInfoSection').style.display = 'none';
        document.getElementById('progressSection').style.display = 'none';
        document.getElementById('alertArea').innerHTML = '';
        
        // Reset validation state
        this.validationState = {
            failedSerial: false,
            replacementSerial: false
        };
        
        // Clear validation classes
        document.querySelectorAll('.is-valid, .is-invalid').forEach(el => {
            el.classList.remove('is-valid', 'is-invalid');
        });
        
        // Show reset confirmation
        this.showAlert('🔄 Form has been reset. Ready for next replacement across all organizations.', 'info');
    }
}

// Initialize the portal when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Meraki Multi-Organization Replacement Portal...');
    new MerakiReplacementPortal();
});