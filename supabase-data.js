// supabase-data.js - Supabase Cloud Database Version
// CORRECTED - Uses window.supabaseClient

let propertiesDB = {};
let ownersDB = [];
let globalUpdates = {};
let messagesDB = {};
let adminNotes = {};
let contactRequests = [];

// ============ LOAD DATA FROM SUPABASE ============

async function loadAllData() {
    console.log("Loading data from Supabase...");
    
    try {
        // Load properties
        const { data: properties, error: propError } = await window.supabaseClient
            .from('properties')
            .select('*');
        
        if (propError) {
            console.error("Error loading properties:", propError);
        } else if (properties) {
            propertiesDB = {};
            properties.forEach(prop => {
                propertiesDB[prop.id] = prop.data;
            });
            console.log(`Loaded ${Object.keys(propertiesDB).length} properties`);
        }
        
        // Load owners
        const { data: owners, error: ownerError } = await window.supabaseClient
            .from('owners')
            .select('*');
        
        if (ownerError) {
            console.error("Error loading owners:", ownerError);
        } else if (owners) {
            ownersDB = [];
            owners.forEach(owner => {
                // Ensure we keep the stored row id alongside owner data
                const o = Object.assign({ id: owner.id }, owner.data || {});
                ownersDB.push(o);
            });
            console.log(`Loaded ${ownersDB.length} owners`);
        }
        
        // Load updates
        const { data: updates, error: updateError } = await window.supabaseClient
            .from('updates')
            .select('*');
        
        if (updateError) {
            console.error("Error loading updates:", updateError);
        } else if (updates) {
            globalUpdates = {};
            updates.forEach(update => {
                globalUpdates[update.property_id] = update.data.updates || [];
            });
        }
        
        // Load messages
        const { data: messages, error: msgError } = await window.supabaseClient
            .from('messages')
            .select('*');
        
        if (msgError) {
            console.error("Error loading messages:", msgError);
        } else if (messages) {
            messagesDB = {};
            messages.forEach(msg => {
                messagesDB[msg.property_id] = msg.data.messages || [];
            });
        }
        
        // Load notes
        const { data: notes, error: noteError } = await window.supabaseClient
            .from('notes')
            .select('*');
        
        if (noteError) {
            console.error("Error loading notes:", noteError);
        } else if (notes) {
            adminNotes = {};
            notes.forEach(note => {
                adminNotes[note.property_id] = note.data.note || "";
            });
        }
        
        // Load contact requests - SKIPPED due to table issues
        console.log("Skipping contact_requests - table not available");
        contactRequests = [];
        
        console.log("All data loaded from Supabase successfully");
    } catch (error) {
        console.error("Error in loadAllData:", error);
    }
}

async function saveAllData() {
    console.log("Saving data to Supabase...");
    let hadError = false;
    try {
        // Save properties
        for (let propId in propertiesDB) {
            const { error } = await window.supabaseClient
                .from('properties')
                .upsert({ id: propId, data: propertiesDB[propId], updated_at: new Date().toISOString() });
            if (error) { console.error("Error saving property:", propId, error); hadError = true; }
        }
        
        // Save owners
        for (let owner of ownersDB) {
            const ownerId = owner.id || owner.propertyId || null;
            if (!ownerId) {
                console.warn('Skipping owner save - missing id/propertyId', owner);
                continue;
            }
            const { error } = await window.supabaseClient
                .from('owners')
                .upsert({ id: ownerId, data: owner });
            if (error) { console.error("Error saving owner:", ownerId, error); hadError = true; }
        }
        
        // Save updates
        for (let propId in globalUpdates) {
            const { error } = await window.supabaseClient
                .from('updates')
                .upsert({ property_id: propId, data: { updates: globalUpdates[propId] } });
            if (error) { console.error("Error saving updates:", propId, error); hadError = true; }
        }
        
        // Save messages
        for (let propId in messagesDB) {
            const { error } = await window.supabaseClient
                .from('messages')
                .upsert({ property_id: propId, data: { messages: messagesDB[propId] } });
            if (error) { console.error("Error saving messages:", propId, error); hadError = true; }
        }
        
        // Save notes
        for (let propId in adminNotes) {
            const { error } = await window.supabaseClient
                .from('notes')
                .upsert({ property_id: propId, data: { note: adminNotes[propId] } });
            if (error) { console.error("Error saving notes:", propId, error); hadError = true; }
        }
        
        // Save contact requests
        for (let request of contactRequests) {
            const { error } = await window.supabaseClient
                .from('contact_requests')
                .upsert({ id: request.id.toString(), data: request });
            if (error) { console.error("Error saving contact request:", error); hadError = true; }
        }
        
        if (!hadError) console.log("All data saved to Supabase successfully");
        else console.warn("Completed save with errors. Check earlier logs.");
    } catch (error) {
        console.error("Error in saveAllData:", error);
        return false;
    }
    return !hadError;
}

