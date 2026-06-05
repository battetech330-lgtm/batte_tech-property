// supabase-data.js - Fixed Version
// Fix: Payments now ADD to total_collected_since_last_remit instead of replacing

let propertiesDB = {};
let ownersDB = [];
let globalUpdates = {};
let messagesDB = {};
let adminNotes = {};
let contactRequests = [];

// ============ LOAD DATA FROM SUPABASE ============

let dataLoaded = false;
let loadingPromise = null;

async function loadAllData() {
    // Single-flight guard (prevents duplicate network bursts)
    if (loadingPromise) return loadingPromise;
    if (dataLoaded) return Promise.resolve();

    console.log("Loading data from Supabase (optimized)...");

    loadingPromise = (async () => {
        try {
            const [propertiesRes, ownersRes, updatesRes, messagesRes, notesRes] = await Promise.all([
                window.supabaseClient
                    .from('properties')
                    .select('*')
                    .limit(200),
                window.supabaseClient
                    .from('owners')
                    .select('*')
                    .limit(200),
                window.supabaseClient
                    .from('updates')
                    .select('*')
                    .limit(500),
                window.supabaseClient
                    .from('messages')
                    .select('*')
                    .limit(500),
                window.supabaseClient
                    .from('notes')
                    .select('*')
                    .limit(200)
            ]);

            // Properties
            if (!propertiesRes.error && propertiesRes.data) {
                propertiesDB = {};
                for (const prop of propertiesRes.data) {
                    propertiesDB[prop.id] = prop.data || prop;
                    if (!propertiesDB[prop.id].units) propertiesDB[prop.id].units = [];
                }
                console.log(`Loaded ${Object.keys(propertiesDB).length} properties`);
            } else {
                console.error("Error loading properties:", propertiesRes.error);
            }

            // Owners
            if (!ownersRes.error && ownersRes.data) {
                ownersDB = ownersRes.data.map(o => o.data || o);
                console.log(`Loaded ${ownersDB.length} owners`);
            } else {
                console.error("Error loading owners:", ownersRes.error);
            }

            // Updates
            if (!updatesRes.error && updatesRes.data) {
                globalUpdates = {};
                for (const update of updatesRes.data) {
                    globalUpdates[update.property_id] = update.data?.updates || [];
                }
            } else {
                console.error("Error loading updates:", updatesRes.error);
            }

            // Messages
            if (!messagesRes.error && messagesRes.data) {
                messagesDB = {};
                for (const msg of messagesRes.data) {
                    messagesDB[msg.property_id] = msg.data?.messages || [];
                }
            } else {
                console.error("Error loading messages:", messagesRes.error);
            }

            // Notes
            if (!notesRes.error && notesRes.data) {
                adminNotes = {};
                for (const note of notesRes.data) {
                    adminNotes[note.property_id] = note.data?.note || "";
                }
            } else {
                console.error("Error loading notes:", notesRes.error);
            }

            dataLoaded = true;
            console.log("All data loaded from Supabase successfully (optimized)");
        } catch (error) {
            console.error("Error in loadAllData:", error);
        } finally {
            loadingPromise = null;
        }
    })();

    return loadingPromise;
}


async function saveAllData() {
    console.log("Saving data to Supabase...");
    try {
        for (let propId in propertiesDB) {
            const prop = propertiesDB[propId];
            await window.supabaseClient
                .from('properties')
                .upsert({ 
                    id: propId, 
                    data: prop,
                    name: prop.name,
                    location: prop.location,
                    admin_id: prop.admin_id,
                    management_fee: prop.managementFee,
                    updated_at: new Date().toISOString()
                });
        }
        console.log("All data saved to Supabase successfully");
    } catch (error) {
        console.error("Error in saveAllData:", error);
    }
}

// ============ HELPER FUNCTIONS ============

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// ============ FINANCIAL CALCULATIONS (CACHED) ============

let financialsCache = {};

function clearFinancialsCache(propertyId) {
    if (propertyId && financialsCache[propertyId]) {
        delete financialsCache[propertyId];
    } else {
        financialsCache = {};
    }
}

