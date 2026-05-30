// notifications.js - Complete Notification System for All Roles

let notificationPermissionGranted = false;
let notificationInterval = null;
let lastCheckedTime = Date.now();

// Request permission for notifications
async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.log("This browser does not support notifications");
        return false;
    }
    
    const permission = await Notification.requestPermission();
    notificationPermissionGranted = permission === "granted";
    
    if (notificationPermissionGranted) {
        console.log("Notification permission granted");
        startNotificationChecker();
    }
    
    return notificationPermissionGranted;
}

// Play notification sound
function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        gainNode.gain.value = 0.3;
        
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 1);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch(e) {
        console.log("Could not play sound:", e);
    }
}

// Show browser notification
function showNotification(title, message, requestId = null, propertyId = null, type = null) {
    if (!notificationPermissionGranted) return;
    
    const options = {
        body: message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        silent: false,
        requireInteraction: true,
        tag: requestId || 'notification',
        data: { requestId: requestId, propertyId: propertyId, type: type }
    };
    
    const notification = new Notification(title, options);
    
    notification.onclick = function(event) {
        event.preventDefault();
        window.focus();
        const role = localStorage.getItem('battetech_user_role');
        if (type === 'approval' || type === 'payment') {
            if (role === 'property_admin') {
                window.location.href = 'property-admin-dashboard.html';
            } else if (role === 'super_admin') {
                window.location.href = 'super-admin-dashboard.html';
            }
        } else if (type === 'rental') {
            window.location.href = 'rentals.html';
        }
        notification.close();
    };
    
    playNotificationSound();
}

// Add notification to database and show browser notification
async function addNotification(userId, userRole, title, message, type, requestId = null, propertyId = null) {
    try {
        const { error } = await window.supabaseClient
            .from('system_notifications')
            .insert({
                user_id: userId,
                user_role: userRole,
                title: title,
                message: message,
                type: type,
                request_id: requestId,
                property_id: propertyId,
                created_at: new Date().toISOString()
            });
        
        if (error) console.error("Error adding notification:", error);
        
        showNotification(title, message, requestId, propertyId, type);
        
    } catch (err) {
        console.error("Error:", err);
    }
}

