// BATTETECH PROPERTY CONSULTANTS - Complete Data System
// Version: With Monthly Financial Tracking, Overdue Separation, Property Images, Penalty, Statements

let propertiesDB = {};
let ownersDB = [];
let globalUpdates = {};
let messagesDB = {};
let adminNotes = {};

// ============ LOAD & SAVE DATA ============

function loadAllData() {
    const savedProperties = localStorage.getItem('battetech_properties');
    const savedOwners = localStorage.getItem('battetech_owners');
    const savedUpdates = localStorage.getItem('battetech_updates');
    const savedMessages = localStorage.getItem('battetech_messages');
    const savedNotes = localStorage.getItem('battetech_admin_notes');
    
    if (savedProperties) {
        propertiesDB = JSON.parse(savedProperties);
        for (let propId in propertiesDB) {
            if (!propertiesDB[propId].propertyImages) {
                propertiesDB[propId].propertyImages = [];
            }
            if (!propertiesDB[propId].statements) {
                propertiesDB[propId].statements = [];
            }
            if (!propertiesDB[propId].penaltyFee) {
                propertiesDB[propId].penaltyFee = 0;
            }
            if (!propertiesDB[propId].billsHistory) {
                propertiesDB[propId].billsHistory = [];
            }
            if (!propertiesDB[propId].remittanceHistory) {
                propertiesDB[propId].remittanceHistory = [];
            }
        }
    } else {
        propertiesDB = {};
    }
    
    if (savedOwners) {
        ownersDB = JSON.parse(savedOwners);
    } else {
        ownersDB = [];
    }
    
    if (savedUpdates) {
        globalUpdates = JSON.parse(savedUpdates);
    } else {
        globalUpdates = {};
    }
    
    if (savedMessages) {
        messagesDB = JSON.parse(savedMessages);
    } else {
        messagesDB = {};
    }
    
    if (savedNotes) {
        adminNotes = JSON.parse(savedNotes);
    } else {
        adminNotes = {};
    }
}

function saveAllData() {
    localStorage.setItem('battetech_properties', JSON.stringify(propertiesDB));
    localStorage.setItem('battetech_owners', JSON.stringify(ownersDB));
    localStorage.setItem('battetech_updates', JSON.stringify(globalUpdates));
    localStorage.setItem('battetech_messages', JSON.stringify(messagesDB));
    localStorage.setItem('battetech_admin_notes', JSON.stringify(adminNotes));
}

// ============ PROPERTY MANAGEMENT ============

function addProperty(propertyData) {
    const propertyId = `prop_${Date.now()}`;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    propertiesDB[propertyId] = {
        id: propertyId,
        name: propertyData.name,
        location: propertyData.location,
        ownerPassword: propertyData.ownerPassword,
        ownerName: propertyData.ownerName,
        ownerPhone: propertyData.ownerPhone,
        propertyImage: propertyData.propertyImage || "",
        propertyImages: [],
        status: propertyData.status || "active",
        managementFee: propertyData.managementFee || 5,
        penaltyFee: propertyData.penaltyFee || 0,
        currentYear: currentYear,
        currentMonth: currentMonth,
        totalCollected: 0,
        totalFeeDeducted: 0,
        pendingRemittance: 0,
        alreadyRemitted: 0,
        remittanceHistory: [],
        billsHistory: [],
        statements: [],
        units: []
    };
    
    ownersDB.push({
        id: propertyId,
        password: propertyData.ownerPassword,
        name: propertyData.ownerName,
        phone: propertyData.ownerPhone,
        propertyId: propertyId
    });
    
    messagesDB[propertyId] = [];
    adminNotes[propertyId] = "";
    globalUpdates[propertyId] = [];
    
    saveAllData();
    return propertyId;
}

// ============ PROPERTY BACKGROUND IMAGES ============

function addPropertyImage(propertyId, imageData) {
    if (!propertiesDB[propertyId]) return false;
    if (!propertiesDB[propertyId].propertyImages) {
        propertiesDB[propertyId].propertyImages = [];
    }
    propertiesDB[propertyId].propertyImages.push(imageData);
    saveAllData();
    return true;
}

