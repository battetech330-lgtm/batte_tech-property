// notifications.js - Complete Notification System with Push Notifications

let pushNotificationPermission = false;
let pushNotificationSupported = false;
let notificationInterval = null;
let lastCheckedTime = Date.now();

// ============ CHECK BROWSER SUPPORT ============

function checkNotificationSupport() {
    pushNotificationSupported = "Notification" in window;
    if (!pushNotificationSupported) {
        console.log("This browser does not support desktop notifications");
        return false;
    }
    return true;
}

// ============ REQUEST PERMISSION ============

async function requestPushNotificationPermission() {
    if (!checkNotificationSupport()) {
        alert("Your browser does not support desktop notifications");
        return false;
    }
    
    if (Notification.permission === "granted") {
        pushNotificationPermission = true;
        localStorage.setItem('battetech_notifications_enabled', 'true');
        showLocalNotification("✅ Notifications Enabled", "You will now receive real-time updates about payments, approvals, and property activities.");
        return true;
    }
    
    if (Notification.permission !== "denied") {
        const permission = await Notification.requestPermission();
        pushNotificationPermission = permission === "granted";
        
        if (pushNotificationPermission) {
            localStorage.setItem('battetech_notifications_enabled', 'true');
            showLocalNotification("✅ Notifications Enabled", "You will now receive real-time updates.");
        }
        return pushNotificationPermission;
    }
    
    return false;
}

// ============ SHOW LOCAL NOTIFICATION ============

function showLocalNotification(title, message, icon = '/favicon.ico', onClickUrl = null, tag = null) {
    if (!pushNotificationSupported) return;
    if (Notification.permission !== "granted") return;
    
    try {
        const options = {
            body: message,
            icon: icon,
            badge: icon,
            vibrate: [200, 100, 200],
            requireInteraction: true,
            silent: false,
            tag: tag || 'battetech-notification',
            renotify: true
        };
        
        const notification = new Notification(title, options);
        
        notification.onclick = function(event) {
            event.preventDefault();
            window.focus();
            if (onClickUrl) {
                window.open(onClickUrl, '_blank');
            }
            notification.close();
        };
        
        setTimeout(() => {
            notification.close();
        }, 10000);
        
        playNotificationSound();
        
        return notification;
    } catch (err) {
        console.error("Error showing notification:", err);
    }
}

// ============ PLAY SOUND ============

function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.2;
        
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch(e) {
        console.log("Could not play sound");
    }
}

// ============ ADD NOTIFICATION TO DATABASE ============

async function addNotificationToDatabase(userId, userRole, title, message, type, requestId = null, propertyId = null) {
    if (!userId && userRole !== 'owner') return null;
    
    try {
        const { data, error } = await window.supabaseClient
            .from('system_notifications')
            .insert({
                user_id: userId,
                user_role: userRole,
                title: title,
                message: message,
                type: type,
                request_id: requestId,
                property_id: propertyId,
                is_read: false,
                created_at: new Date().toISOString()
            })
            .select();
        
        if (error) console.error("Error adding notification:", error);
        return data ? data[0] : null;
    } catch (err) {
        console.error("Error:", err);
        return null;
    }
}

// ============ SEND PUSH NOTIFICATION ============

async function sendPushNotification(userId, userRole, title, message, type, requestId = null, propertyId = null) {
    console.log(`Sending push notification to ${userRole} (${userId}): ${title}`);
    
    await addNotificationToDatabase(userId, userRole, title, message, type, requestId, propertyId);
    
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === userId) {
        let onClickUrl = null;
        if (type === 'payment' && userRole === 'worker') {
            onClickUrl = '/worker-dashboard.html';
        } else if (type === 'payment' && userRole === 'property_admin') {
            onClickUrl = '/property-admin-dashboard.html';
        } else if (type === 'payment' && userRole === 'owner') {
            onClickUrl = '/owner-dashboard.html';
        } else if (userRole === 'super_admin') {
            onClickUrl = '/super-admin-dashboard.html';
        } else if (type === 'remittance' && userRole === 'owner') {
            onClickUrl = '/owner-dashboard.html';
        }
        
        showLocalNotification(title, message, '/favicon.ico', onClickUrl);
    }
}

