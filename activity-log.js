// activity-log.js - Daily Activity Logging System
// UPDATED: Role-based visibility, history approval requests, clean view for owners

// Get current user from localStorage
function getCurrentUserForLog() {
    const userId = localStorage.getItem('battetech_user_id');
    const userRole = localStorage.getItem('battetech_user_role');
    const userName = localStorage.getItem('battetech_user_name');
    
    if (!userId) return null;
    
    return {
        id: userId,
        role: userRole,
        name: userName
    };
}

// Add activity log entry
async function addActivityLog(action, details, propertyId = null, transactionId = null) {
    const user = getCurrentUserForLog();
    if (!user) {
        console.log('No user found, skipping activity log');
        return;
    }
    
    try {
        const { error } = await window.supabaseClient.from('activity_logs').insert({
            user_id: user.id,
            user_name: user.name,
            user_role: user.role,
            action: action,
            details: details,
            property_id: propertyId,
            transaction_id: transactionId,
            created_at: new Date().toISOString()
        });
        
        if (error) console.error('Failed to add activity log:', error);
        else console.log('Activity logged:', action);
    } catch (err) {
        console.error('Error adding activity log:', err);
    }
}

// Get activity logs with role-based filtering
async function getActivityLogs(userId = null, propertyId = null, limit = 100) {
    try {
        let query = window.supabaseClient.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(limit);
        if (userId) query = query.eq('user_id', userId);
        if (propertyId) query = query.eq('property_id', propertyId);
        const { data, error } = await query;
        if (error) return [];
        return data;
    } catch (err) {
        console.error('Error getting activity logs:', err);
        return [];
    }
}

// Get CLEAN activity logs for property owners (no names, no approvals/rejections)
async function getCleanActivityLogsForOwner(propertyId, limit = 100) {
    try {
        const { data, error } = await window.supabaseClient
            .from('activity_logs')
            .select('*')
            .eq('property_id', propertyId)
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (error) return [];
        
        // Filter and clean logs for owner view
        const cleanedLogs = [];
        for (let log of data) {
            // Skip approval requests, rejections, internal staff actions
            if (log.action.includes('requested') && log.action.includes('approval')) continue;
            if (log.action === 'payment_rejected') continue;
            if (log.action === 'payment_requested') continue;
            if (log.action.includes('approved_by')) continue;
            if (log.action === 'worker_created') continue;
            if (log.action === 'worker_updated') continue;
            if (log.action === 'worker_fired') continue;
            if (log.action === 'admin_created') continue;
            if (log.action === 'admin_updated') continue;
            
            // Clean the message - remove names
            let cleanDetails = log.details || '';
            // Remove worker names, admin names, tenant names (keep only room numbers)
            cleanDetails = cleanDetails.replace(/worker \w+/gi, 'staff member');
            cleanDetails = cleanDetails.replace(/admin \w+/gi, 'administrator');
            cleanDetails = cleanDetails.replace(/tenant \w+/gi, 'tenant');
            // Remove email addresses
            cleanDetails = cleanDetails.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[email]');
            // Remove phone numbers
            cleanDetails = cleanDetails.replace(/0[0-9]{9}/g, '[phone]');
            
            cleanedLogs.push({
                ...log,
                details: cleanDetails,
                user_name: undefined  // Hide who performed the action
            });
        }
        
        return cleanedLogs;
    } catch (err) {
        console.error('Error getting clean activity logs:', err);
        return [];
    }
}

// Get all activity logs (for Super Admin)
async function getAllActivityLogs(limit = 100) {
    try {
        const { data, error } = await window.supabaseClient
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) return [];
        return data;
    } catch (err) {
        console.error('Error getting all activity logs:', err);
        return [];
    }
}

// Get current user's activity logs (for workers - only their own)
async function getMyActivityLogs(limit = 50) {
    const user = getCurrentUserForLog();
    if (!user) return [];
    return await getActivityLogs(user.id, null, limit);
}

// ============ HISTORY VIEW APPROVAL SYSTEM ============

// Request to view history (for Property Admins)
async function requestHistoryViewAccess(propertyId, requesterId, requesterName) {
    try {
        // Get Super Admin ID
        const { data: superAdmin, error: saError } = await window.supabaseClient
            .from('users')
            .select('id')
            .eq('role', 'super_admin')
            .single();
        
        if (saError || !superAdmin) {
            console.error('Super admin not found');
            return false;
        }
        
        const { error } = await window.supabaseClient.from('history_access_requests').insert({
            property_id: propertyId,
            requester_id: requesterId,
            requester_name: requesterName,
            status: 'pending',
            requested_at: new Date().toISOString()
        });
        
        if (error) {
            console.error('Failed to create history access request:', error);
            return false;
        }
        
        // Send notification to Super Admin
        if (window.addNotification) {
            await window.addNotification(
                superAdmin.id,
                'super_admin',
                '📜 History Access Request',
                `${requesterName} requested access to view property history`,
                'history_access',
                null,
                propertyId
            );
        }
        
        return true;
    } catch (err) {
        console.error('Error in requestHistoryViewAccess:', err);
        return false;
    }
}