function removePropertyImage(propertyId, imageIndex) {
    if (!propertiesDB[propertyId] || !propertiesDB[propertyId].propertyImages) return false;
    propertiesDB[propertyId].propertyImages.splice(imageIndex, 1);
    saveAllData();
    return true;
}

function getPropertyImages(propertyId) {
    if (!propertiesDB[propertyId]) return [];
    return propertiesDB[propertyId].propertyImages || [];
}

// ============ WHATSAPP BROADCAST ============

function getTenantPhones(propertyId) {
    if (!propertiesDB[propertyId]) return [];
    const prop = propertiesDB[propertyId];
    const phones = [];
    for (let room of prop.units) {
        if (!room.vacant && room.tenantPhone && room.tenantPhone.trim() !== "") {
            let phone = room.tenantPhone.replace(/\s/g, '');
            if (phone.startsWith('0')) {
                phone = '256' + phone.substring(1);
            }
            if (!phone.startsWith('256') && !phone.startsWith('+')) {
                phone = '256' + phone;
            }
            phones.push({
                name: room.tenant,
                phone: phone,
                room: room.roomNumber
            });
        }
    }
    return phones;
}

// ============ ROOM MANAGEMENT ============

function addRoom(propertyId, roomData) {
    if (!propertiesDB[propertyId]) return false;
    
    const prop = propertiesDB[propertyId];
    const currentYear = prop.currentYear;
    
    const payments = {};
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    
    for (let i = 0; i < months.length; i++) {
        const monthKey = `${currentYear}-${months[i]}`;
        payments[monthKey] = {
            rentDue: roomData.rentAmount,
            paid: 0,
            balance: roomData.rentAmount,
            status: "unpaid",
            paidDate: null,
            feeDeducted: 0,
            amountToOwner: 0,
            penaltyAmount: 0,
            locked: false
        };
    }
    
    const newRoom = {
        id: Date.now(),
        roomNumber: roomData.roomNumber,
        rentAmount: roomData.rentAmount,
        roomImage: roomData.roomImage || "",
        vacant: true,
        tenant: "",
        tenantPhone: "",
        paymentDueDate: roomData.paymentDueDate || 1,
        moveInDate: null,
        paid: false,
        lateNote: "",
        payments: payments,
        paymentHistory: []
    };
    
    prop.units.push(newRoom);
    saveAllData();
    return true;
}

function updateRoom(propertyId, roomIndex, roomData) {
    if (!propertiesDB[propertyId] || !propertiesDB[propertyId].units[roomIndex]) return false;
    
    const room = propertiesDB[propertyId].units[roomIndex];
    
    if (roomData.roomNumber !== undefined) room.roomNumber = roomData.roomNumber;
    if (roomData.rentAmount !== undefined) room.rentAmount = roomData.rentAmount;
    if (roomData.roomImage !== undefined) room.roomImage = roomData.roomImage;
    if (roomData.vacant !== undefined) room.vacant = roomData.vacant;
    if (roomData.tenant !== undefined) room.tenant = roomData.tenant;
    if (roomData.tenantPhone !== undefined) room.tenantPhone = roomData.tenantPhone;
    if (roomData.moveInDate !== undefined) room.moveInDate = roomData.moveInDate;
    if (roomData.paymentDueDate !== undefined) room.paymentDueDate = roomData.paymentDueDate;
    if (roomData.paid !== undefined) room.paid = roomData.paid;
    if (roomData.lateNote !== undefined) room.lateNote = roomData.lateNote;
    
    saveAllData();
    return true;
}

function deleteRoom(propertyId, roomIndex) {
    if (!propertiesDB[propertyId] || !propertiesDB[propertyId].units[roomIndex]) return false;
    propertiesDB[propertyId].units.splice(roomIndex, 1);
    saveAllData();
    return true;
}

// ============ RECORD PAYMENT ============