// ============ CONTACT REQUESTS ============

async function addContactRequest(propertyId, propertyName, roomNumber, visitorName, visitorPhone, visitorMessage) {
    const request = {
        id: Date.now(),
        propertyId: propertyId,
        propertyName: propertyName,
        roomNumber: roomNumber,
        visitorName: visitorName || "Anonymous",
        visitorPhone: visitorPhone || "Not provided",
        visitorMessage: visitorMessage || "Interested in this property",
        date: new Date().toISOString(),
        status: "unread"
    };
    
    contactRequests.unshift(request);
    await window.supabaseClient.from('contact_requests').upsert({ id: request.id.toString(), data: request });
    await addGlobalUpdate(propertyId, `📞 New contact request for ${propertyName} - Room ${roomNumber} from ${visitorName || "Someone"}`);
    
    return request;
}

async function loadContactRequests() {
    const { data, error } = await window.supabaseClient.from('contact_requests').select('*');
    if (!error && data) {
        contactRequests = [];
        data.forEach(item => { contactRequests.push(item.data); });
        contactRequests.sort((a, b) => b.id - a.id);
    }
    return contactRequests;
}

function getUnreadContactRequestsCount() {
    return contactRequests.filter(r => r.status === "unread").length;
}

async function markContactRequestAsRead(requestId) {
    const request = contactRequests.find(r => r.id == requestId);
    if (request) {
        request.status = "read";
        await window.supabaseClient.from('contact_requests').upsert({ id: requestId.toString(), data: request });
    }
}

// ============ PROPERTY MANAGEMENT ============

async function addProperty(propertyData) {
    if (window.supabaseDataLoaded) await window.supabaseDataLoaded;
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
    
    await saveAllData();
    return propertyId;
}

// ============ PROPERTY BACKGROUND IMAGES ============

async function addPropertyImage(propertyId, imageData) {
    if (!propertiesDB[propertyId]) return false;
    if (!propertiesDB[propertyId].propertyImages) {
        propertiesDB[propertyId].propertyImages = [];
    }
    propertiesDB[propertyId].propertyImages.push(imageData);
    await saveAllData();
    return true;
}

async function removePropertyImage(propertyId, imageIndex) {
    if (!propertiesDB[propertyId] || !propertiesDB[propertyId].propertyImages) return false;
    propertiesDB[propertyId].propertyImages.splice(imageIndex, 1);
    await saveAllData();
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

async function addRoom(propertyId, roomData) {
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
        moveInDate: roomData.moveInDate || null,
        paid: false,
        lateNote: "",
        payments: payments,
        paymentHistory: []
    };
    
    prop.units.push(newRoom);
    await saveAllData();
    return true;
}

async function updateRoom(propertyId, roomIndex, roomData) {
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
    
    await saveAllData();
    return true;
}