// ============ NOTIFICATION TRIGGERS ============

async function notifyWorkerPaymentRequest(workerId, workerName, amount, roomNumber, propertyId) {
    await sendPushNotification(
        workerId,
        'worker',
        '💰 Payment Request Sent',
        `Your payment request of UGX ${amount.toLocaleString()} for ${roomNumber} has been sent to admin for approval.`,
        'payment',
        null,
        propertyId
    );
}

async function notifyAdminPaymentRequest(adminId, adminName, workerName, amount, roomNumber, requestId, propertyId) {
    await sendPushNotification(
        adminId,
        'property_admin',
        '💰 Payment Approval Needed',
        `${workerName} requested approval for payment of UGX ${amount.toLocaleString()} from ${roomNumber}`,
        'payment',
        requestId,
        propertyId
    );
}

async function notifyWorkerPaymentApproved(workerId, workerName, amount, transactionId, propertyId) {
    await sendPushNotification(
        workerId,
        'worker',
        '✅ Payment Approved',
        `Your payment of UGX ${amount.toLocaleString()} has been approved. Transaction ID: ${transactionId}`,
        'payment',
        null,
        propertyId
    );
}

async function notifyWorkerPaymentRejected(workerId, workerName, amount, reason, propertyId) {
    await sendPushNotification(
        workerId,
        'worker',
        '❌ Payment Rejected',
        `Your payment request of UGX ${amount.toLocaleString()} was rejected. Reason: ${reason}`,
        'payment',
        null,
        propertyId
    );
}

async function notifySuperAdminPaymentApproved(superAdminId, adminName, workerName, amount, roomNumber, propertyId) {
    await sendPushNotification(
        superAdminId,
        'super_admin',
        '💰 Payment Approved',
        `${adminName} approved payment of UGX ${amount.toLocaleString()} from ${workerName} for ${roomNumber}`,
        'payment',
        null,
        propertyId
    );
}

async function notifyOwnerPaymentReceived(ownerId, ownerName, amount, propertyName, transactionId) {
    if (ownerId) {
        await sendPushNotification(
            ownerId,
            'owner',
            '💰 Payment Received',
            `A payment of UGX ${amount.toLocaleString()} has been received for ${propertyName}. Transaction ID: ${transactionId}`,
            'payment',
            null,
            null
        );
    }
}

async function notifySuperAdminRemittance(superAdminId, adminName, amount, method, propertyName, propertyId) {
    await sendPushNotification(
        superAdminId,
        'super_admin',
        '💰 Remittance Sent',
        `${adminName} remitted UGX ${amount.toLocaleString()} to owner of ${propertyName} via ${method}`,
        'remittance',
        null,
        propertyId
    );
}

async function notifyOwnerRemittance(ownerId, ownerName, amount, method, propertyName) {
    if (ownerId) {
        await sendPushNotification(
            ownerId,
            'owner',
            '💰 Funds Sent to You',
            `UGX ${amount.toLocaleString()} has been sent to you via ${method} from ${propertyName}`,
            'remittance',
            null,
            null
        );
    }
}

async function notifySuperAdminBillPaid(superAdminId, adminName, billType, amount, propertyName, propertyId) {
    await sendPushNotification(
        superAdminId,
        'super_admin',
        '🧾 Bill Paid',
        `${adminName} paid ${billType} bill of UGX ${amount.toLocaleString()} for ${propertyName}`,
        'bill',
        null,
        propertyId
    );
}

async function notifySuperAdminMonthReset(superAdminId, adminName, newMonth, propertyName, propertyId) {
    await sendPushNotification(
        superAdminId,
        'super_admin',
        '📅 Month Reset',
        `${adminName} reset month to ${newMonth} for ${propertyName}`,
        'system',
        null,
        propertyId
    );
}

async function notifySuperAdminStatementGenerated(superAdminId, adminName, month, propertyName, propertyId) {
    await sendPushNotification(
        superAdminId,
        'super_admin',
        '📄 Statement Generated',
        `${adminName} generated a statement for ${month} for ${propertyName}`,
        'system',
        null,
        propertyId
    );
}