function getFinancials(property) {
    const propertyId = property?.id;

    if (propertyId && financialsCache[propertyId] && (Date.now() - financialsCache[propertyId].timestamp) < 30000) {
        return financialsCache[propertyId].data;
    }

    const units = property.data?.units || property.units || [];

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    
    let currentMonthCollected = 0;
    let currentMonthPending = 0;
    
    for (let room of units) {
        if (room.vacant) continue;
        
        const monthPayment = room.payments?.[monthKey];
        if (monthPayment) {
            currentMonthCollected += monthPayment.paid || 0;
            currentMonthPending += monthPayment.balance || 0;
        } else {
            currentMonthPending += room.rentAmount || 0;
        }
    }
    
    // Get values from database columns
    let totalCollectedSinceLastRemit = property.total_collected_since_last_remit || 0;
    let totalFeeSinceLastRemit = property.total_fee_since_last_remit || 0;
    let alreadyRemitted = property.already_remitted || 0;
    
    const pendingToRemit = totalCollectedSinceLastRemit - totalFeeSinceLastRemit;
    
    console.log("=== FINANCIALS ===");
    console.log("Current Month Collected:", currentMonthCollected);
    console.log("Current Month Pending:", currentMonthPending);
    console.log("Total Collected Since Last Remit:", totalCollectedSinceLastRemit);
    console.log("Total Fee Since Last Remit:", totalFeeSinceLastRemit);
    console.log("Already Remitted:", alreadyRemitted);
    console.log("Pending to Remit:", pendingToRemit);
    
    const result = {
        currentMonthRentDue: currentMonthCollected + currentMonthPending,

        currentMonthCollected: currentMonthCollected,
        currentMonthPending: currentMonthPending,
        totalCollectedSinceLastRemit: totalCollectedSinceLastRemit,
        totalFeeSinceLastRemit: totalFeeSinceLastRemit,
        pendingToRemit: pendingToRemit > 0 ? pendingToRemit : 0,
        alreadyRemitted: alreadyRemitted,
        remittanceHistory: property.remittance_history || [],
        billsHistory: property.bills_history || [],
        statements: property.statements || []
    };

    if (propertyId) {
        financialsCache[propertyId] = {
            data: result,
            timestamp: Date.now()
        };
    }

    return result;
}


// ============ PROCESS APPROVED PAYMENT (FIXED - ADDS TO TOTALS) ============