function recordPayment(propertyId, roomIndex, amount, paymentMethod, reference, paidDate) {
    if (!propertiesDB[propertyId]) return false;
    
    const prop = propertiesDB[propertyId];
    const room = prop.units[roomIndex];
    if (room.vacant) return false;
    
    const managementFee = prop.managementFee;
    let remainingAmount = amount;
    let totalPaidThisSession = 0;
    let totalFeeThisSession = 0;
    let totalToOwnerThisSession = 0;
    let monthsAffected = [];
    
    const months = Object.keys(room.payments).sort();
    
    for (let month of months) {
        if (remainingAmount <= 0) break;
        
        const payment = room.payments[month];
        if (payment.locked) continue;
        if (payment.balance > 0) {
            const paymentAmount = Math.min(remainingAmount, payment.balance);
            const feeAmount = (paymentAmount * managementFee) / 100;
            const amountToOwner = paymentAmount - feeAmount;
            
            payment.paid += paymentAmount;
            payment.balance -= paymentAmount;
            payment.feeDeducted += feeAmount;
            payment.amountToOwner += amountToOwner;
            payment.paidDate = paidDate || new Date().toISOString();
            
            if (payment.balance === 0) {
                payment.status = "paid";
                payment.locked = true;
                prop.totalCollected += payment.rentDue;
                prop.totalFeeDeducted += payment.feeDeducted;
                prop.pendingRemittance += payment.amountToOwner;
                room.paid = true;
                addGlobalUpdate(propertyId, `✅ Tenant ${room.tenant} (${room.roomNumber}) has fully paid for ${month}. Amount to owner: UGX ${amountToOwner.toLocaleString()}`);
            } else {
                payment.status = "partial";
                prop.totalCollected += paymentAmount;
                prop.totalFeeDeducted += feeAmount;
                prop.pendingRemittance += amountToOwner;
                addGlobalUpdate(propertyId, `📝 Tenant ${room.tenant} (${room.roomNumber}) made partial payment of UGX ${paymentAmount.toLocaleString()} for ${month}. Remaining: UGX ${payment.balance.toLocaleString()}`);
            }
            
            totalPaidThisSession += paymentAmount;
            totalFeeThisSession += feeAmount;
            totalToOwnerThisSession += amountToOwner;
            remainingAmount -= paymentAmount;
            monthsAffected.push(month);
        }
    }
    
    room.paymentHistory.push({
        date: new Date().toISOString(),
        amount: totalPaidThisSession,
        feeDeducted: totalFeeThisSession,
        amountToOwner: totalToOwnerThisSession,
        method: paymentMethod,
        reference: reference,
        monthsAffected: monthsAffected
    });
    
    saveAllData();
    
    return {
        success: true,
        totalPaid: totalPaidThisSession,
        totalFee: totalFeeThisSession,
        totalToOwner: totalToOwnerThisSession,
        monthsAffected: monthsAffected
    };
}

// ============ ADD PENALTY ============

function addPenalty(propertyId, roomIndex, month, penaltyAmount, description) {
    if (!propertiesDB[propertyId] || !propertiesDB[propertyId].units[roomIndex]) return false;
    
    const room = propertiesDB[propertyId].units[roomIndex];
    const payment = room.payments[month];
    
    if (!payment) return false;
    
    payment.penaltyAmount = (payment.penaltyAmount || 0) + penaltyAmount;
    payment.balance += penaltyAmount;
    payment.rentDue += penaltyAmount;
    
    addGlobalUpdate(propertyId, `⚠️ Penalty of UGX ${penaltyAmount.toLocaleString()} added to ${room.tenant} (${room.roomNumber}) for ${month}. Reason: ${description || 'Late payment'}`);
    
    saveAllData();
    return true;
}

// ============ ADD BILL PAYMENT ============

function addBillPayment(propertyId, billType, amount, receiptImage, description) {
    if (!propertiesDB[propertyId]) return false;
    
    const prop = propertiesDB[propertyId];
    
    const billRecord = {
        id: Date.now(),
        date: new Date().toISOString(),
        billType: billType,
        amount: amount,
        receiptImage: receiptImage,
        description: description
    };
    
    prop.billsHistory.push(billRecord);
    prop.pendingRemittance -= amount;
    if (prop.pendingRemittance < 0) prop.pendingRemittance = 0;
    
    addGlobalUpdate(propertyId, `🧾 BILL PAID: ${billType} - UGX ${amount.toLocaleString()}. ${description || ''}`);
    
    saveAllData();
    return true;
}

