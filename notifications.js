// notifications.js - COMPLETE NOTIFICATION SYSTEM
// Supports: Browser Push Notifications + WhatsApp Backup + Multi-device

// ============ DEVICE REGISTRATION ============

let currentDeviceId = null;

// Generate or get unique device ID
function getDeviceId() {
    let deviceId = localStorage.getItem('battetech_device_id');
    if (!deviceId) {
        deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('battetech_device_id', deviceId);
    }
    return deviceId;
}

// Register current device for notifications
async function registerDeviceForNotifications() {
    const user = getCurrentUser();
    if (!user) return;
    
    currentDeviceId = getDeviceId();

    // Get device info
    const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenSize: `${screen.width}x${screen.height}`,
        lastActive: new Date().toISOString()
    };
    
    // Check if this device is already registered
    const { data: existing } = await window.supabaseClient
        .from('user_devices')
        .select('id')
        .eq('user_id', user.id)
        .eq('device_id', currentDeviceId)
        .single();

    if (existing) {
        // Update last active timestamp
        await window.supabaseClient
            .from('user_devices')
            .update({ 
                last_active: new Date().toISOString(),
                device_info: deviceInfo
            })
            .eq('id', existing.id);
    } else {
        // Register new device
        await window.supabaseClient
            .from('user_devices')
            .insert({
                user_id: user.id,
                user_role: user.role,
                device_id: currentDeviceId,
                device_info: deviceInfo,
                is_active: true,
                last_active: new Date().toISOString(),
                created_at: new Date().toISOString()
            });
    }
    
    // Mark this as the primary device if it's the most active
    await updatePrimaryDevice(user.id);
    
    return currentDeviceId;
}

// Determine which device should receive notifications
async function updatePrimaryDevice(userId) {
    // Get all devices for this user, ordered by last_active
    const { data: devices } = await window.supabaseClient
        .from('user_devices')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('last_active', { ascending: false });

    if (!devices || devices.length === 0) return;
    
    // The most recently active device becomes primary
    const primaryDevice = devices[0];
    
    // Update all devices - set primary for the most active
    for (let device of devices) {
        await window.supabaseClient
            .from('user_devices')
            .update({ is_primary: device.id === primaryDevice.id })
            .eq('id', device.id);
    }
}

// Update device activity (call this on user interaction)
function updateDeviceActivity() {
    if (!currentDeviceId) return;
    
    window.supabaseClient
        .from('user_devices')
        .update({ last_active: new Date().toISOString() })
        .eq('device_id', currentDeviceId)
        .then(() => {
            // Also update primary device
            const user = getCurrentUser();
            if (user) updatePrimaryDevice(user.id);
        });
}

// Track user activity
function startActivityTracking() {
    const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];
    events.forEach(event => {
        document.addEventListener(event, () => updateDeviceActivity());
    });
}

// ============ PUSH NOTIFICATION SETUP ============

let pushSubscription = null;

async function subscribeToPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push notifications not supported');
        return false;
    }
    
    try {
        // Register service worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered');
        
        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('Notification permission denied');
            return false;
        }
        
        // Subscribe to push
        pushSubscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array('YOUR_VAPID_PUBLIC_KEY')
        });
        
        // Save subscription to database with device info
        const user = getCurrentUser();
        if (user) {
            await window.supabaseClient
                .from('push_subscriptions')
                .upsert({
                    user_id: user.id,
                    user_role: user.role,
                    device_id: currentDeviceId,
                    subscription: JSON.stringify(pushSubscription),
                    is_active: true,
                    updated_at: new Date().toISOString()
                });
        }
        
        console.log('Push subscription successful');
        return true;
        
    } catch (err) {
        console.error('Push subscription failed:', err);
        return false;
    }
}

// Helper function for VAPID key
function urlBase64ToUint8Array(base64String) {
    // Remove any whitespace and handle URL-safe encoding
    const cleanBase64 = base64String.replace(/\s/g, '');
    const padding = '='.repeat((4 - cleanBase64.length % 4) % 4);
    const base64 = (cleanBase64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    
    try {
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    } catch (e) {
        console.warn('Invalid VAPID key, push notifications disabled');
        return new Uint8Array(0);
    }
}

// ============ SEND NOTIFICATION TO USER (INTELLIGENT ROUTING) ============

async function sendNotificationToUser(userId, userRole, title, message, type, requestId = null, propertyId = null) {
    console.log(`Sending notification to ${userRole} (${userId}): ${title}`);
    
    // 1. Save to database
    await addNotificationToDatabase(userId, userRole, title, message, type, requestId, propertyId);
    
    // 2. Get user's active devices
    const { data: devices } = await window.supabaseClient
        .from('user_devices')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false })
        .order('last_active', { ascending: false });

    // 3. Send to primary device (most recently active) if available
    if (devices && devices.length > 0) {
        const primaryDevice = devices[0];
        
        // Send browser push notification
        if (primaryDevice.push_subscription) {
            await sendPushToDevice(primaryDevice.push_subscription, title, message);
        }
        
        // Also send WhatsApp as backup for certain notification types
        if (type === 'payment' || type === 'remittance' || type === 'evacuation') {
            await sendWhatsAppBackup(userId, userRole, title, message, propertyId);
        }
    } else {
        // No active device - send WhatsApp only
        await sendWhatsAppBackup(userId, userRole, title, message, propertyId);
    }
    
    // 4. If current user is the recipient, show local notification
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === userId) {
        showLocalNotification(title, message);
    }
}

