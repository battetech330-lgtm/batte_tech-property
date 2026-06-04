// activity-log.js - COMPLETE with Notification Triggers
// Every activity logged automatically sends notifications

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

// Add activity log entry AND trigger notifications
async function addActivityLog(action, details, propertyId = null, transactionId = null) {
    const user = getCurrentUserForLog();
    if (!user) {
        console.log('No user found, skipping activity log');
        return;
    }
    
    console.log(`📝 Activity Log: ${action} - ${details}`);
    
    try {
        // 1. Insert the activity log
        const { data: logData, error } = await window.supabaseClient.from('activity_logs').insert({
            user_id: user.id,
            user_name: user.name,
            user_role: user.role,
            action: action,
            details: details,
            property_id: propertyId,
            transaction_id: transactionId,
            created_at: new Date().toISOString()
        }).select();
        
        if (error) {
            console.error('Failed to add activity log:', error);
            return;
        }
        
        console.log('Activity logged successfully:', action);
        
        // 2. TRIGGER NOTIFICATIONS based on the activity
        await triggerNotificationsFromActivity(action, details, propertyId, transactionId, user);
        
        return logData;
        
    } catch (err) {
        console.error('Error adding activity log:', err);
    }
}

// ============ TRIGGER NOTIFICATIONS FROM ACTIVITY ============