// Check if Property Admin has approved access to view history
async function checkHistoryAccess(propertyId, requesterId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('history_access_requests')
            .select('*')
            .eq('property_id', propertyId)
            .eq('requester_id', requesterId)
            .eq('status', 'approved')
            .order('approved_at', { ascending: false })
            .limit(1);
        
        if (error) return false;
        if (!data || data.length === 0) return false;
        
        // Check if approval is still valid (e.g., within 24 hours)
        const approvedAt = new Date(data[0].approved_at);
        const now = new Date();
        const hoursSinceApproval = (now - approvedAt) / (1000 * 60 * 60);
        
        // Approval expires after 24 hours
        return hoursSinceApproval < 24;
    } catch (err) {
        console.error('Error checking history access:', err);
        return false;
    }
}

// Approve history access (Super Admin only)
async function approveHistoryAccess(requestId, approverId) {
    try {
        const { error } = await window.supabaseClient
            .from('history_access_requests')
            .update({
                status: 'approved',
                approved_by: approverId,
                approved_at: new Date().toISOString()
            })
            .eq('id', requestId);
        
        if (error) {
            console.error('Failed to approve history access:', error);
            return false;
        }
        
        return true;
    } catch (err) {
        console.error('Error in approveHistoryAccess:', err);
        return false;
    }
}

// Reject history access (Super Admin only)
async function rejectHistoryAccess(requestId, approverId, reason) {
    try {
        const { error } = await window.supabaseClient
            .from('history_access_requests')
            .update({
                status: 'rejected',
                approved_by: approverId,
                rejection_reason: reason,
                approved_at: new Date().toISOString()
            })
            .eq('id', requestId);
        
        if (error) {
            console.error('Failed to reject history access:', error);
            return false;
        }
        
        return true;
    } catch (err) {
        console.error('Error in rejectHistoryAccess:', err);
        return false;
    }
}

// Get pending history access requests (for Super Admin)
async function getPendingHistoryAccessRequests() {
    try {
        const { data, error } = await window.supabaseClient
            .from('history_access_requests')
            .select('*')
            .eq('status', 'pending')
            .order('requested_at', { ascending: false });
        
        if (error) return [];
        return data || [];
    } catch (err) {
        console.error('Error getting pending history access requests:', err);
        return [];
    }
}

// ============ DISPLAY FUNCTIONS ============

// Display activity logs in a container (with role-based filtering)
async function displayActivityLogs(containerId, userId = null, propertyId = null, limit = 30, isOwner = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let logs;
    
    if (isOwner) {
        // For property owners - show clean logs
        logs = await getCleanActivityLogsForOwner(propertyId, limit);
    } else if (userId === 'all') {
        logs = await getAllActivityLogs(limit);
    } else if (userId === 'my') {
        logs = await getMyActivityLogs(limit);
    } else {
        logs = await getActivityLogs(userId, propertyId, limit);
    }
    
    if (!logs || logs.length === 0) {
        container.innerHTML = '<div class="activity-item">No activities yet.</div>';
        return;
    }
    
    let html = '';
    for (let log of logs) {
        const date = new Date(log.created_at);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        
        // For owner view, don't show user_name
        if (isOwner) {
            html += `
                <div class="activity-item ${getActivityClass(log.action)}">
                    <div class="activity-date">${dateStr}</div>
                    <div class="activity-message">${escapeHtmlForLog(log.details || log.action)}</div>
                </div>
            `;
        } else {
            html += `
                <div class="activity-item ${getActivityClass(log.action)}">
                    <small>${dateStr}</small>
                    <br>
                    <strong>👤 ${escapeHtmlForLog(log.user_name || 'Unknown')}</strong> - ${escapeHtmlForLog(log.action)}
                    <br>
                    ${escapeHtmlForLog(log.details || '')}
                    ${log.transaction_id ? `<br><small>Transaction ID: ${escapeHtmlForLog(log.transaction_id)}</small>` : ''}
                </div>
            `;
        }
    }
    container.innerHTML = html;
}