// ============ REMIT TO OWNER ============

function remitToOwner(propertyId, amount, method, reference) {
    if (!propertiesDB[propertyId]) return false;
    
    const prop = propertiesDB[propertyId];
    
    if (amount > prop.pendingRemittance) {
        return false;
    }
    
    prop.pendingRemittance -= amount;
    prop.alreadyRemitted += amount;
    
    prop.remittanceHistory.push({
        id: Date.now(),
        date: new Date().toISOString(),
        amount: amount,
        method: method,
        reference: reference
    });
    
    prop.totalCollected = 0;
    prop.totalFeeDeducted = 0;
    
    addGlobalUpdate(propertyId, `💰 REMITTANCE: UGX ${amount.toLocaleString()} sent to owner via ${method}. Reference: ${reference || 'N/A'}`);
    
    saveAllData();
    return true;
}

// ============ MONTHLY FINANCIAL CALCULATIONS ============

function getMonthlyFinancials(property, year, month) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    let currentMonthRentDue = 0;
    let currentMonthCollected = 0;
    let currentMonthPending = 0;
    let totalOverdueBalance = 0;
    let totalFeeThisMonth = 0;
    let totalToOwnerThisMonth = 0;
    
    for (let room of property.units) {
        if (room.vacant) continue;
        
        const payment = room.payments[monthKey];
        if (payment) {
            currentMonthRentDue += payment.rentDue;
            currentMonthCollected += payment.paid;
            currentMonthPending += payment.balance;
            totalFeeThisMonth += payment.feeDeducted;
            totalToOwnerThisMonth += payment.amountToOwner;
        }
        
        for (let m in room.payments) {
            if (m !== monthKey && room.payments[m].status !== 'paid' && room.payments[m].balance > 0) {
                totalOverdueBalance += room.payments[m].balance;
            }
        }
    }
    
    return {
        currentMonthRentDue: currentMonthRentDue,
        currentMonthCollected: currentMonthCollected,
        currentMonthPending: currentMonthPending,
        totalOverdueBalance: totalOverdueBalance,
        totalFeeThisMonth: totalFeeThisMonth,
        totalToOwnerThisMonth: totalToOwnerThisMonth
    };
}

function getCurrentMonthFinancials(property) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    return getMonthlyFinancials(property, currentYear, currentMonth);
}

// ============ FINANCIAL GETTERS ============

function getFinancials(property) {
    const monthly = getCurrentMonthFinancials(property);
    
    return {
        totalCollected: property.totalCollected || 0,
        totalFeeDeducted: property.totalFeeDeducted || 0,
        pendingRemittance: property.pendingRemittance || 0,
        alreadyRemitted: property.alreadyRemitted || 0,
        currentMonthRentDue: monthly.currentMonthRentDue,
        currentMonthCollected: monthly.currentMonthCollected,
        currentMonthPending: monthly.currentMonthPending,
        totalOverdueBalance: monthly.totalOverdueBalance,
        remittanceHistory: property.remittanceHistory || [],
        billsHistory: property.billsHistory || [],
        statements: property.statements || []
    };
}

function getOccupiedCount(property) {
    return property.units.filter(u => !u.vacant).length;
}

function getVacantCount(property) {
    return property.units.filter(u => u.vacant === true).length;
}

function getAllVacantUnits() {
    const vacantUnits = [];
    for (let propId in propertiesDB) {
        const prop = propertiesDB[propId];
        if (prop.status !== 'active') continue;
        for (let unit of prop.units) {
            if (unit.vacant === true) {
                vacantUnits.push({
                    propertyId: propId,
                    propertyName: prop.name,
                    location: prop.location,
                    roomNumber: unit.roomNumber,
                    rent: unit.rentAmount,
                    roomImage: unit.roomImage || prop.propertyImage
                });
            }
        }
    }
    return vacantUnits;
}

// ============ GENERATE MONTHLY STATEMENT ============