async function processApprovedPayment(propertyId, roomIndex, amount, month, method, reference, transactionId, paymentDate) {
    console.log("=== processApprovedPayment START ===");
    // Invalidate cached financials (if any)
    clearFinancialsCache(propertyId);

    console.log("Amount to add:", amount);
    console.log("Month (selected):", month);
    console.log("Room Index:", roomIndex);
    
    try {
        // 1. Get current property data directly from Supabase (FRESH data)
        const { data: property, error: propError } = await window.supabaseClient
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();
        
        if (propError || !property) {
            console.error("Property not found:", propError);
            return false;
        }
        
        console.log("Property loaded:", property.name);
        
        // 2. Get current counters from the FRESH database data
        let currentCollected = property.total_collected_since_last_remit || 0;
        let currentFee = property.total_fee_since_last_remit || 0;
        
        console.log("Current collected in DB before adding:", currentCollected);
        console.log("Current fee in DB before adding:", currentFee);
        
        // 3. Calculate new values (ADD to existing, not replace)
        const managementFee = property.management_fee || 5;
        const feeAmount = (amount * managementFee) / 100;
        const amountToOwner = amount - feeAmount;
        
        const newCollected = currentCollected + amount;
        const newFee = currentFee + feeAmount;
        
        console.log(`Adding: +${amount} to collected, +${feeAmount} to fee`);
        console.log(`NEW totals will be: Collected=${newCollected}, Fee=${newFee}`);
        
        // 4. Update the room's payment record
        let propertyData = property.data || { units: [] };
        let units = propertyData.units || [];
        
        if (!units[roomIndex]) {
            console.error("Room not found at index:", roomIndex);
            return false;
        }
        
        const room = units[roomIndex];
        const paymentDateStr = paymentDate || new Date().toISOString().split('T')[0];
        
        // CRITICAL FIX: Use the SELECTED month from the request, not the payment date
        // month comes in format "2025-01" from the approval request
        const paymentMonthKey = month;
        
        console.log(`Using payment month key: ${paymentMonthKey} (from selected month)`);
        
        // Initialize payments object if needed
        if (!room.payments) room.payments = {};
        if (!room.payments[paymentMonthKey]) {
            room.payments[paymentMonthKey] = {
                rentDue: room.rentAmount,
                paid: 0,
                balance: room.rentAmount,
                status: "unpaid",
                paidDate: null,
                feeDeducted: 0,
                amountToOwner: 0
            };
        }
        
        const monthPayment = room.payments[paymentMonthKey];
        
        // ADD to existing payment (in case of partial payments)
        monthPayment.paid += amount;
        monthPayment.balance = Math.max(0, monthPayment.rentDue - monthPayment.paid);
        monthPayment.feeDeducted = (monthPayment.feeDeducted || 0) + feeAmount;
        monthPayment.amountToOwner = (monthPayment.amountToOwner || 0) + amountToOwner;
        monthPayment.paidDate = paymentDateStr;
        monthPayment.transaction_id = transactionId;
        monthPayment.payment_method = method;
        monthPayment.reference = reference;
        
        if (monthPayment.balance <= 0) {
            monthPayment.status = "paid";
        } else {
            monthPayment.status = "partial";
        }
        
        // Calculate paid until date (30 days from payment date)
        const paymentDateObj = new Date(paymentDateStr);
        const paidUntilDateObj = addDays(paymentDateObj, 30);
        const paidUntilDate = formatDate(paidUntilDateObj);
        
        // Add to payment history
        if (!room.paymentHistory) room.paymentHistory = [];
        room.paymentHistory.push({
            id: Date.now(),
            amount: amount,
            feeDeducted: feeAmount,
            amountToOwner: amountToOwner,
            method: method,
            reference: reference,
            paymentDate: paymentDateStr,
            paidUntilDate: paidUntilDate,
            month: paymentMonthKey,
            transaction_id: transactionId
        });
        
        // Update room status
        room.isPaid = monthPayment.balance === 0;
        room.paidUntilDate = paidUntilDate;
        room.paid = monthPayment.balance === 0;
        
        propertyData.units = units;
        
        // 5. Update Supabase with ADDED totals
        const { error: updateError } = await window.supabaseClient
            .from('properties')
            .update({ 
                data: propertyData,
                total_collected_since_last_remit: newCollected,
                total_fee_since_last_remit: newFee,
                updated_at: new Date().toISOString()
            })
            .eq('id', propertyId);
        
        if (updateError) {
            console.error("Error updating property:", updateError);
            return false;
        }
        
        console.log(`✅ Payment recorded successfully!`);
        console.log(`   Total Collected: ${currentCollected} → ${newCollected}`);
        console.log(`   Total Fee: ${currentFee} → ${newFee}`);
        console.log(`   Amount added to owner's pending: ${amountToOwner}`);
        
        // Log the activity
        if (window.addActivityLog) {
            await window.addActivityLog(
                'payment_recorded',
                `Payment of UGX ${amount.toLocaleString()} recorded for room ${room.roomNumber} for month ${paymentMonthKey}. Fee: UGX ${feeAmount.toLocaleString()}, To Owner: UGX ${amountToOwner.toLocaleString()}. Transaction: ${transactionId}`,
                propertyId,
                transactionId
            );
        }
        
        return true;
        
    } catch (err) {
        console.error("Error in processApprovedPayment:", err);
        return false;
    }
}

// Make globally accessible
window.processApprovedPayment = processApprovedPayment;
window.getFinancials = getFinancials;
window.clearFinancialsCache = clearFinancialsCache;

// ============ REMIT TO OWNER (RESETS COUNTERS) ============


