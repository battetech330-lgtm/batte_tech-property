// auth.js - Authentication and User Management

// Get current user from localStorage
function getCurrentUser() {
    const userId = localStorage.getItem('battetech_user_id');
    const userRole = localStorage.getItem('battetech_user_role');
    const userName = localStorage.getItem('battetech_user_name');
    const userEmail = localStorage.getItem('battetech_user_email');
    const userPhone = localStorage.getItem('battetech_user_phone');
    const userPhoto = localStorage.getItem('battetech_user_photo');
    const parentId = localStorage.getItem('battetech_parent_id');
    const propertyId = localStorage.getItem('battetech_property_id');
    
    console.log('getCurrentUser called - userId:', userId, 'role:', userRole);
    
    if (!userId) return null;
    
    return {
        id: userId,
        role: userRole,
        name: userName,
        email: userEmail,
        phone: userPhone,
        photo: userPhoto,
        parentId: parentId,
        propertyId: propertyId
    };
}

// Check if user is logged in
function isLoggedIn() {
    return localStorage.getItem('battetech_user_id') !== null;
}

// Get user role
function getUserRole() {
    return localStorage.getItem('battetech_user_role');
}

// Check if current user is Super Admin
function isSuperAdmin() {
    return getUserRole() === 'super_admin';
}

// Check if current user is Property Admin
function isPropertyAdmin() {
    return getUserRole() === 'property_admin';
}

// Check if current user is Worker
function isWorker() {
    return getUserRole() === 'worker';
}

// Logout function
function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

// Check session expiry (5 minutes)
function checkSession() {
    const sessionTime = parseInt(localStorage.getItem('battetech_session_time') || '0');
    if (Date.now() - sessionTime > 300000) {
        localStorage.clear();
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Refresh session
function refreshSession() {
    localStorage.setItem('battetech_session_time', Date.now());
}

// Get current property ID
function getCurrentPropertyId() {
    return localStorage.getItem('battetech_current_property');
}

// Set current property ID
function setCurrentPropertyId(propertyId) {
    localStorage.setItem('battetech_current_property', propertyId);
}