function generateMonthlyStatement(propertyId, month, year) {
    if (!propertiesDB[propertyId]) return null;
    
    const prop = propertiesDB[propertyId];
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    
    let totalCollected = 0;
    let totalFeeDeducted = 0;
    let paidTenants = [];
    let unpaidTenants = [];
    
    for (let room of prop.units) {
        if (room.vacant) continue;
        
        const payment = room.payments[monthKey];
        if (payment) {
            if (payment.status === 'paid') {
                totalCollected += payment.rentDue;
                totalFeeDeducted += payment.feeDeducted;
                paidTenants.push({
                    name: room.tenant,
                    room: room.roomNumber,
                    amount: payment.rentDue,
                    fee: payment.feeDeducted,
                    toOwner: payment.amountToOwner
                });
            } else {
                unpaidTenants.push({
                    name: room.tenant,
                    room: room.roomNumber,
                    balance: payment.balance,
                    penalty: payment.penaltyAmount || 0
                });
            }
        }
    }
    
    const statement = {
        id: Date.now(),
        month: `${month}/${year}`,
        monthKey: monthKey,
        generatedDate: new Date().toISOString(),
        summary: {
            totalCollected: totalCollected,
            totalFeeDeducted: totalFeeDeducted,
            totalToOwner: totalCollected - totalFeeDeducted,
            paidTenantsCount: paidTenants.length,
            unpaidTenantsCount: unpaidTenants.length
        },
        paidTenants: paidTenants,
        unpaidTenants: unpaidTenants
    };
    
    if (!prop.statements) prop.statements = [];
    prop.statements.push(statement);
    
    saveAllData();
    return statement;
}

// ============ RESET MONTH ============

function resetMonth(propertyId, newYear, newMonth) {
    if (!propertiesDB[propertyId]) return false;
    
    const prop = propertiesDB[propertyId];
    const newMonthKey = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    const penaltyRate = prop.penaltyFee || 0;
    
    for (let room of prop.units) {
        if (room.vacant) continue;
        
        let totalUnpaidBalance = 0;
        let totalPenalty = 0;
        
        for (let monthKey in room.payments) {
            const payment = room.payments[monthKey];
            if (payment.status !== 'paid' && payment.balance > 0) {
                totalUnpaidBalance += payment.balance;
                if (penaltyRate > 0) {
                    const penalty = (payment.balance * penaltyRate) / 100;
                    totalPenalty += penalty;
                    payment.balance += penalty;
                    payment.penaltyAmount = (payment.penaltyAmount || 0) + penalty;
                }
            }
        }
        
        room.payments[newMonthKey] = {
            rentDue: room.rentAmount,
            paid: 0,
            balance: room.rentAmount + totalUnpaidBalance + totalPenalty,
            status: "unpaid",
            paidDate: null,
            feeDeducted: 0,
            amountToOwner: 0,
            penaltyAmount: totalPenalty,
            locked: false
        };
        
        room.paid = false;
    }
    
    prop.currentYear = newYear;
    prop.currentMonth = newMonth;
    prop.totalCollected = 0;
    prop.totalFeeDeducted = 0;
    prop.pendingRemittance = 0;
    
    addGlobalUpdate(propertyId, `📅 NEW MONTH (${newMonthKey}) started. Unpaid balances carried forward with ${penaltyRate}% penalty.`);
    
    saveAllData();
    return true;
}

// ============ STATEMENTS ============

function getStatements(propertyId) {
    if (!propertiesDB[propertyId]) return [];
    return propertiesDB[propertyId].statements || [];
}

// ============ PROPERTY EDITING ============