// Send push to specific device
async function sendPushToDevice(subscription, title, message) {
    try {
        // Call Supabase Edge Function to send push
        const { data, error } = await window.supabaseClient.functions.invoke('send-push', {
            body: {
                subscription: subscription,
                title: title,
                body: message,
                icon: '/favicon.ico'
            }
        });
        
        if (error) console.error('Push send error:', error);
    } catch (err) {
        console.error('Failed to send push:', err);
    }
}

// WhatsApp backup notification
async function sendWhatsAppBackup(userId, userRole, title, message, propertyId) {
    let phoneNumber = null;
    
    if (userRole === 'owner' && propertyId) {
        const { data: property } = await window.supabaseClient
            .from('properties')
            .select('owner_phone')
            .eq('id', propertyId)
            .single();
        phoneNumber = property?.owner_phone;
    } else {
        const { data: user } = await window.supabaseClient
            .from('users')
            .select('phone')
            .eq('id', userId)
            .single();
        phoneNumber = user?.phone;
    }
    
    if (phoneNumber) {
        let phone = phoneNumber.replace(/\s/g, '');
        if (phone.startsWith('0')) phone = '256' + phone.substring(1);
        
        const whatsappMsg = `🏢 BATTETECH NOTIFICATION\n\n${title}\n\n${message}\n\nTap to open dashboard: ${window.location.origin}`;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMsg)}`, '_blank');
    }
}

// ============ DATABASE FUNCTIONS ============

async function addNotificationToDatabase(userId, userRole, title, message, type, requestId = null, propertyId = null) {
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

async function getUnreadNotifications(userId = null) {
    const targetUserId = userId || (getCurrentUser()?.id);
    if (!targetUserId) return [];
    
    const { data, error } = await window.supabaseClient
        .from('system_notifications')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('is_read', false)
        .order('created_at', { ascending: false });
    
    if (error) return [];
    return data || [];
}

async function markNotificationAsRead(notificationId) {
    await window.supabaseClient
        .from('system_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
    updateNotificationBadge();
}

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

async function updateNotificationBadge() {
    const user = getCurrentUser();
    if (!user) return;
    
    const notifications = await getUnreadNotifications(user.id);
    const count = notifications.length;
    
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// ============ LOCAL NOTIFICATION ============

function showLocalNotification(title, message, icon = '/favicon.ico', onClickUrl = null) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    
    try {
        const notification = new Notification(title, {
            body: message,
            icon: icon,
            badge: icon,
            vibrate: [200, 100, 200],
            requireInteraction: false
        });
        
        notification.onclick = function(event) {
            event.preventDefault();
            window.focus();
            if (onClickUrl) {
                window.open(onClickUrl, '_blank');
            }
            notification.close();
        };
        
        setTimeout(() => notification.close(), 8000);
        
    } catch (err) {
        console.error("Error showing notification:", err);
    }
}

// ============ INITIALIZATION ============

async function initNotificationSystem() {
    console.log("Initializing complete notification system...");
    
    // Register device
    await registerDeviceForNotifications();
    
    // Start activity tracking
    startActivityTracking();
    
    // Request notification permission
    if ('Notification' in window && Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            await subscribeToPushNotifications();
        }
    }
    
    // Setup realtime listener
    setupRealtimeNotifications();
    
    // Update badge
    await updateNotificationBadge();
    setInterval(updateNotificationBadge, 30000);
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
                const notif = payload.new;
                showLocalNotification(notif.title, notif.message);
                updateNotificationBadge();
            }
        )
        .subscribe();
}

// ============ NOTIFICATION TRIGGERS FOR ALL ACTIONS ============

async function notifyAllAdmins(title, message, type, propertyId = null) {
    // Get all property admins and super admin
    const { data: admins } = await window.supabaseClient
        .from('users')
        .select('id, role')
        .in('role', ['super_admin', 'property_admin']);
    
    for (let admin of admins || []) {
        await sendNotificationToUser(admin.id, admin.role, title, message, type, null, propertyId);
    }
}

async function notifyPropertyTeam(propertyId, title, message, type) {
    // Get property admin for this property
    const { data: property } = await window.supabaseClient
        .from('properties')
        .select('admin_id')
        .eq('id', propertyId)
        .single();
    
    if (property?.admin_id) {
        await sendNotificationToUser(property.admin_id, 'property_admin', title, message, type, null, propertyId);
    }
    
    // Also notify super admin
    const { data: superAdmin } = await window.supabaseClient
        .from('users')
        .select('id')
        .eq('role', 'super_admin')
        .single();
    
    if (superAdmin) {
        await sendNotificationToUser(superAdmin.id, 'super_admin', title, message, type, null, propertyId);
    }
}

// Export functions
window.initNotificationSystem = initNotificationSystem;
window.sendNotificationToUser = sendNotificationToUser;
window.notifyAllAdmins = notifyAllAdmins;
window.notifyPropertyTeam = notifyPropertyTeam;
window.getUnreadNotifications = getUnreadNotifications;
window.markNotificationAsRead = markNotificationAsRead;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;
window.updateNotificationBadge = updateNotificationBadge;
window.showLocalNotification = showLocalNotification;

