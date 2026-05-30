// admin-users.js - Local storage user management (no Supabase needed)

// Initialize users in localStorage if not exists
function initUserSystem() {
    if (!localStorage.getItem('battetech_all_users')) {
        const defaultUsers = {
            super_admin: {
                id: 'super_1',
                password: 'wendy200?',
                full_name: 'Batte Tech',
                role: 'super_admin',
                status: 'active',
                created_at: new Date().toISOString()
            },
            property_admins: {},
            workers: {}
        };
        localStorage.setItem('battetech_all_users', JSON.stringify(defaultUsers));
    }
}

// Get all users
function getAllUsers() {
    initUserSystem();
    const data = JSON.parse(localStorage.getItem('battetech_all_users'));
    return data;
}

// Save users
function saveAllUsers(data) {
    localStorage.setItem('battetech_all_users', JSON.stringify(data));
}

// Get all property admins
function getPropertyAdmins() {
    const data = getAllUsers();
    return Object.values(data.property_admins);
}

// Get all workers
function getAllWorkers() {
    const data = getAllUsers();
    return Object.values(data.workers);
}

// Get workers under a specific admin
function getWorkersByAdmin(adminId) {
    const data = getAllUsers();
    const workers = [];
    for (let workerId in data.workers) {
        if (data.workers[workerId].admin_id === adminId) {
            workers.push(data.workers[workerId]);
        }
    }
    return workers;
}

// Create property admin
function createPropertyAdmin(name, email, phone, password, photoUrl) {
    const data = getAllUsers();
    const adminId = 'admin_' + Date.now();
    
    data.property_admins[adminId] = {
        id: adminId,
        full_name: name,
        email: email,
        phone: phone,
        password: password,
        photo_url: photoUrl || '',
        role: 'property_admin',
        status: 'active',
        created_at: new Date().toISOString()
    };
    
    saveAllUsers(data);
    return adminId;
}

// Create worker under an admin
function createWorker(adminId, name, email, phone, password, photoUrl, propertyId) {
    const data = getAllUsers();
    const workerId = 'worker_' + Date.now();
    
    data.workers[workerId] = {
        id: workerId,
        full_name: name,
        email: email,
        phone: phone,
        password: password,
        photo_url: photoUrl || '',
        role: 'worker',
        admin_id: adminId,
        property_id: propertyId,
        status: 'active',
        created_at: new Date().toISOString()
    };
    
    saveAllUsers(data);
    return workerId;
}

// Freeze/unfreeze user
function setUserStatus(userId, role, status) {
    const data = getAllUsers();
    
    if (role === 'property_admin') {
        if (data.property_admins[userId]) {
            data.property_admins[userId].status = status;
        }
    } else if (role === 'worker') {
        if (data.workers[userId]) {
            data.workers[userId].status = status;
        }
    }
    
    saveAllUsers(data);
}

// Delete/fire worker
function deleteWorker(workerId) {
    const data = getAllUsers();
    delete data.workers[workerId];
    saveAllUsers(data);
}

// Find user by password (for login)
function findUserByPassword(password) {
    const data = getAllUsers();
    
    // Check super admin
    if (data.super_admin.password === password) {
        return { ...data.super_admin, id: 'super_1' };
    }
    
    // Check property admins
    for (let id in data.property_admins) {
        if (data.property_admins[id].password === password) {
            return data.property_admins[id];
        }
    }
    
    // Check workers
    for (let id in data.workers) {
        if (data.workers[id].password === password) {
            return data.workers[id];
        }
    }
    
    return null;
}

// Get user by ID
function getUserById(userId, role) {
    const data = getAllUsers();
    
    if (role === 'super_admin' && userId === 'super_1') {
        return data.super_admin;
    }
    if (role === 'property_admin' && data.property_admins[userId]) {
        return data.property_admins[userId];
    }
    if (role === 'worker' && data.workers[userId]) {
        return data.workers[userId];
    }
    return null;
}

// Initialize on load
initUserSystem();