// Get CSS class based on action type
function getActivityClass(action) {
    if (action.includes('payment') || action === 'payment_approved' || action === 'payment_recorded') {
        return 'payment-received';
    }
    if (action.includes('remittance') || action === 'remittance_sent') {
        return 'remittance-sent';
    }
    if (action.includes('bill')) {
        return 'bill-paid';
    }
    if (action.includes('vacant') || action === 'tenant_moved_out') {
        return 'vacant-room';
    }
    if (action.includes('room_added')) {
        return 'room-added';
    }
    if (action.includes('evacuated')) {
        return 'evacuated';
    }
    return '';
}

// Helper function to escape HTML
function escapeHtmlForLog(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============ SPECIFIC ACTIVITY LOGGERS ============

async function logPaymentReceived(propertyId, roomNumber, amount, tenantName, transactionId) {
    await addActivityLog(
        'payment_recorded',
        `💰 Payment of UGX ${amount.toLocaleString()} was received for room ${roomNumber}`,
        propertyId,
        transactionId
    );
}

async function logRemittanceSent(propertyId, amount, method, reference) {
    await addActivityLog(
        'remittance_sent',
        `💰 UGX ${amount.toLocaleString()} was sent to owner via ${method}. Reference: ${reference || 'N/A'}`,
        propertyId
    );
}

async function logBillPaid(propertyId, billType, amount) {
    await addActivityLog(
        'bill_paid',
        `🧾 ${billType} bill of UGX ${amount.toLocaleString()} was paid on owner's behalf`,
        propertyId
    );
}

async function logRoomAdded(propertyId, roomNumber, propertyName) {
    await addActivityLog(
        'room_added',
        `🏠 New room ${roomNumber} was added to ${propertyName}`,
        propertyId
    );
}

async function logTenantEvacuated(propertyId, roomNumber, tenantName, writtenOffAmount) {
    await addActivityLog(
        'tenant_evacuated',
        `🚪 Tenant evacuated from room ${roomNumber}. ${writtenOffAmount > 0 ? `Written off amount: UGX ${writtenOffAmount.toLocaleString()}` : 'No balance written off.'}`,
        propertyId
    );
}

async function logMonthReset(propertyId, oldMonth, newMonth, carriedOverAmount) {
    await addActivityLog(
        'month_reset',
        `📅 Month changed from ${oldMonth} to ${newMonth}. Carried over balance: UGX ${carriedOverAmount.toLocaleString()}`,
        propertyId
    );
}

async function logStatementGenerated(propertyId, month, generatedBy) {
    await addActivityLog(
        'statement_generated',
        `📄 Monthly statement for ${month} was generated by ${generatedBy}`,
        propertyId
    );
}

async function logPropertyEdited(propertyId, fieldChanged, oldValue, newValue) {
    await addActivityLog(
        'property_edited',
        `✏️ Property ${fieldChanged} changed from "${oldValue}" to "${newValue}"`,
        propertyId
    );
}

async function logFeeChanged(propertyId, oldFee, newFee) {
    await addActivityLog(
        'fee_changed',
        `💰 Management fee changed from ${oldFee}% to ${newFee}%`,
        propertyId
    );
}

async function logWorkerAssigned(propertyId, workerName, propertyName) {
    await addActivityLog(
        'worker_assigned',
        `👷 Worker ${workerName} was assigned to property ${propertyName}`,
        propertyId
    );
}

async function logAdminAssigned(adminName, propertyName) {
    await addActivityLog(
        'admin_assigned',
        `👑 Admin ${adminName} was assigned to property ${propertyName}`,
        null
    );
}

// Make functions globally available
window.addActivityLog = addActivityLog;
window.getCleanActivityLogsForOwner = getCleanActivityLogsForOwner;
window.displayActivityLogs = displayActivityLogs;
window.requestHistoryViewAccess = requestHistoryViewAccess;
window.checkHistoryAccess = checkHistoryAccess;
window.getPendingHistoryAccessRequests = getPendingHistoryAccessRequests;
window.approveHistoryAccess = approveHistoryAccess;
window.rejectHistoryAccess = rejectHistoryAccess;
window.logPaymentReceived = logPaymentReceived;
window.logRemittanceSent = logRemittanceSent;
window.logBillPaid = logBillPaid;
window.logRoomAdded = logRoomAdded;
window.logTenantEvacuated = logTenantEvacuated;
window.logMonthReset = logMonthReset;
window.logStatementGenerated = logStatementGenerated;
window.logPropertyEdited = logPropertyEdited;
window.logFeeChanged = logFeeChanged;
window.logWorkerAssigned = logWorkerAssigned;
window.logAdminAssigned = logAdminAssigned;