async function deleteRoom(propertyId, roomIndex) {
    if (!propertiesDB[propertyId] || !propertiesDB[propertyId].units[roomIndex]) return false;
    propertiesDB[propertyId].units.splice(roomIndex, 1);
    await saveAllData();
    return true;
}

// ============ RECORD PAYMENT ============

async function recordPayment(propertyId, roomIndex, amount, paymentMethod, reference, paidDate) {
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
                await addGlobalUpdate(propertyId, `✅ Tenant ${room.tenant} (${room.roomNumber}) has fully paid for ${month}. Amount to owner: UGX ${amountToOwner.toLocaleString()}`);
            } else {
                payment.status = "partial";
                prop.totalCollected += paymentAmount;
                prop.totalFeeDeducted += feeAmount;
                prop.pendingRemittance += amountToOwner;
                await addGlobalUpdate(propertyId, `📝 Tenant ${room.tenant} (${room.roomNumber}) made partial payment of UGX ${paymentAmount.toLocaleString()} for ${month}. Remaining: UGX ${payment.balance.toLocaleString()}`);
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
    
    await saveAllData();
    
    return {
        success: true,
        totalPaid: totalPaidThisSession,
        totalFee: totalFeeThisSession,
        totalToOwner: totalToOwnerThisSession,
        monthsAffected: monthsAffected
    };
}

// ============ ADD PENALTY ============

async function addPenalty(propertyId, roomIndex, month, penaltyAmount, description) {
    if (!propertiesDB[propertyId] || !propertiesDB[propertyId].units[roomIndex]) return false;
    
    const room = propertiesDB[propertyId].units[roomIndex];
    const payment = room.payments[month];
    
    if (!payment) return false;
    
    payment.penaltyAmount = (payment.penaltyAmount || 0) + penaltyAmount;
    payment.balance += penaltyAmount;
    payment.rentDue += penaltyAmount;
    
    await addGlobalUpdate(propertyId, `⚠️ Penalty of UGX ${penaltyAmount.toLocaleString()} added to ${room.tenant} (${room.roomNumber}) for ${month}. Reason: ${description || 'Late payment'}`);
    
    await saveAllData();
    return true;
}

// ============ ADD BILL PAYMENT ============

async function addBillPayment(propertyId, billType, amount, receiptImage, description) {
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
    
    await addGlobalUpdate(propertyId, `🧾 BILL PAID: ${billType} - UGX ${amount.toLocaleString()}. ${description || ''}`);
    
    await saveAllData();
    return true;
}

// ============ REMIT TO OWNER ============