async function triggerNotificationsFromActivity(action, details, propertyId, transactionId, actingUser) {
    console.log(`🔔 Triggering notifications for activity: ${action}`);
    
    // Get property details if propertyId exists
    let property = null;
    if (propertyId) {
        const { data } = await window.supabaseClient
            .from('properties')
            .select('id, name, admin_id, owner_name, owner_phone')
            .eq('id', propertyId)
            .single();
        property = data;
    }
    
    // Get Super Admin
    const { data: superAdmin } = await window.supabaseClient
        .from('users')
        .select('id, full_name, phone')
        .eq('role', 'super_admin')
        .single();
    
    // Get current date for formatting
    const now = new Date();
    const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
    
    // ============ PAYMENT RELATED ACTIVITIES ============
    
    if (action === 'payment_recorded' || action === 'payment_approved') {
        // Extract amount and room from details
        let amount = 0;
        let roomNumber = '';
        let tenantName = '';
        
        const amountMatch = details.match(/UGX ([\d,]+)/);
        if (amountMatch) amount = parseInt(amountMatch[1].replace(/,/g, ''));
        
        const roomMatch = details.match(/room (\w+)/i);
        if (roomMatch) roomNumber = roomMatch[1];
        
        const tenantMatch = details.match(/tenant (\w+)/i);
        if (tenantMatch) tenantName = tenantMatch[1];
        
        // Notify Property Admin (if not the one who acted)
        if (property?.admin_id && property.admin_id !== actingUser.id) {
            await sendNotificationToUser(
                property.admin_id,
                'property_admin',
                '💰 Payment ' + (action === 'payment_approved' ? 'Approved' : 'Recorded'),
                `${actingUser.name} ${action === 'payment_approved' ? 'approved' : 'recorded'} payment of UGX ${amount.toLocaleString()} for room ${roomNumber} at ${property?.name || 'your property'}. Transaction: ${transactionId || 'N/A'}`,
                'payment',
                null,
                propertyId
            );
        }
        
        // Notify Super Admin (if not the one who acted)
        if (superAdmin && superAdmin.id !== actingUser.id) {
            await sendNotificationToUser(
                superAdmin.id,
                'super_admin',
                '💰 Payment ' + (action === 'payment_approved' ? 'Approved' : 'Recorded'),
                `${actingUser.name} (${actingUser.role}) ${action === 'payment_approved' ? 'approved' : 'recorded'} payment of UGX ${amount.toLocaleString()} for ${property?.name || 'property'} - Room ${roomNumber}`,
                'payment',
                null,
                propertyId
            );
        }
        
        // Notify Property Owner (via WhatsApp)
        if (property?.owner_phone) {
            let phone = property.owner_phone.replace(/\s/g, '');
            if (phone.startsWith('0')) phone = '256' + phone.substring(1);
            const ownerMsg = `🏢 BATTETECH - PAYMENT RECEIVED\n\nDear ${property.owner_name || 'Property Owner'},\n\nA payment of UGX ${amount.toLocaleString()} has been ${action === 'payment_approved' ? 'approved and ' : ''}recorded for your property "${property.name}" (Room ${roomNumber}).\n\nTransaction ID: ${transactionId}\nDate: ${dateStr}\n\nLogin to your dashboard for details.\n\n- BattleTech Management`;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(ownerMsg)}`, '_blank');
        }
    }
    
    // ============ REMITTANCE RELATED ACTIVITIES ============
    
    else if (action === 'remittance_sent') {
        let amount = 0;
        const amountMatch = details.match(/UGX ([\d,]+)/);
        if (amountMatch) amount = parseInt(amountMatch[1].replace(/,/g, ''));
        
        // Notify Property Owner (most important for remittance)
        if (property?.owner_phone) {
            let phone = property.owner_phone.replace(/\s/g, '');
            if (phone.startsWith('0')) phone = '256' + phone.substring(1);
            const ownerMsg = `🏢 BATTETECH - FUNDS SENT TO YOU\n\nDear ${property.owner_name || 'Property Owner'},\n\nUGX ${amount.toLocaleString()} has been sent to you from your property "${property.name}".\n\nDate: ${dateStr}\n\nLogin to your dashboard to view full statement.\n\n- BattleTech Management`;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(ownerMsg)}`, '_blank');
        }
        
        // Notify Super Admin
        if (superAdmin && superAdmin.id !== actingUser.id) {
            await sendNotificationToUser(
                superAdmin.id,
                'super_admin',
                '💸 Remittance Sent',
                `${actingUser.name} sent remittance of UGX ${amount.toLocaleString()} to owner of ${property?.name || 'property'}.`,
                'remittance',
                null,
                propertyId
            );
        }
    }
    
    // ============ ROOM RELATED ACTIVITIES ============
    
    else if (action === 'room_added') {
        let roomNumber = '';
        let rentAmount = 0;
        
        const roomMatch = details.match(/Room (\w+)/i);
        if (roomMatch) roomNumber = roomMatch[1];
        
        const rentMatch = details.match(/UGX ([\d,]+)/);
        if (rentMatch) rentAmount = parseInt(rentMatch[1].replace(/,/g, ''));
        
        // Notify Super Admin
        if (superAdmin && superAdmin.id !== actingUser.id) {
            await sendNotificationToUser(
                superAdmin.id,
                'super_admin',
                '🏠 New Room Added',
                `${actingUser.name} added room ${roomNumber} to ${property?.name || 'property'} with rent UGX ${rentAmount.toLocaleString()}/month.`,
                'room',
                null,
                propertyId
            );
        }
        
        // Notify Property Owner
        if (property?.owner_phone) {
            let phone = property.owner_phone.replace(/\s/g, '');
            if (phone.startsWith('0')) phone = '256' + phone.substring(1);
            const ownerMsg = `🏢 BATTETECH - NEW ROOM ADDED\n\nDear ${property.owner_name || 'Property Owner'},\n\nA new room (${roomNumber}) has been added to your property "${property.name}" with rent UGX ${rentAmount.toLocaleString()}/month.\n\nLogin to your dashboard for details.\n\n- BattleTech Management`;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(ownerMsg)}`, '_blank');
        }
    }
    
    else if (action === 'room_occupied' || action === 'tenant_moved_in') {
        let roomNumber = '';
        let tenantName = '';
        
        const roomMatch = details.match(/room (\w+)/i);
        if (roomMatch) roomNumber = roomMatch[1];
        
        const tenantMatch = details.match(/(?:tenant|Tenant) (\w+)/i);
        if (tenantMatch) tenantName = tenantMatch[1];
        
        // Notify Property Owner
        if (property?.owner_phone) {
            let phone = property.owner_phone.replace(/\s/g, '');
            if (phone.startsWith('0')) phone = '256' + phone.substring(1);
            const ownerMsg = `🏢 BATTETECH - ROOM OCCUPIED\n\nDear ${property.owner_name || 'Property Owner'},\n\nRoom ${roomNumber} at "${property.name}" is now occupied by ${tenantName || 'a new tenant'}.\n\nLogin to your dashboard for tenant details.\n\n- BattleTech Management`;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(ownerMsg)}`, '_blank');
        }
    }
    
    else if (action === 'room_vacated' || action === 'tenant_evacuated') {
        let roomNumber = '';
        let writtenOffAmount = 0;
        
        const roomMatch = details.match(/room (\w+)/i);
        if (roomMatch) roomNumber = roomMatch[1];
        
        const amountMatch = details.match(/UGX ([\d,]+)/);
        if (amountMatch) writtenOffAmount = parseInt(amountMatch[1].replace(/,/g, ''));
        
        // Notify Property Owner
        if (property?.owner_phone) {
            let phone = property.owner_phone.replace(/\s/g, '');
            if (phone.startsWith('0')) phone = '256' + phone.substring(1);
            const ownerMsg = `🏢 BATTETECH - ROOM VACATED\n\nDear ${property.owner_name || 'Property Owner'},\n\nRoom ${roomNumber} at "${property.name}" is now VACANT.\n${writtenOffAmount > 0 ? `Written off amount: UGX ${writtenOffAmount.toLocaleString()}\n` : ''}Login to your dashboard for details.\n\n- BattleTech Management`;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(ownerMsg)}`, '_blank');
        }
    }
    
    // ============ WORKER RELATED ACTIVITIES ============
    
    else if (action === 'worker_created') {
        let workerName = '';
        const nameMatch = details.match(/worker: (\w+)/i);
        if (nameMatch) workerName = nameMatch[1];
        
        // Notify Super Admin
        if (superAdmin && superAdmin.id !== actingUser.id) {
            await sendNotificationToUser(
                superAdmin.id,
                'super_admin',
                '👷 New Worker Created',
                `${actingUser.name} created a new worker: ${workerName} for ${property?.name || 'property'}.`,
                'worker',
                null,
                propertyId
            );
        }
    }
    
    // ============ BILL RELATED ACTIVITIES ============
    
    else if (action === 'bill_paid') {
        let billType = '';
        let amount = 0;
        
        const typeMatch = details.match(/(Electricity|Water|Garbage|Maintenance)/i);
        if (typeMatch) billType = typeMatch[1];
        
        const amountMatch = details.match(/UGX ([\d,]+)/);
        if (amountMatch) amount = parseInt(amountMatch[1].replace(/,/g, ''));
        
        // Notify Property Owner
        if (property?.owner_phone) {
            let phone = property.owner_phone.replace(/\s/g, '');
            if (phone.startsWith('0')) phone = '256' + phone.substring(1);
            const ownerMsg = `🏢 BATTETECH - BILL PAID ON YOUR BEHALF\n\nDear ${property.owner_name || 'Property Owner'},\n\n${billType} bill of UGX ${amount.toLocaleString()} has been paid on your behalf for property "${property.name}".\n\nThis amount has been deducted from your collected rent.\n\n- BattleTech Management`;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(ownerMsg)}`, '_blank');
        }
        
        // Notify Super Admin
        if (superAdmin && superAdmin.id !== actingUser.id) {
            await sendNotificationToUser(
                superAdmin.id,
                'super_admin',
                '🧾 Bill Paid',
                `${actingUser.name} paid ${billType} bill of UGX ${amount.toLocaleString()} for ${property?.name || 'property'}.`,
                'bill',
                null,
                propertyId
            );
        }
    }
    
    // ============ MONTH RESET ACTIVITIES ============
    
    else if (action === 'month_reset') {
        let newMonth = '';
        const monthMatch = details.match(/([0-9]{4}-[0-9]{2})/);
        if (monthMatch) newMonth = monthMatch[1];
        
        // Notify Property Owner
        if (property?.owner_phone) {
            let phone = property.owner_phone.replace(/\s/g, '');
            if (phone.startsWith('0')) phone = '256' + phone.substring(1);
            const ownerMsg = `🏢 BATTETECH - NEW MONTH STARTED\n\nDear ${property.owner_name || 'Property Owner'},\n\nA new month (${newMonth}) has been started for your property "${property.name}".\n\nUnpaid balances have been carried forward.\n\nLogin to your dashboard for the latest statement.\n\n- BattleTech Management`;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(ownerMsg)}`, '_blank');
        }
    }
    
    // ============ FEE CHANGE ACTIVITIES ============
    
    else if (action === 'fee_changed') {
        let oldFee = '', newFee = '';
        const feeMatch = details.match(/(\d+)% to (\d+)%/);
        if (feeMatch) {
            oldFee = feeMatch[1];
            newFee = feeMatch[2];
        }
        
        // Notify Property Owner
        if (property?.owner_phone) {
            let phone = property.owner_phone.replace(/\s/g, '');
            if (phone.startsWith('0')) phone = '256' + phone.substring(1);
            const ownerMsg = `🏢 BATTETECH - MANAGEMENT FEE UPDATE\n\nDear ${property.owner_name || 'Property Owner'},\n\nThe management fee for your property "${property.name}" has been changed from ${oldFee}% to ${newFee}%.\n\nLogin to your dashboard for details.\n\n- BattleTech Management`;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(ownerMsg)}`, '_blank');
        }
    }
    
    // ============ STATEMENT GENERATED ============
    
    else if (action === 'statement_generated') {
        let month = '';
        const monthMatch = details.match(/for ([0-9]{4}-[0-9]{2})/);
        if (monthMatch) month = monthMatch[1];
        
        // Notify Property Owner
        if (property?.owner_phone) {
            let phone = property.owner_phone.replace(/\s/g, '');
            if (phone.startsWith('0')) phone = '256' + phone.substring(1);
            const ownerMsg = `🏢 BATTETECH - MONTHLY STATEMENT READY\n\nDear ${property.owner_name || 'Property Owner'},\n\nYour monthly statement for ${month} is now ready.\n\nLogin to your dashboard to view and download your statement.\n\n- BattleTech Management`;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(ownerMsg)}`, '_blank');
        }
    }
    
    // ============ BROADCAST ACTIVITIES ============
    
    else if (action === 'broadcast_sent' || action === 'broadcast_approved') {
        let recipientCount = 0;
        const countMatch = details.match(/(\d+) recipient/);
        if (countMatch) recipientCount = parseInt(countMatch[1]);
        
        // Notify Super Admin
        if (superAdmin && superAdmin.id !== actingUser.id) {
            await sendNotificationToUser(
                superAdmin.id,
                'super_admin',
                '📢 Broadcast ' + (action === 'broadcast_approved' ? 'Approved' : 'Sent'),
                `${actingUser.name} ${action === 'broadcast_approved' ? 'approved and sent' : 'sent'} a broadcast to ${recipientCount} recipients.`,
                'broadcast',
                null,
                propertyId
            );
        }
    }
    
    // ============ REQUEST ACTIVITIES (Worker Actions) ============
    
    else if (action === 'payment_requested') {
        let amount = 0;
        let roomNumber = '';
        
        const amountMatch = details.match(/UGX ([\d,]+)/);
        if (amountMatch) amount = parseInt(amountMatch[1].replace(/,/g, ''));
        
        const roomMatch = details.match(/room (\w+)/i);
        if (roomMatch) roomNumber = roomMatch[1];
        
        // Notify Property Admin
        if (property?.admin_id && property.admin_id !== actingUser.id) {
            await sendNotificationToUser(
                property.admin_id,
                'property_admin',
                '💰 Payment Request Pending',
                `${actingUser.name} requested payment approval of UGX ${amount.toLocaleString()} for room ${roomNumber} at ${property?.name || 'property'}.`,
                'payment',
                null,
                propertyId
            );
        }
        
        // Notify Super Admin
        if (superAdmin && superAdmin.id !== actingUser.id) {
            await sendNotificationToUser(
                superAdmin.id,
                'super_admin',
                '💰 Payment Request - Action Needed',
                `${actingUser.name} (Worker) requested payment of UGX ${amount.toLocaleString()} for ${property?.name || 'property'} - Room ${roomNumber}. Please check admin dashboard.`,
                'payment',
                null,
                propertyId
            );
        }
    }
    
    else if (action === 'evacuation_requested') {
        let roomNumber = '';
        let tenantName = '';
        
        const roomMatch = details.match(/room (\w+)/i);
        if (roomMatch) roomNumber = roomMatch[1];
        
        const tenantMatch = details.match(/(?:tenant|Tenant) (\w+)/i);
        if (tenantMatch) tenantName = tenantMatch[1];
        
        // Notify Property Admin
        if (property?.admin_id && property.admin_id !== actingUser.id) {
            await sendNotificationToUser(
                property.admin_id,
                'property_admin',
                '🚪 Evacuation Request Pending',
                `${actingUser.name} requested evacuation of ${tenantName || 'tenant'} from room ${roomNumber} at ${property?.name || 'property'}.`,
                'evacuation',
                null,
                propertyId
            );
        }
        
        // Notify Super Admin
        if (superAdmin && superAdmin.id !== actingUser.id) {
            await sendNotificationToUser(
                superAdmin.id,
                'super_admin',
                '🚪 Evacuation Request - Action Needed',
                `${actingUser.name} (Worker) requested evacuation at ${property?.name || 'property'} - Room ${roomNumber}. Please review.`,
                'evacuation',
                null,
                propertyId
            );
        }
    }
    
    // ============ ACTIVITY LOG RESET ============
    
    else if (action === 'activity_log_reset') {
        // Notify Super Admin
        if (superAdmin && superAdmin.id !== actingUser.id) {
            await sendNotificationToUser(
                superAdmin.id,
                'super_admin',
                '🗑️ Activity Log Reset',
                `${actingUser.name} reset the activity log. Scope: ${details.substring(0, 100)}`,
                'system',
                null,
                propertyId
            );
        }
    }
    
    // ============ DEFAULT - Send to Super Admin for any unknown action ============
    
    else {
        // For any other action, at least notify Super Admin
        if (superAdmin && superAdmin.id !== actingUser.id) {
            await sendNotificationToUser(
                superAdmin.id,
                'super_admin',
                `🔔 ${action.replace(/_/g, ' ').toUpperCase()}`,
                `${actingUser.name} (${actingUser.role}) performed: ${details.substring(0, 150)}`,
                'system',
                null,
                propertyId
            );
        }
    }
    
    console.log(`✅ Notifications triggered for action: ${action}`);
}

// ============ HELPER FUNCTIONS ============

// Send notification to a specific user (calls the notification system)
async function sendNotificationToUser(userId, userRole, title, message, type, requestId = null, propertyId = null) {
    try {
        // Check if the global notification function exists
        if (typeof window.sendPushNotification === 'function') {
            await window.sendPushNotification(userId, userRole, title, message, type, requestId, propertyId);
        } else {
            console.log(`Notification would be sent: ${title} to ${userRole} (${userId})`);
        }
    } catch (err) {
        console.error('Error sending notification:', err);
    }
}

// ============ CLEAN ACTIVITY LOGS FOR OWNERS ============

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
            cleanDetails = cleanDetails.replace(/worker \w+/gi, 'staff member');
            cleanDetails = cleanDetails.replace(/admin \w+/gi, 'administrator');
            cleanDetails = cleanDetails.replace(/tenant \w+/gi, 'tenant');
            cleanDetails = cleanDetails.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[email]');
            cleanDetails = cleanDetails.replace(/0[0-9]{9}/g, '[phone]');
            
            cleanedLogs.push({
                ...log,
                details: cleanDetails,
                user_name: undefined
            });
        }
        
        return cleanedLogs;
    } catch (err) {
        console.error('Error getting clean activity logs:', err);
        return [];
    }
}

// ============ DISPLAY FUNCTIONS ============

async function displayActivityLogs(containerId, userId = null, propertyId = null, limit = 30, isOwner = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let logs;
    
    if (isOwner) {
        logs = await getCleanActivityLogsForOwner(propertyId, limit);
    } else if (userId === 'all') {
        const { data } = await window.supabaseClient
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        logs = data || [];
    } else if (userId === 'my') {
        const user = getCurrentUserForLog();
        if (user) {
            const { data } = await window.supabaseClient
                .from('activity_logs')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(limit);
            logs = data || [];
        } else {
            logs = [];
        }
    } else {
        let query = window.supabaseClient
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (userId) query = query.eq('user_id', userId);
        if (propertyId) query = query.eq('property_id', propertyId);
        
        const { data } = await query;
        logs = data || [];
    }
    
    if (!logs || logs.length === 0) {
        container.innerHTML = '<div class="activity-item">No activities yet.</div>';
        return;
    }
    
    let html = '';
    for (let log of logs) {
        const date = new Date(log.created_at);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        
        if (isOwner) {
            html += `
                <div class="activity-item">
                    <div class="activity-date">${dateStr}</div>
                    <div class="activity-message">${escapeHtmlForLog(log.details || log.action)}</div>
                </div>
            `;
        } else {
            html += `
                <div class="activity-item">
                    <small>${dateStr}</small><br>
                    <strong>👤 ${escapeHtmlForLog(log.user_name || 'Unknown')}</strong> - ${escapeHtmlForLog(log.action)}<br>
                    ${escapeHtmlForLog(log.details || '')}
                    ${log.transaction_id ? `<br><small>Transaction ID: ${escapeHtmlForLog(log.transaction_id)}</small>` : ''}
                </div>
            `;
        }
    }
    container.innerHTML = html;
}

function escapeHtmlForLog(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============ SPECIFIC ACTIVITY LOGGERS WITH NOTIFICATIONS ============

async function logPaymentReceived(propertyId, roomNumber, amount, tenantName, transactionId) {
    await addActivityLog(
        'payment_recorded',
        `💰 Payment of UGX ${amount.toLocaleString()} was received for room ${roomNumber} from ${tenantName}. Transaction: ${transactionId}`,
        propertyId,
        transactionId
    );
}

async function logPaymentApproved(propertyId, roomNumber, amount, tenantName, transactionId, approvedBy) {
    await addActivityLog(
        'payment_approved',
        `✅ Payment of UGX ${amount.toLocaleString()} for room ${roomNumber} (${tenantName}) was approved by ${approvedBy}. Transaction: ${transactionId}`,
        propertyId,
        transactionId
    );
}

async function logPaymentRequested(propertyId, roomNumber, amount, tenantName, workerName) {
    await addActivityLog(
        'payment_requested',
        `📝 Payment request of UGX ${amount.toLocaleString()} for room ${roomNumber} (${tenantName}) was submitted by worker ${workerName}`,
        propertyId
    );
}

async function logRemittanceSent(propertyId, amount, method, reference) {
    await addActivityLog(
        'remittance_sent',
        `💸 UGX ${amount.toLocaleString()} was sent to owner via ${method}. Reference: ${reference || 'N/A'}`,
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

async function logRoomAdded(propertyId, roomNumber, propertyName, rentAmount) {
    await addActivityLog(
        'room_added',
        `🏠 New room ${roomNumber} was added to ${propertyName} with rent UGX ${rentAmount.toLocaleString()}/month`,
        propertyId
    );
}

async function logRoomOccupied(propertyId, roomNumber, tenantName, rentAmount) {
    await addActivityLog(
        'room_occupied',
        `👤 Room ${roomNumber} is now occupied by ${tenantName} with rent UGX ${rentAmount.toLocaleString()}/month`,
        propertyId
    );
}

async function logTenantEvacuated(propertyId, roomNumber, tenantName, writtenOffAmount) {
    await addActivityLog(
        'tenant_evacuated',
        `🚪 Tenant ${tenantName} evacuated from room ${roomNumber}. ${writtenOffAmount > 0 ? `Written off amount: UGX ${writtenOffAmount.toLocaleString()}` : 'No balance written off.'}`,
        propertyId
    );
}

async function logEvacuationRequested(propertyId, roomNumber, tenantName, workerName, reason) {
    await addActivityLog(
        'evacuation_requested',
        `📋 Evacuation request for room ${roomNumber} (${tenantName}) submitted by worker ${workerName}. Reason: ${reason}`,
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

async function logFeeChanged(propertyId, oldFee, newFee) {
    await addActivityLog(
        'fee_changed',
        `💰 Management fee changed from ${oldFee}% to ${newFee}%`,
        propertyId
    );
}

async function logWorkerCreated(propertyId, workerName, createdBy) {
    await addActivityLog(
        'worker_created',
        `👷 New worker "${workerName}" was created by ${createdBy}`,
        propertyId
    );
}

async function logBroadcastSent(propertyId, broadcastType, recipientCount, sentBy) {
    await addActivityLog(
        'broadcast_sent',
        `📢 ${broadcastType} broadcast sent to ${recipientCount} recipient(s) by ${sentBy}`,
        propertyId
    );
}

// Make functions globally available
window.addActivityLog = addActivityLog;
window.getCleanActivityLogsForOwner = getCleanActivityLogsForOwner;
window.displayActivityLogs = displayActivityLogs;
window.logPaymentReceived = logPaymentReceived;
window.logPaymentApproved = logPaymentApproved;
window.logPaymentRequested = logPaymentRequested;
window.logRemittanceSent = logRemittanceSent;
window.logBillPaid = logBillPaid;
window.logRoomAdded = logRoomAdded;
window.logRoomOccupied = logRoomOccupied;
window.logTenantEvacuated = logTenantEvacuated;
window.logEvacuationRequested = logEvacuationRequested;
window.logMonthReset = logMonthReset;
window.logStatementGenerated = logStatementGenerated;
window.logFeeChanged = logFeeChanged;
window.logWorkerCreated = logWorkerCreated;
window.logBroadcastSent = logBroadcastSent;
window.triggerNotificationsFromActivity = triggerNotificationsFromActivity;