function editProperty(propertyId, updatedData) {
    if (!propertiesDB[propertyId]) return false;
    const prop = propertiesDB[propertyId];
    
    if (updatedData.name !== undefined) prop.name = updatedData.name;
    if (updatedData.location !== undefined) prop.location = updatedData.location;
    if (updatedData.ownerPassword !== undefined) prop.ownerPassword = updatedData.ownerPassword;
    if (updatedData.ownerName !== undefined) prop.ownerName = updatedData.ownerName;
    if (updatedData.ownerPhone !== undefined) prop.ownerPhone = updatedData.ownerPhone;
    if (updatedData.propertyImage !== undefined) prop.propertyImage = updatedData.propertyImage;
    if (updatedData.status !== undefined) prop.status = updatedData.status;
    if (updatedData.managementFee !== undefined) prop.managementFee = updatedData.managementFee;
    if (updatedData.penaltyFee !== undefined) prop.penaltyFee = updatedData.penaltyFee;
    
    const ownerIndex = ownersDB.findIndex(o => o.propertyId === propertyId);
    if (ownerIndex !== -1) {
        if (updatedData.ownerPassword !== undefined) ownersDB[ownerIndex].password = updatedData.ownerPassword;
        if (updatedData.ownerName !== undefined) ownersDB[ownerIndex].name = updatedData.ownerName;
        if (updatedData.ownerPhone !== undefined) ownersDB[ownerIndex].phone = updatedData.ownerPhone;
    }
    
    saveAllData();
    return true;
}

function updatePropertyStatus(propertyId, status) {
    if (propertiesDB[propertyId]) {
        propertiesDB[propertyId].status = status;
        saveAllData();
    }
}

function updatePropertyImage(propertyId, imageData) {
    if (propertiesDB[propertyId]) {
        propertiesDB[propertyId].propertyImage = imageData;
        saveAllData();
    }
}

function deleteProperty(propertyId) {
    delete propertiesDB[propertyId];
    delete messagesDB[propertyId];
    delete adminNotes[propertyId];
    delete globalUpdates[propertyId];
    ownersDB = ownersDB.filter(o => o.propertyId !== propertyId);
    saveAllData();
}

// ============ MESSAGING ============

function sendMessage(propertyId, sender, message, imageBase64 = null) {
    if (!messagesDB[propertyId]) messagesDB[propertyId] = [];
    messagesDB[propertyId].push({
        id: Date.now(),
        sender: sender,
        message: message,
        image: imageBase64,
        timestamp: new Date().toISOString()
    });
    saveAllData();
}

function getMessages(propertyId) {
    return messagesDB[propertyId] || [];
}

function setAdminNote(propertyId, note) {
    adminNotes[propertyId] = note;
    saveAllData();
}

function getAdminNote(propertyId) {
    return adminNotes[propertyId] || "";
}

function getUpdatesForProperty(propertyId) {
    return globalUpdates[propertyId] || [];
}

function addGlobalUpdate(propertyId, message) {
    if (!globalUpdates[propertyId]) globalUpdates[propertyId] = [];
    globalUpdates[propertyId].unshift({
        id: Date.now(),
        message: message,
        date: new Date().toISOString(),
        read: false
    });
    saveAllData();
}

function markUpdatesAsRead(propertyId) {
    if (globalUpdates[propertyId]) {
        globalUpdates[propertyId].forEach(update => {
            update.read = true;
        });
        saveAllData();
    }
}

function getUnreadUpdatesCount(propertyId) {
    if (!globalUpdates[propertyId]) return 0;
    return globalUpdates[propertyId].filter(u => !u.read).length;
}

// ============ OWNER AUTHENTICATION ============

function getOwnerByPassword(password) {
    return ownersDB.find(o => o.password === password);
}

function checkAutoLogin() {
    const savedLogin = localStorage.getItem('battetech_auto_login');
    if (savedLogin) {
        const ownerData = JSON.parse(savedLogin);
        if (propertiesDB[ownerData.propertyId]) {
            return ownerData;
        }
    }
    return null;
}

function setAutoLogin(ownerData, stayLoggedIn) {
    if (stayLoggedIn) {
        localStorage.setItem('battetech_auto_login', JSON.stringify(ownerData));
    } else {
        localStorage.removeItem('battetech_auto_login');
    }
}

function clearAutoLogin() {
    localStorage.removeItem('battetech_auto_login');
}

function deleteAllPropertiesExcept(keepPropertyId) {
    for (let propId in propertiesDB) {
        if (propId !== keepPropertyId) {
            delete propertiesDB[propId];
            delete messagesDB[propId];
            delete adminNotes[propId];
            delete globalUpdates[propId];
        }
    }
    ownersDB = ownersDB.filter(o => o.propertyId === keepPropertyId);
    saveAllData();
}

loadAllData();