async function remitToOwner(propertyId, amount, method, reference) {
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
    
    await addGlobalUpdate(propertyId, `💰 REMITTANCE: UGX ${amount.toLocaleString()} sent to owner via ${method}. Reference: ${reference || 'N/A'}`);
    
    await saveAllData();
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

async function generateMonthlyStatement(propertyId, month, year) {
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
    
    await saveAllData();
    return statement;
}

// ============ RESET MONTH ============

async function resetMonth(propertyId, newYear, newMonth) {
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
    
    await addGlobalUpdate(propertyId, `📅 NEW MONTH (${newMonthKey}) started. Unpaid balances carried forward with ${penaltyRate}% penalty.`);
    
    await saveAllData();
    return true;
}

// ============ STATEMENTS ============

function getStatements(propertyId) {
    if (!propertiesDB[propertyId]) return [];
    return propertiesDB[propertyId].statements || [];
}

// ============ PROPERTY EDITING ============

async function editProperty(propertyId, updatedData) {
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
    
    await saveAllData();
    return true;
}

async function updatePropertyStatus(propertyId, status) {
    if (propertiesDB[propertyId]) {
        propertiesDB[propertyId].status = status;
        await saveAllData();
    }
}

async function updatePropertyImage(propertyId, imageData) {
    if (propertiesDB[propertyId]) {
        propertiesDB[propertyId].propertyImage = imageData;
        await saveAllData();
    }
}

async function deletePropertyFromSupabase(propertyId) {
    await window.supabaseClient.from('properties').delete().eq('id', propertyId);
    await window.supabaseClient.from('owners').delete().eq('id', propertyId);
    await window.supabaseClient.from('updates').delete().eq('property_id', propertyId);
    await window.supabaseClient.from('messages').delete().eq('property_id', propertyId);
    await window.supabaseClient.from('notes').delete().eq('property_id', propertyId);
}

async function deleteProperty(propertyId) {
    delete propertiesDB[propertyId];
    delete messagesDB[propertyId];
    delete adminNotes[propertyId];
    delete globalUpdates[propertyId];
    ownersDB = ownersDB.filter(o => o.propertyId !== propertyId);
    await deletePropertyFromSupabase(propertyId);
    await saveAllData();
}

// ============ MESSAGING ============

async function sendMessage(propertyId, sender, message, imageBase64 = null) {
    if (!messagesDB[propertyId]) messagesDB[propertyId] = [];
    messagesDB[propertyId].push({
        id: Date.now(),
        sender: sender,
        message: message,
        image: imageBase64,
        timestamp: new Date().toISOString()
    });
    await saveAllData();
}

function getMessages(propertyId) {
    return messagesDB[propertyId] || [];
}

async function setAdminNote(propertyId, note) {
    adminNotes[propertyId] = note;
    await saveAllData();
}

function getAdminNote(propertyId) {
    return adminNotes[propertyId] || "";
}

function getUpdatesForProperty(propertyId) {
    return globalUpdates[propertyId] || [];
}

async function addGlobalUpdate(propertyId, message) {
    if (!globalUpdates[propertyId]) globalUpdates[propertyId] = [];
    globalUpdates[propertyId].unshift({
        id: Date.now(),
        message: message,
        date: new Date().toISOString(),
        read: false
    });
    await saveAllData();
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
    if (!password) return null;
    // Try common owner password fields
    let found = ownersDB.find(o => (o.password && o.password === password) || (o.ownerPassword && o.ownerPassword === password));
    if (found) return found;
    // Fallback: check propertiesDB ownerPassword field
    for (let propId in propertiesDB) {
        const p = propertiesDB[propId];
        if (p && p.ownerPassword === password) {
            // find matching owner record by propertyId
            const o = ownersDB.find(x => x.propertyId === propId);
            if (o) return o;
            // else return a constructed owner-like object
            return { id: propId, name: p.ownerName || '', phone: p.ownerPhone || '', propertyId: propId, password: p.ownerPassword };
        }
    }
    return null;
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

async function deleteAllPropertiesExcept(keepPropertyId) {
    const removedPropertyIds = [];
    for (let propId in propertiesDB) {
        if (propId !== keepPropertyId) {
            removedPropertyIds.push(propId);
            delete propertiesDB[propId];
            delete messagesDB[propId];
            delete adminNotes[propId];
            delete globalUpdates[propId];
        }
    }
    ownersDB = ownersDB.filter(o => o.propertyId === keepPropertyId);
    await Promise.all(removedPropertyIds.map(id => deletePropertyFromSupabase(id)));
    await saveAllData();
}

// ============ HELPER FUNCTIONS ============

function mergeUnits(propertyId, unitIndex1, unitIndex2) {
    if (!propertiesDB[propertyId]) return false;
    const prop = propertiesDB[propertyId];
    const unit1 = prop.units[unitIndex1];
    const unit2 = prop.units[unitIndex2];
    
    if (!unit1.vacant || !unit2.vacant) return false;
    
    unit1.mergedWith = unit2.room;
    unit1.vacant = false;
    unit1.tenant = "(Merged - both units)";
    unit2.vacant = true;
    unit2.tenant = "";
    
    saveAllData();
    return true;
}

// Load data when script starts and expose a ready promise
window.supabaseDataLoaded = loadAllData();
window.supabaseDataLoaded.catch(error => console.error("Supabase data initialization failed:", error));