async function notifySuperAdminPropertyEditRequest(superAdminId, adminName, propertyName, propertyId) {
    await sendPushNotification(
        superAdminId,
        'super_admin',
        '✏️ Property Edit Request',
        `${adminName} requested to edit property ${propertyName}. Please review.`,
        'approval',
        null,
        propertyId
    );
}

async function notifySuperAdminFeeChangeRequest(superAdminId, adminName, oldFee, newFee, propertyName, propertyId) {
    await sendPushNotification(
        superAdminId,
        'super_admin',
        '💰 Fee Change Request',
        `${adminName} requested to change fee from ${oldFee}% to ${newFee}% for ${propertyName}`,
        'approval',
        null,
        propertyId
    );
}

// ============ GET NOTIFICATIONS ============

async function getUnreadNotifications(userId = null) {
    const targetUserId = userId || (getCurrentUser()?.id);
    if (!targetUserId) return [];
    
    try {
        const { data, error } = await window.supabaseClient
            .from('system_notifications')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('is_read', false)
            .order('created_at', { ascending: false });
        
        if (error) return [];
        return data || [];
    } catch (err) {
        console.error("Error getting notifications:", err);
        return [];
    }
}

async function getAllNotifications(userId = null, limit = 50) {
    const targetUserId = userId || (getCurrentUser()?.id);
    if (!targetUserId) return [];
    
    try {
        const { data, error } = await window.supabaseClient
            .from('system_notifications')
            .select('*')
            .eq('user_id', targetUserId)
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (error) return [];
        return data || [];
    } catch (err) {
        console.error("Error getting notifications:", err);
        return [];
    }
}

async function markNotificationAsRead(notificationId) {
    try {
        await window.supabaseClient
            .from('system_notifications')
            .update({ is_read: true })
            .eq('id', notificationId);
        
        updateNotificationBadge();
    } catch (err) {
        console.error("Error marking as read:", err);
    }
}