async function remitToOwner(propertyId, amount, method, reference) {
    console.log("=== remitToOwner called ===");
    console.log("Amount to remit:", amount);

    // Invalidate cached financials (if any)
    clearFinancialsCache(propertyId);

    try {
        // Get FRESH property data
        const { data: property, error } = await window.supabaseClient
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();
        
        if (error || !property) {
            console.error("Property not found:", error);
            return false;
        }
        
        const financials = getFinancials(property);
        const pendingAmount = financials.pendingToRemit;
        
        if (amount > pendingAmount) {
            alert(`Amount cannot exceed pending remittance of UGX ${pendingAmount.toLocaleString()}`);
            return false;
        }
        
        const newAlreadyRemitted = (property.already_remitted || 0) + amount;
        
        let remittanceHistory = property.remittance_history || [];
        remittanceHistory.push({
            id: Date.now(),
            date: new Date().toISOString(),
            amount: amount,
            method: method,
            reference: reference,
            totalCollectedAtRemit: property.total_collected_since_last_remit || 0,
            totalFeeAtRemit: property.total_fee_since_last_remit || 0
        });
        
        // RESET both counters to ZERO after remittance
        const { error: updateError } = await window.supabaseClient
            .from('properties')
            .update({
                remittance_history: remittanceHistory,
                total_collected_since_last_remit: 0,
                total_fee_since_last_remit: 0,
                already_remitted: newAlreadyRemitted,
                updated_at: new Date().toISOString()
            })
            .eq('id', propertyId);
        
        if (updateError) {
            console.error("Error updating remittance:", updateError);
            alert('Failed to process remittance: ' + updateError.message);
            return false;
        }
        
        console.log("✅ Remittance successful! Counters reset to zero.");
        alert(`✅ Remittance of UGX ${amount.toLocaleString()} sent successfully!`);
        
        // Log the activity
        if (window.addActivityLog) {
            await window.addActivityLog(
                'remittance_sent',
                `Remittance of UGX ${amount.toLocaleString()} sent to owner via ${method}. Reference: ${reference || 'N/A'}`,
                propertyId
            );
        }
        
        return true;
        
    } catch (err) {
        console.error("Error in remitToOwner:", err);
        alert('Error: ' + err.message);
        return false;
    }
}

// Make remitToOwner globally available
window.remitToOwner = remitToOwner;

// ============ ADD BILL PAYMENT ============

async function addBillPayment(propertyId, billType, amount, receiptImage, description) {
    try {
        // Invalidate cached financials (if any)
        clearFinancialsCache(propertyId);

        const { data: property, error } = await window.supabaseClient
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();
        
        if (error || !property) return false;
        
        const billRecord = {
            id: Date.now(),
            date: new Date().toISOString(),
            billType: billType,
            amount: amount,
            receiptImage: receiptImage,
            description: description
        };
        
        let billsHistory = property.bills_history || [];
        billsHistory.push(billRecord);
        
        // Deduct from collected amount
        let currentCollected = property.total_collected_since_last_remit || 0;
        let newCollected = Math.max(0, currentCollected - amount);
        
        await window.supabaseClient
            .from('properties')
            .update({
                bills_history: billsHistory,
                total_collected_since_last_remit: newCollected,
                updated_at: new Date().toISOString()
            })
            .eq('id', propertyId);
        
        if (window.addActivityLog) {
            await window.addActivityLog(
                'bill_paid',
                `${billType} bill of UGX ${amount.toLocaleString()} paid. Deducted from collected rent.`,
                propertyId
            );
        }
        
        return true;
        
    } catch (err) {
        console.error("Error adding bill payment:", err);
        return false;
    }
}

window.addBillPayment = addBillPayment;

// ============ GET VACANT UNITS ============

let vacantUnitsCache = null;
let vacantUnitsCacheTime = 0;

function getAllVacantUnits(forceRefresh = false) {
    // Cache for 1 minute
    if (!forceRefresh && vacantUnitsCache && (Date.now() - vacantUnitsCacheTime) < 60000) {
        return vacantUnitsCache;
    }

    const vacantUnits = [];
    for (let propId in propertiesDB) {
        const prop = propertiesDB[propId];
        if (prop.status !== 'active') continue;
        const units = prop.data?.units || prop.units || [];
        for (let unit of units) {
            if (unit.vacant === true) {
                vacantUnits.push({
                    propertyId: propId,
                    propertyName: prop.name,
                    location: prop.location,
                    roomNumber: unit.roomNumber,
                    rent: unit.rentAmount,
                    roomImage: unit.roomImage || prop.propertyImage,
                    roomImages: unit.roomImages || []
                });
            }
        }
    }
    vacantUnitsCache = vacantUnits;
    vacantUnitsCacheTime = Date.now();
    return vacantUnits;
}


window.getAllVacantUnits = getAllVacantUnits;

// ============ OWNER AUTHENTICATION ============

let ownerPasswordCache = {};