// Get unread notifications for current user
async function getUnreadNotifications() {
    const user = getCurrentUser();
    if (!user) return [];
    
    const { data, error } = await window.supabaseClient
        .from('system_notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false });
    
    if (error) return [];
    return data || [];
}

// Get all notifications for current user
async function getAllNotifications(limit = 50) {
    const user = getCurrentUser();
    if (!user) return [];
    
    const { data, error } = await window.supabaseClient
        .from('system_notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
    
    if (error) return [];
    return data || [];
}

// Mark notification as read
async function markNotificationAsRead(notificationId) {
    await window.supabaseClient
        .from('system_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
    
    updateNotificationBadge();
}

// Mark all notifications as read
async function markAllNotificationsAsRead() {
    const user = getCurrentUser();
    if (!user) return;
    
    await window.supabaseClient
        .from('system_notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
    
    updateNotificationBadge();
}

// Start checking for new notifications
function startNotificationChecker() {
    if (notificationInterval) clearInterval(notificationInterval);
    
    notificationInterval = setInterval(async () => {
        const user = getCurrentUser();
        if (!user) return;
        
        const { data, error } = await window.supabaseClient
            .from('system_notifications')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_read', false)
            .gte('created_at', new Date(lastCheckedTime).toISOString());
        
        if (!error && data && data.length > 0) {
            for (let notif of data) {
                showNotification(notif.title, notif.message, notif.request_id, notif.property_id, notif.type);
            }
        }
        
        lastCheckedTime = Date.now();
        updateNotificationBadge();
    }, 30000);
}

// Update notification badge count
async function updateNotificationBadge() {
    const notifications = await getUnreadNotifications();
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        const count = notifications.length;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// Display notifications in dropdown
async function displayNotificationsInDropdown(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const notifications = await getAllNotifications(20);
    
    if (notifications.length === 0) {
        container.innerHTML = '<div style="padding: 15px; text-align: center; color: #666;">No notifications</div>';
        return;
    }
    
    let html = '';
    for (let notif of notifications) {
        const date = new Date(notif.created_at);
        const isUnread = !notif.is_read;
        html += `
            <div class="notification-item ${isUnread ? 'unread' : ''}" data-id="${notif.id}" onclick="markNotificationAsRead('${notif.id}')" style="padding: 12px; border-bottom: 1px solid #eee; background: ${isUnread ? '#fff3cd' : 'white'}; cursor: pointer;">
                <div style="font-weight: bold; font-size: 0.85rem;">${escapeHtmlForNotif(notif.title)}</div>
                <div style="font-size: 0.75rem; color: #555;">${escapeHtmlForNotif(notif.message)}</div>
                <div style="font-size: 0.65rem; color: #999; margin-top: 5px;">${date.toLocaleString()}</div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function escapeHtmlForNotif(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// Initialize notification system
async function initNotificationSystem() {
    await requestNotificationPermission();
    updateNotificationBadge();
    setInterval(updateNotificationBadge, 15000);
}

// ============ NOTIFICATION TRIGGERS ============

// Notify admin when worker requests payment approval
async function notifyAdminPaymentApproval(adminId, adminName, requestId, amount, tenantName, roomNumber, propertyId) {
    await addNotification(
        adminId,
        'property_admin',
        '💰 Payment Approval Needed',
        `Worker requested payment approval: UGX ${amount.toLocaleString()} from ${tenantName} (${roomNumber})`,
        'payment',
        requestId,
        propertyId
    );
}

// Notify super admin when property admin requests broadcast approval
async function notifySuperAdminBroadcastApproval(superAdminId, requestId, senderName, broadcastType) {
    await addNotification(
        superAdminId,
        'super_admin',
        '📢 Broadcast Approval Needed',
        `${senderName} requested approval to broadcast to ${broadcastType}`,
        'broadcast',
        requestId
    );
}

// Notify worker when their request is approved/rejected
async function notifyWorkerDecision(workerId, workerName, actionType, status, reason = null) {
    const title = status === 'approved' ? '✅ Request Approved' : '❌ Request Rejected';
    const message = status === 'approved' 
        ? `Your ${actionType} request has been approved.`
        : `Your ${actionType} request was rejected. ${reason ? `Reason: ${reason}` : ''}`;
    
    await addNotification(
        workerId,
        'worker',
        title,
        message,
        'system'
    );
}

// Notify property owner about payment received
async function notifyPropertyOwner(ownerId, ownerName, propertyName, amount, tenantName, roomNumber) {
    await addNotification(
        ownerId,
        'owner',
        '💰 Payment Received',
        `Payment of UGX ${amount.toLocaleString()} received from ${tenantName} (${roomNumber}) for ${propertyName}`,
        'payment',
        null,
        null
    );
}

// Notify tenant about rent reminder via notification (in addition to WhatsApp)
async function notifyTenant(tenantId, tenantName, roomNumber, amount, propertyName) {
    await addNotification(
        tenantId,
        'tenant',
        '🏠 Rent Reminder',
        `Your rent of UGX ${amount.toLocaleString()} for ${propertyName} (${roomNumber}) is due`,
        'rental',
        null,
        null
    );
}

// Notify admin about new worker activity
async function notifyAdminWorkerActivity(adminId, workerName, action, details) {
    await addNotification(
        adminId,
        'property_admin',
        `👷 Worker Activity: ${action}`,
        `${workerName} ${details}`,
        'system'
    );
}

// Notify super admin about any important system event
async function notifySuperAdminSystemEvent(superAdminId, title, message) {
    await addNotification(
        superAdminId,
        'super_admin',
        title,
        message,
        'system'
    );
}

window.addNotification = addNotification;