async function markAllNotificationsAsRead() {
    const user = getCurrentUser();
    if (!user) return;
    
    try {
        await window.supabaseClient
            .from('system_notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false);
        
        updateNotificationBadge();
    } catch (err) {
        console.error("Error marking all as read:", err);
    }
}

async function updateNotificationBadge() {
    const user = getCurrentUser();
    if (!user) return;
    
    try {
        const { data, error } = await window.supabaseClient
            .from('system_notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false);
        
        if (error) throw error;
        
        const count = data?.length || 0;
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    } catch (err) {
        console.error("Error updating badge:", err);
    }
}

// ============ DISPLAY NOTIFICATIONS IN DROPDOWN ============

async function displayNotificationsInDropdown(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const user = getCurrentUser();
    if (!user) {
        container.innerHTML = '<div style="padding: 15px; text-align: center;">Please login to see notifications</div>';
        return;
    }
    
    try {
        const notifications = await getAllNotifications(user.id, 20);
        
        if (!notifications || notifications.length === 0) {
            container.innerHTML = '<div style="padding: 15px; text-align: center; color: #666;"><i class="fas fa-bell-slash"></i> No notifications</div>';
            return;
        }
        
        let html = '';
        for (let notif of notifications) {
            const date = new Date(notif.created_at);
            const isUnread = !notif.is_read;
            const icon = getNotificationIcon(notif.type);
            
            html += `
                <div class="notification-item ${isUnread ? 'unread' : ''}" data-id="${notif.id}" onclick="markNotificationAsRead('${notif.id}')" style="padding: 12px; border-bottom: 1px solid #eee; background: ${isUnread ? '#fff3cd' : 'white'}; cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.2rem;">${icon}</span>
                        <div style="flex: 1;">
                            <div style="font-weight: bold; font-size: 0.85rem;">${escapeHtmlForNotification(notif.title)}</div>
                            <div style="font-size: 0.75rem; color: #555;">${escapeHtmlForNotification(notif.message)}</div>
                            <div style="font-size: 0.65rem; color: #999; margin-top: 5px;">${date.toLocaleString()}</div>
                        </div>
                        ${!isUnread ? '<span style="font-size: 0.7rem; color: #10b981;"><i class="fas fa-check-circle"></i></span>' : '<span style="font-size: 0.7rem; color: #f59e0b;"><i class="fas fa-circle"></i></span>'}
                    </div>
                </div>
            `;
        }
        
        html += `<button class="mark-all-read" onclick="markAllNotificationsAsRead()" style="width: 100%; background: #f59e0b; border: none; padding: 10px; border-radius: 0 0 12px 12px; cursor: pointer; font-weight: bold;"><i class="fas fa-check-double"></i> Mark All Read</button>`;
        
        container.innerHTML = html;
        
    } catch (err) {
        console.error("Error loading notifications:", err);
        container.innerHTML = '<div style="padding: 15px; text-align: center; color: red;">Error loading notifications</div>';
    }
}

function getNotificationIcon(type) {
    switch(type) {
        case 'payment': return '💰';
        case 'remittance': return '💸';
        case 'bill': return '🧾';
        case 'approval': return '✅';
        case 'system': return '🔔';
        default: return '📬';
    }
}

function escapeHtmlForNotification(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ============ INITIALIZE NOTIFICATION SYSTEM ============

async function initNotificationSystem() {
    console.log("Initializing notification system...");
    
    checkNotificationSupport();
    
    const notificationsEnabled = localStorage.getItem('battetech_notifications_enabled');
    if (notificationsEnabled === 'true') {
        await requestPushNotificationPermission();
    }
    
    await updateNotificationBadge();
    setInterval(updateNotificationBadge, 30000);
    
    setupRealtimeNotifications();
}

function setupRealtimeNotifications() {
    const user = getCurrentUser();
    if (!user) return;
    
    window.supabaseClient
        .channel('notifications-channel')
        .on('postgres_changes', 
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'system_notifications',
                filter: `user_id=eq.${user.id}`
            }, 
            (payload) => {
                console.log("New notification received:", payload);
                const notif = payload.new;
                showLocalNotification(notif.title, notif.message);
                updateNotificationBadge();
            }
        )
        .subscribe();
}

// ============ NOTIFY SUPER ADMIN OF EVERY ACTION ============

async function notifySuperAdminOfAction(action, details, propertyId = null, actingUserId = null, actingUserName = null) {
    try {
        const { data: superAdmin, error } = await window.supabaseClient
            .from('users')
            .select('id')
            .eq('role', 'super_admin')
            .single();
        
        if (error || !superAdmin) {
            console.log("Super admin not found");
            return;
        }
        
        if (actingUserId === superAdmin.id) return;
        
        const title = getNotificationTitleForAction(action);
        const message = `${actingUserName || 'Someone'} ${getNotificationMessageForAction(action, details)}`;
        
        await sendPushNotification(
            superAdmin.id,
            'super_admin',
            title,
            message,
            'system',
            null,
            propertyId
        );
        
        if (window.addActivityLog) {
            await window.addActivityLog('super_admin_notification', `${title}: ${message}`, propertyId);
        }
        
    } catch (err) {
        console.error("Error notifying super admin:", err);
    }
}

function getNotificationTitleForAction(action) {
    const titles = {
        'worker_created': '👷 New Worker Created',
        'admin_created': '👑 New Property Admin Created',
        'property_added': '🏢 New Property Added',
        'property_edited': '✏️ Property Edited',
        'fee_changed': '💰 Fee Changed',
        'room_added': '🏠 Room Added',
        'room_occupied': '👤 Room Occupied',
        'room_vacated': '🚪 Room Vacated',
        'room_deleted': '🗑️ Room Deleted',
        'rent_changed': '💰 Rent Changed',
        'payment_requested': '💸 Payment Requested',
        'payment_approved': '✅ Payment Approved',
        'payment_rejected': '❌ Payment Rejected',
        'remittance_sent': '💸 Remittance Sent',
        'bill_paid': '🧾 Bill Paid',
        'month_reset': '📅 Month Reset',
        'statement_generated': '📄 Statement Generated',
        'broadcast_sent': '📢 Broadcast Sent',
        'worker_transferred': '🔄 Worker Transferred',
        'admin_transferred': '🔄 Admin Transferred',
        'tenant_evacuated': '🚪 Tenant Evacuated',
        'user_login': '🔐 User Login',
        'approval_requested': '📋 Approval Requested',
        'approval_granted': '✅ Approval Granted'
    };
    return titles[action] || '🔔 System Notification';
}

function getNotificationMessageForAction(action, details) {
    const messages = {
        'worker_created': `created a new worker: ${details.workerName}`,
        'admin_created': `created a new property admin: ${details.adminName}`,
        'property_added': `added a new property: ${details.propertyName}`,
        'property_edited': `edited property: ${details.propertyName}`,
        'fee_changed': `changed management fee from ${details.oldFee}% to ${details.newFee}% for ${details.propertyName}`,
        'room_added': `added room ${details.roomNumber} (UGX ${details.rentAmount?.toLocaleString()}) to ${details.propertyName}`,
        'room_occupied': `marked room ${details.roomNumber} as occupied by ${details.tenantName} at ${details.propertyName}`,
        'room_vacated': `marked room ${details.roomNumber} as vacant at ${details.propertyName}`,
        'room_deleted': `deleted room ${details.roomNumber} from ${details.propertyName}`,
        'rent_changed': `changed rent for ${details.roomNumber} from UGX ${details.oldRent?.toLocaleString()} to UGX ${details.newRent?.toLocaleString()}`,
        'payment_requested': `requested payment approval of UGX ${details.amount?.toLocaleString()} for ${details.roomNumber}`,
        'payment_approved': `approved payment of UGX ${details.amount?.toLocaleString()} for ${details.roomNumber}`,
        'payment_rejected': `rejected payment request of UGX ${details.amount?.toLocaleString()} for ${details.roomNumber}. Reason: ${details.reason}`,
        'remittance_sent': `sent remittance of UGX ${details.amount?.toLocaleString()} to owner of ${details.propertyName}`,
        'bill_paid': `paid ${details.billType} bill of UGX ${details.amount?.toLocaleString()} for ${details.propertyName}`,
        'month_reset': `reset month to ${details.newMonth} for ${details.propertyName}`,
        'statement_generated': `generated statement for ${details.month} for ${details.propertyName}`,
        'broadcast_sent': `sent a broadcast to ${details.recipientCount} recipients`,
        'worker_transferred': `transferred worker ${details.workerName} from ${details.oldAdmin} to ${details.newAdmin}`,
        'admin_transferred': `transferred admin ${details.adminName} to property ${details.propertyName}`,
        'tenant_evacuated': `evacuated tenant ${details.tenantName} from ${details.roomNumber} at ${details.propertyName}`,
        'user_login': `logged into the system (Role: ${details.role})`,
        'approval_requested': `requested approval for ${details.approvalType}`,
        'approval_granted': `granted approval for ${details.approvalType}`
    };
    return messages[action] || `performed action: ${action}`;
}

// ============ PROPERTY OWNER NOTIFICATIONS ============

async function notifyOwnerOfPropertyAction(propertyId, action, details, additionalMessage = "") {
    try {
        const { data: property, error } = await window.supabaseClient
            .from('properties')
            .select('id, name, owner_name, owner_phone, owner_password')
            .eq('id', propertyId)
            .single();
        
        if (error || !property) {
            console.error("Property not found for owner notification");
            return;
        }
        
        const title = getOwnerNotificationTitle(action);
        const message = `${getOwnerNotificationMessage(action, details)} for ${property.name}. ${additionalMessage}`;
        
        await addNotificationToDatabase(
            null,
            'owner',
            title,
            message,
            'property_update',
            null,
            propertyId
        );
        
        if (property.owner_phone) {
            let phone = property.owner_phone.replace(/\s/g, '');
            if (phone.startsWith('0')) phone = '256' + phone.substring(1);
            const whatsappMsg = `🏢 BATTETECH PROPERTY UPDATE\n\nDear ${property.owner_name || 'Property Owner'},\n\n${title}\n${message}\n\nLogin to your dashboard for more details.\n\n- BattleTech Management`;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMsg)}`, '_blank');
        }
        
        const currentUser = getCurrentUser();
        if (currentUser && currentUser.role === 'owner' && currentUser.propertyId === propertyId) {
            showLocalNotification(title, message);
        }
        
    } catch (err) {
        console.error("Error notifying property owner:", err);
    }
}

function getOwnerNotificationTitle(action) {
    const titles = {
        'room_added': '🏠 New Room Added',
        'room_occupied': '👤 Room Now Occupied',
        'room_vacated': '🚪 Room Now Vacant',
        'room_deleted': '🗑️ Room Deleted',
        'rent_changed': '💰 Rent Updated',
        'tenant_edited': '✏️ Tenant Details Updated',
        'payment_received': '💰 Payment Received',
        'remittance_sent': '💸 Funds Sent to You',
        'bill_paid': '🧾 Bill Paid on Your Behalf',
        'month_reset': '📅 New Month Started',
        'statement_generated': '📄 Monthly Statement Ready',
        'fee_changed': '💰 Management Fee Changed',
        'property_edited': '✏️ Property Details Updated',
        'evacuation': '🚪 Tenant Evacuated',
        'broadcast': '📢 Important Notice'
    };
    return titles[action] || '🔔 Property Update';
}

function getOwnerNotificationMessage(action, details) {
    const messages = {
        'room_added': `A new room "${details.roomNumber}" has been added with rent UGX ${details.rentAmount?.toLocaleString()}/month`,
        'room_occupied': `Room ${details.roomNumber} is now occupied by ${details.tenantName} (Rent: UGX ${details.rentAmount?.toLocaleString()}/month)`,
        'room_vacated': `Room ${details.roomNumber} is now vacant`,
        'room_deleted': `Room ${details.roomNumber} has been removed`,
        'rent_changed': `Rent for ${details.roomNumber} changed from UGX ${details.oldRent?.toLocaleString()} to UGX ${details.newRent?.toLocaleString()}/month`,
        'tenant_edited': `Tenant information for ${details.roomNumber} has been updated`,
        'payment_received': `Payment of UGX ${details.amount?.toLocaleString()} has been received for ${details.roomNumber}`,
        'remittance_sent': `UGX ${details.amount?.toLocaleString()} has been sent to you via ${details.method}`,
        'bill_paid': `${details.billType} bill of UGX ${details.amount?.toLocaleString()} has been paid on your behalf`,
        'month_reset': `A new month (${details.newMonth}) has started. Unpaid balances have been carried forward.`,
        'statement_generated': `Your monthly statement for ${details.month} is ready to view`,
        'fee_changed': `Management fee changed from ${details.oldFee}% to ${details.newFee}%`,
        'property_edited': `Your property details have been updated`,
        'evacuation': `Tenant ${details.tenantName} has been evacuated from ${details.roomNumber}`,
        'broadcast': `${details.message}`
    };
    return messages[action] || `Update on your property: ${JSON.stringify(details)}`;
}

async function notifyOwnerRoomAdded(propertyId, roomNumber, rentAmount) {
    await notifyOwnerOfPropertyAction(propertyId, 'room_added', { roomNumber, rentAmount });
}

async function notifyOwnerRoomOccupied(propertyId, roomNumber, tenantName, rentAmount) {
    await notifyOwnerOfPropertyAction(propertyId, 'room_occupied', { roomNumber, tenantName, rentAmount });
}

async function notifyOwnerRoomVacated(propertyId, roomNumber) {
    await notifyOwnerOfPropertyAction(propertyId, 'room_vacated', { roomNumber });
}

async function notifyOwnerRoomDeleted(propertyId, roomNumber) {
    await notifyOwnerOfPropertyAction(propertyId, 'room_deleted', { roomNumber });
}

async function notifyOwnerRentChanged(propertyId, roomNumber, oldRent, newRent) {
    await notifyOwnerOfPropertyAction(propertyId, 'rent_changed', { roomNumber, oldRent, newRent });
}

async function notifyOwnerTenantEdited(propertyId, roomNumber) {
    await notifyOwnerOfPropertyAction(propertyId, 'tenant_edited', { roomNumber });
}

async function notifyOwnerPaymentReceived(propertyId, roomNumber, amount, transactionId) {
    await notifyOwnerOfPropertyAction(propertyId, 'payment_received', { roomNumber, amount, transactionId }, `Transaction ID: ${transactionId}`);
}

async function notifyOwnerRemittanceSent(propertyId, amount, method) {
    await notifyOwnerOfPropertyAction(propertyId, 'remittance_sent', { amount, method });
}

async function notifyOwnerBillPaid(propertyId, billType, amount) {
    await notifyOwnerOfPropertyAction(propertyId, 'bill_paid', { billType, amount });
}

async function notifyOwnerMonthReset(propertyId, newMonth) {
    await notifyOwnerOfPropertyAction(propertyId, 'month_reset', { newMonth });
}

async function notifyOwnerStatementGenerated(propertyId, month) {
    await notifyOwnerOfPropertyAction(propertyId, 'statement_generated', { month });
}

async function notifyOwnerFeeChanged(propertyId, oldFee, newFee) {
    await notifyOwnerOfPropertyAction(propertyId, 'fee_changed', { oldFee, newFee });
}

async function notifyOwnerPropertyEdited(propertyId) {
    await notifyOwnerOfPropertyAction(propertyId, 'property_edited', {});
}

async function notifyOwnerEvacuation(propertyId, roomNumber, tenantName) {
    await notifyOwnerOfPropertyAction(propertyId, 'evacuation', { roomNumber, tenantName });
}

async function notifyOwnerBroadcast(propertyId, message) {
    await notifyOwnerOfPropertyAction(propertyId, 'broadcast', { message });
}

// ============ CREATE SYSTEM_NOTIFICATIONS TABLE ============

const createNotificationsTableSQL = `
CREATE TABLE IF NOT EXISTS public.system_notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT,
    user_role TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    request_id TEXT,
    property_id TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.system_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_role ON public.system_notifications(user_role);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.system_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.system_notifications(created_at DESC);
`;

// ============ BACKWARD COMPATIBILITY ============

async function addNotification(userId, userRole, title, message, type, requestId = null, propertyId = null) {
    await sendPushNotification(userId, userRole, title, message, type, requestId, propertyId);
}

async function notifyAdminPaymentApproval(adminId, adminName, requestId, amount, tenantName, roomNumber, propertyId) {
    await notifyAdminPaymentRequest(adminId, adminName, '', amount, roomNumber || tenantName, requestId, propertyId);
}

async function notifySuperAdminBroadcastApproval(superAdminId, requestId, senderName, broadcastType) {
    await sendPushNotification(
        superAdminId,
        'super_admin',
        '📢 Broadcast Approval Needed',
        `${senderName} requested approval to broadcast to ${broadcastType}`,
        'broadcast',
        requestId
    );
}

async function notifyWorkerDecision(workerId, workerName, actionType, status, reason = null) {
    const title = status === 'approved' ? '✅ Request Approved' : '❌ Request Rejected';
    const message = status === 'approved'
        ? `Your ${actionType} request has been approved.`
        : `Your ${actionType} request was rejected. ${reason ? `Reason: ${reason}` : ''}`;
    await sendPushNotification(workerId, 'worker', title, message, 'system');
}

async function notifyPropertyOwner(ownerId, ownerName, propertyName, amount, tenantName, roomNumber) {
    if (ownerId) {
        await sendPushNotification(
            ownerId,
            'owner',
            '💰 Payment Received',
            `Payment of UGX ${amount.toLocaleString()} received from ${tenantName} (${roomNumber}) for ${propertyName}`,
            'payment',
            null,
            null
        );
    }
}

async function notifyTenant(tenantId, tenantName, roomNumber, amount, propertyName) {
    if (tenantId) {
        await sendPushNotification(
            tenantId,
            'tenant',
            '🏠 Rent Reminder',
            `Your rent of UGX ${amount.toLocaleString()} for ${propertyName} (${roomNumber}) is due`,
            'rental',
            null,
            null
        );
    }
}

async function notifyAdminWorkerActivity(adminId, workerName, action, details) {
    await sendPushNotification(
        adminId,
        'property_admin',
        `👷 Worker Activity: ${action}`,
        `${workerName} ${details}`,
        'system'
    );
}

async function notifySuperAdminSystemEvent(superAdminId, title, message) {
    await sendPushNotification(superAdminId, 'super_admin', title, message, 'system');
}

async function getUnreadNotificationsCount() {
    const notifications = await getUnreadNotifications();
    return notifications.length;
}

// Make functions globally available
window.requestPushNotificationPermission = requestPushNotificationPermission;
window.initNotificationSystem = initNotificationSystem;
window.sendPushNotification = sendPushNotification;
window.getUnreadNotifications = getUnreadNotifications;
window.markNotificationAsRead = markNotificationAsRead;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;
window.displayNotificationsInDropdown = displayNotificationsInDropdown;
window.updateNotificationBadge = updateNotificationBadge;
window.addNotification = addNotification;
window.addNotificationToDatabase = addNotificationToDatabase;
window.showLocalNotification = showLocalNotification;
window.getUnreadNotificationsCount = getUnreadNotificationsCount;

window.notifyWorkerPaymentRequest = notifyWorkerPaymentRequest;
window.notifyAdminPaymentRequest = notifyAdminPaymentRequest;
window.notifyWorkerPaymentApproved = notifyWorkerPaymentApproved;
window.notifyWorkerPaymentRejected = notifyWorkerPaymentRejected;
window.notifySuperAdminPaymentApproved = notifySuperAdminPaymentApproved;
window.notifyOwnerPaymentReceived = notifyOwnerPaymentReceived;
window.notifySuperAdminRemittance = notifySuperAdminRemittance;
window.notifyOwnerRemittance = notifyOwnerRemittance;
window.notifySuperAdminBillPaid = notifySuperAdminBillPaid;
window.notifySuperAdminMonthReset = notifySuperAdminMonthReset;
window.notifySuperAdminStatementGenerated = notifySuperAdminStatementGenerated;
window.notifySuperAdminPropertyEditRequest = notifySuperAdminPropertyEditRequest;
window.notifySuperAdminFeeChangeRequest = notifySuperAdminFeeChangeRequest;
window.notifySuperAdminOfAction = notifySuperAdminOfAction;
window.notifyOwnerOfPropertyAction = notifyOwnerOfPropertyAction;
window.notifyOwnerRoomAdded = notifyOwnerRoomAdded;
window.notifyOwnerRoomOccupied = notifyOwnerRoomOccupied;
window.notifyOwnerRoomVacated = notifyOwnerRoomVacated;
window.notifyOwnerRoomDeleted = notifyOwnerRoomDeleted;
window.notifyOwnerRentChanged = notifyOwnerRentChanged;
window.notifyOwnerTenantEdited = notifyOwnerTenantEdited;
window.notifyOwnerPaymentReceived = notifyOwnerPaymentReceived;
window.notifyOwnerRemittanceSent = notifyOwnerRemittanceSent;
window.notifyOwnerBillPaid = notifyOwnerBillPaid;
window.notifyOwnerMonthReset = notifyOwnerMonthReset;
window.notifyOwnerStatementGenerated = notifyOwnerStatementGenerated;
window.notifyOwnerFeeChanged = notifyOwnerFeeChanged;
window.notifyOwnerPropertyEdited = notifyOwnerPropertyEdited;
window.notifyOwnerEvacuation = notifyOwnerEvacuation;
window.notifyOwnerBroadcast = notifyOwnerBroadcast;
window.notifyAdminPaymentApproval = notifyAdminPaymentApproval;
window.notifySuperAdminBroadcastApproval = notifySuperAdminBroadcastApproval;
window.notifyWorkerDecision = notifyWorkerDecision;
window.notifyPropertyOwner = notifyPropertyOwner;
window.notifyTenant = notifyTenant;
window.notifyAdminWorkerActivity = notifyAdminWorkerActivity;
window.notifySuperAdminSystemEvent = notifySuperAdminSystemEvent;