async function getOwnerByPassword(password) {
    if (!password) return null;

    // Check cache (5 minutes)
    if (ownerPasswordCache[password] && (Date.now() - ownerPasswordCache[password].timestamp) < 300000) {
        return ownerPasswordCache[password].data;
    }

    const { data, error } = await window.supabaseClient

        .from('properties')
        .select('id, name, owner_name, owner_phone, owner_password')
        .eq('owner_password', password);
    
    if (error || !data || data.length === 0) return null;
    
    const property = data[0];
    const result = {
        id: property.id,

        name: property.owner_name,
        phone: property.owner_phone,
        propertyId: property.id,
        password: property.owner_password
    };

    // Store cache
    ownerPasswordCache[password] = {
        data: result,
        timestamp: Date.now()
    };

    return result;
}


window.getOwnerByPassword = getOwnerByPassword;

// ============ ADD ROOM ============

async function addRoom(propertyId, roomData) {
    const { data: property, error } = await window.supabaseClient
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .single();
    
    if (error || !property) return false;
    
    let propertyData = typeof property.data === 'object' ? property.data : {};
    if (!propertyData.units) propertyData.units = [];
    const units = propertyData.units;
    const currentYear = new Date().getFullYear();
    
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
        roomImages: roomData.roomImages || [],
        vacant: true,
        tenant: "",
        tenantPhone: "",
        paymentDueDate: roomData.paymentDueDate || 1,
        moveInDate: roomData.moveInDate || null,
        isPaid: false,
        paid: false,
        paymentStatus: "VACANT",
        paidUntilDate: null,
        lastPaymentDate: null,
        payments: payments,
        paymentHistory: []
    };
    
    units.push(newRoom);
    propertyData.units = units;
    
    await window.supabaseClient
        .from('properties')
        .update({ data: propertyData })
        .eq('id', propertyId);
    
    if (window.addActivityLog) {
        await window.addActivityLog(
            'room_added',
            `Room ${roomData.roomNumber} added with rent UGX ${roomData.rentAmount.toLocaleString()}/month`,
            propertyId
        );
    }
    
    return true;
}

window.addRoom = addRoom;

// ============ RESET MONTH ============

async function resetMonth(propertyId, newYear, newMonth) {
    console.log("=== resetMonth called ===");
    
    try {
        const { data: property, error } = await window.supabaseClient
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();
        
        if (error || !property) return false;
        
        let propertyData = typeof property.data === 'object' ? property.data : {};
        if (!propertyData.units) propertyData.units = [];
        const units = propertyData.units;
        
        const newMonthKey = `${newYear}-${String(newMonth).padStart(2, '0')}`;
        
        for (let room of units) {
            if (room.vacant) continue;
            
            let totalUnpaidBalance = 0;
            
            for (let monthKey in room.payments) {
                const payment = room.payments[monthKey];
                if (payment.status !== 'paid' && payment.balance > 0) {
                    totalUnpaidBalance += payment.balance;
                }
            }
            
            room.payments[newMonthKey] = {
                rentDue: room.rentAmount,
                paid: 0,
                balance: room.rentAmount + totalUnpaidBalance,
                status: "unpaid",
                paidDate: null,
                feeDeducted: 0,
                amountToOwner: 0,
                penaltyAmount: 0,
                locked: false
            };
            
            room.paid = false;
            room.isPaid = false;
        }
        
        propertyData.units = units;
        
        await window.supabaseClient
            .from('properties')
            .update({
                data: propertyData,
                current_year: newYear,
                current_month: newMonth,
                updated_at: new Date().toISOString()
            })
            .eq('id', propertyId);
        
        if (window.addActivityLog) {
            await window.addActivityLog(
                'month_reset',
                `Month reset to ${newMonthKey}. Unpaid balances carried forward.`,
                propertyId
            );
        }
        
        return true;
        
    } catch (err) {
        console.error("Error in resetMonth:", err);
        return false;
    }
}

window.resetMonth = resetMonth;

// ============ DELETE PROPERTY ============

async function deleteProperty(propertyId) {
    await window.supabaseClient.from('properties').delete().eq('id', propertyId);
    delete propertiesDB[propertyId];

    // Clear caches
    clearFinancialsCache(propertyId);
    vacantUnitsCache = null;

    delete messagesDB[propertyId];
    delete adminNotes[propertyId];
    delete globalUpdates[propertyId];
    ownersDB = ownersDB.filter(o => o.propertyId !== propertyId);
}

window.deleteProperty = deleteProperty;

// Load data when script starts
window.supabaseDataLoaded = loadAllData();