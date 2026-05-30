// supabase-data.js - Supabase Cloud Database Version
// FINAL VERSION - Financials calculated from actual payment records, not stored counters

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
        const { data: properties, error: propError } = await window.supabaseClient
            .from('properties')
            .select('*');
        
        if (propError) {
            console.error("Error loading properties:", propError);
        } else if (properties) {
            propertiesDB = {};
            properties.forEach(prop => {
                propertiesDB[prop.id] = prop.data || prop;
                if (!propertiesDB[prop.id].units) {
                    propertiesDB[prop.id].units = [];
                }
            });
            console.log(`Loaded ${Object.keys(propertiesDB).length} properties`);
        }
        
        const { data: owners, error: ownerError } = await window.supabaseClient
            .from('owners')
            .select('*');
        
        if (ownerError) {
            console.error("Error loading owners:", ownerError);
        } else if (owners) {
            ownersDB = [];
            owners.forEach(owner => {
                ownersDB.push(owner.data || owner);
            });
            console.log(`Loaded ${ownersDB.length} owners`);
        }
        
        const { data: updates, error: updateError } = await window.supabaseClient
            .from('updates')
            .select('*');
        
        if (updateError) {
            console.error("Error loading updates:", updateError);
        } else if (updates) {
            globalUpdates = {};
            updates.forEach(update => {
                globalUpdates[update.property_id] = update.data?.updates || [];
            });
        }
        
        const { data: messages, error: msgError } = await window.supabaseClient
            .from('messages')
            .select('*');
        
        if (msgError) {
            console.error("Error loading messages:", msgError);
        } else if (messages) {
            messagesDB = {};
            messages.forEach(msg => {
                messagesDB[msg.property_id] = msg.data?.messages || [];
            });
        }
        
        const { data: notes, error: noteError } = await window.supabaseClient
            .from('notes')
            .select('*');
        
        if (noteError) {
            console.error("Error loading notes:", noteError);
        } else if (notes) {
            adminNotes = {};
            notes.forEach(note => {
                adminNotes[note.property_id] = note.data?.note || "";
            });
        }
        
        console.log("All data loaded from Supabase successfully");
    } catch (error) {
        console.error("Error in loadAllData:", error);
    }
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

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// ============ FINANCIAL CALCULATIONS (CALCULATES FROM ACTUAL DATA - NO STORED COUNTERS) ============

function getFinancials(property) {
    const units = property.data?.units || property.units || [];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    
    let currentMonthCollected = 0;
    let currentMonthPending = 0;
    let totalCollectedSinceLastRemit = 0;
    let totalFeeSinceLastRemit = 0;
    let alreadyRemitted = property.already_remitted || 0;
    
    const today = getTodayDate();
    
    for (let room of units) {
        if (room.vacant) continue;
        
        // Current month calculations from paymentsByMonth
        const monthPayment = room.paymentsByMonth?.[currentMonthKey];
        if (monthPayment) {
            currentMonthCollected += monthPayment.paid || 0;
            currentMonthPending += monthPayment.balance || 0;
        } else {
            currentMonthPending += room.rentAmount || 0;
        }
        
        // Calculate total collected since last remit from payment history
        // Only include payments that are still valid (paidUntilDate >= today)
        if (room.paymentHistory && room.paymentHistory.length > 0) {
            for (let payment of room.paymentHistory) {
                // Only count active payments (not expired)
                if (payment.paidUntilDate && payment.paidUntilDate >= today) {
                    totalCollectedSinceLastRemit += payment.amount || 0;
                    totalFeeSinceLastRemit += payment.feeDeducted || 0;
                }
            }
        }
    }
    
    const pendingToRemit = totalCollectedSinceLastRemit - totalFeeSinceLastRemit;
    
    console.log("=== getFinancials (Calculated from Data) ===");
    console.log("Current Month Collected:", currentMonthCollected);
    console.log("Current Month Pending:", currentMonthPending);
    console.log("Total Collected (from active payments):", totalCollectedSinceLastRemit);
    console.log("Total Fee (from active payments):", totalFeeSinceLastRemit);
    console.log("Already Remitted:", alreadyRemitted);
    console.log("Pending to Remit:", pendingToRemit);
    
    return {
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
}

// ============ PROCESS APPROVED PAYMENT (NO COUNTER STORAGE) ============

async function processApprovedPayment(propertyId, roomIndex, amount, month, method, reference, transactionId, paymentDate) {
    console.log("=== processApprovedPayment START ===");
    console.log("Property ID:", propertyId);
    console.log("Room Index:", roomIndex);
    console.log("Amount:", amount);
    console.log("Month:", month);
    console.log("Payment Date:", paymentDate);
    
    try {
        // Get fresh property data directly from Supabase
        const { data: property, error: propError } = await window.supabaseClient
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();
        
        if (propError || !property) {
            console.error("Property not found:", propError);
            return false;
        }
        
        console.log("Property found:", property.name);
        
        // Parse property data
        let propertyData = {};
        if (property.data && typeof property.data === 'object') {
            propertyData = JSON.parse(JSON.stringify(property.data));
        } else if (typeof property.data === 'string') {
            try {
                propertyData = JSON.parse(property.data);
            } catch(e) {
                propertyData = {};
            }
        } else {
            propertyData = {};
        }
        
        if (!propertyData.units) propertyData.units = [];
        let units = propertyData.units;
        
        if (!units[roomIndex]) {
            console.error("Room not found at index:", roomIndex);
            return false;
        }
        
        const room = units[roomIndex];
        console.log("Room found:", room.roomNumber);
        
        const managementFee = property.management_fee || 5;
        const feeAmount = (amount * managementFee) / 100;
        const amountToOwner = amount - feeAmount;
        
        // Set payment date
        const paymentDateStr = paymentDate || new Date().toISOString().split('T')[0];
        const paymentDateObj = new Date(paymentDateStr);
        
        // Calculate paid until date (30 days from payment date)
        const paidUntilDateObj = new Date(paymentDateObj);
        paidUntilDateObj.setDate(paidUntilDateObj.getDate() + 30);
        const paidUntilDate = paidUntilDateObj.toISOString().split('T')[0];
        
        // Get month key from payment date
        const paymentYear = paymentDateObj.getFullYear();
        const paymentMonth = paymentDateObj.getMonth() + 1;
        const paymentMonthKey = `${paymentYear}-${String(paymentMonth).padStart(2, '0')}`;
        
        // Initialize paymentsByMonth if needed
        if (!room.paymentsByMonth) room.paymentsByMonth = {};
        
        // Create or update month payment record
        if (!room.paymentsByMonth[paymentMonthKey]) {
            room.paymentsByMonth[paymentMonthKey] = {
                rentDue: room.rentAmount,
                paid: 0,
                balance: room.rentAmount,
                status: "unpaid",
                paidDate: null,
                feeDeducted: 0,
                amountToOwner: 0,
                transaction_id: null,
                payment_method: null,
                reference: null
            };
        }
        
        const monthPayment = room.paymentsByMonth[paymentMonthKey];
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
            monthPayment.locked = true;
        } else {
            monthPayment.status = "partial";
        }
        
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
        
        // Update room's current status
        room.isPaid = true;
        room.paidUntilDate = paidUntilDate;
        room.paymentStatus = "PAID";
        room.lastPaymentDate = paymentDateStr;
        room.currentBalance = 0;
        
        propertyData.units = units;
        
        // IMPORTANT: Do NOT update total_collected_since_last_remit or total_fee_since_last_remit
        // These values are now calculated on the fly by getFinancials()
        const { error: updateError } = await window.supabaseClient
            .from('properties')
            .update({ 
                data: propertyData,
                updated_at: new Date().toISOString()
            })
            .eq('id', propertyId);
        
        if (updateError) {
            console.error("Error updating property:", updateError);
            return false;
        }
        
        console.log("✅ Payment successfully recorded!");
        console.log("Room", room.roomNumber, "paid until:", paidUntilDate);
        
        return true;
        
    } catch (err) {
        console.error("Error in processApprovedPayment:", err);
        return false;
    }
}

// Make globally accessible
window.processApprovedPayment = processApprovedPayment;
window.getFinancials = getFinancials;

// ============ REMIT TO OWNER ============

async function remitToOwner(propertyId, amount, method, reference) {
    console.log("=== remitToOwner called ===");
    
    try {
        const { data: property, error } = await window.supabaseClient
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();
        
        if (error || !property) {
            console.error("Property not found:", error);
            return false;
        }
        
        // Calculate current pending to remit from actual data
        const financials = getFinancials(property);
        const pendingAmount = financials.pendingToRemit;
        
        if (amount > pendingAmount) {
            console.error("Amount exceeds pending remittance");
            return false;
        }
        
        let remittanceHistory = property.remittance_history || [];
        remittanceHistory.push({
            id: Date.now(),
            date: new Date().toISOString(),
            amount: amount,
            method: method,
            reference: reference,
            totalCollectedAtRemit: financials.totalCollectedSinceLastRemit,
            totalFeeAtRemit: financials.totalFeeSinceLastRemit
        });
        
        const newAlreadyRemitted = (property.already_remitted || 0) + amount;
        
        const { error: updateError } = await window.supabaseClient
            .from('properties')
            .update({
                already_remitted: newAlreadyRemitted,
                remittance_history: remittanceHistory,
                updated_at: new Date().toISOString()
            })
            .eq('id', propertyId);
        
        if (updateError) {
            console.error("Error updating remittance:", updateError);
            return false;
        }
        
        console.log("✅ Remittance sent! Already Remitted:", newAlreadyRemitted);
        return true;
        
    } catch (err) {
        console.error("Error in remitToOwner:", err);
        return false;
    }
}

// ============ RESET MONTH ============

async function resetMonth(propertyId, newYear, newMonth) {
    console.log("=== resetMonth called ===");
    console.log("Resetting to:", newYear, newMonth);
    
    try {
        const { data: property, error } = await window.supabaseClient
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();
        
        if (error || !property) {
            console.error("Property not found:", error);
            return false;
        }
        
        let propertyData = typeof property.data === 'object' ? property.data : {};
        if (!propertyData.units) propertyData.units = [];
        const units = propertyData.units;
        
        const oldMonth = property.current_month || new Date().getMonth() + 1;
        const oldYear = property.current_year || new Date().getFullYear();
        const oldMonthKey = `${oldYear}-${String(oldMonth).padStart(2, '0')}`;
        const newMonthKey = `${newYear}-${String(newMonth).padStart(2, '0')}`;
        const penaltyRate = property.penalty_fee || 0;
        
        // Generate statement for the old month
        await generateMonthlyStatement(propertyId, oldMonth, oldYear);
        
        for (let room of units) {
            if (room.vacant) continue;
            
            let totalUnpaidBalance = 0;
            let totalPenalty = 0;
            
            for (let monthKey in room.paymentsByMonth) {
                const payment = room.paymentsByMonth[monthKey];
                if (payment.status !== 'paid' && payment.balance > 0) {
                    totalUnpaidBalance += payment.balance;
                    
                    if (penaltyRate > 0 && monthKey !== newMonthKey) {
                        const penalty = (payment.balance * penaltyRate) / 100;
                        totalPenalty += penalty;
                        payment.balance += penalty;
                        payment.penaltyAmount = (payment.penaltyAmount || 0) + penalty;
                    }
                }
            }
            
            room.paymentsByMonth[newMonthKey] = {
                rentDue: room.rentAmount,
                paid: 0,
                balance: room.rentAmount + totalUnpaidBalance + totalPenalty,
                status: "unpaid",
                paidDate: null,
                feeDeducted: 0,
                amountToOwner: 0,
                penaltyAmount: totalPenalty,
                locked: false,
                carriedOverFrom: totalUnpaidBalance > 0 ? oldMonthKey : null,
                carriedOverAmount: totalUnpaidBalance
            };
            
            room.paid = false;
            room.isPaid = false;
            
            console.log(`Room ${room.roomNumber}: New balance = ${room.paymentsByMonth[newMonthKey].balance}`);
        }
        
        propertyData.units = units;
        
        // Reset only the display month and already_remitted (now stored in statements)
        const { error: updateError } = await window.supabaseClient
            .from('properties')
            .update({
                data: propertyData,
                current_year: newYear,
                current_month: newMonth,
                already_remitted: 0,
                updated_at: new Date().toISOString()
            })
            .eq('id', propertyId);
        
        if (updateError) {
            console.error("Error resetting month:", updateError);
            return false;
        }
        
        console.log("✅ Month reset successfully!");
        
        await addActivityLog('month_reset', `Reset to new month: ${newMonthKey}.`, propertyId);
        
        return true;
        
    } catch (err) {
        console.error("Error in resetMonth:", err);
        return false;
    }
}

// ============ GENERATE MONTHLY STATEMENT ============

async function generateMonthlyStatement(propertyId, month, year) {
    console.log("=== generateMonthlyStatement called ===");
    
    try {
        const { data: property, error } = await window.supabaseClient
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();
        
        if (error || !property) {
            console.error("Property not found:", error);
            return null;
        }
        
        let propertyData = typeof property.data === 'object' ? property.data : {};
        if (!propertyData.units) propertyData.units = [];
        const units = propertyData.units;
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        
        let totalCollected = 0;
        let totalFeeDeducted = 0;
        let totalToOwner = 0;
        let paidTenants = [];
        let unpaidTenants = [];
        
        for (let room of units) {
            if (room.vacant) continue;
            
            const payment = room.paymentsByMonth?.[monthKey];
            if (payment) {
                if (payment.status === 'paid') {
                    totalCollected += payment.rentDue;
                    totalFeeDeducted += payment.feeDeducted;
                    totalToOwner += payment.amountToOwner;
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
            generatedBy: localStorage.getItem('battetech_user_name') || 'System',
            generatedByRole: localStorage.getItem('battetech_user_role') || 'admin',
            summary: {
                totalCollected: totalCollected,
                totalFeeDeducted: totalFeeDeducted,
                totalToOwner: totalToOwner,
                paidTenantsCount: paidTenants.length,
                unpaidTenantsCount: unpaidTenants.length
            },
            paidTenants: paidTenants,
            unpaidTenants: unpaidTenants,
            alreadyRemittedAtTime: property.already_remitted || 0
        };
        
        let statements = property.statements || [];
        statements.push(statement);
        
        await window.supabaseClient
            .from('properties')
            .update({
                statements: statements,
                updated_at: new Date().toISOString()
            })
            .eq('id', propertyId);
        
        console.log("✅ Statement generated for:", monthKey);
        
        return statement;
        
    } catch (err) {
        console.error("Error in generateMonthlyStatement:", err);
        return null;
    }
}

// ============ ADD BILL PAYMENT ============

async function addBillPayment(propertyId, billType, amount, receiptImage, description) {
    try {
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
        
        await window.supabaseClient
            .from('properties')
            .update({
                bills_history: billsHistory,
                updated_at: new Date().toISOString()
            })
            .eq('id', propertyId);
        
        return true;
        
    } catch (err) {
        console.error("Error adding bill payment:", err);
        return false;
    }
}

// ============ TENANT EVACUATION ============

async function evacuateTenant(propertyId, roomIndex, reason) {
    try {
        const { data: property, error } = await window.supabaseClient
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();
        
        if (error || !property) return { success: false };
        
        let propertyData = typeof property.data === 'object' ? property.data : {};
        if (!propertyData.units) propertyData.units = [];
        const units = propertyData.units;
        const room = units[roomIndex];
        
        if (!room || room.vacant) return { success: false };
        
        let writtenOffAmount = 0;
        
        if (room.paymentsByMonth) {
            for (let monthKey in room.paymentsByMonth) {
                const payment = room.paymentsByMonth[monthKey];
                if (payment.status !== 'paid' && payment.balance > 0) {
                    writtenOffAmount += payment.balance;
                    payment.balance = 0;
                    payment.status = 'written_off';
                    payment.writtenOffReason = reason;
                    payment.writtenOffDate = new Date().toISOString();
                }
            }
        }
        
        room.vacant = true;
        room.tenant = "";
        room.tenantPhone = "";
        room.isPaid = false;
        room.paymentStatus = "VACANT";
        room.evacuatedDate = new Date().toISOString();
        room.evacuatedReason = reason;
        room.writtenOffAmount = writtenOffAmount;
        
        propertyData.units = units;
        
        await window.supabaseClient
            .from('properties')
            .update({
                data: propertyData,
                updated_at: new Date().toISOString()
            })
            .eq('id', propertyId);
        
        return { success: true, writtenOffAmount: writtenOffAmount };
        
    } catch (err) {
        console.error("Error evacuating tenant:", err);
        return { success: false };
    }
}

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
    
    const paymentsByMonth = {};
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    
    for (let i = 0; i < months.length; i++) {
        const monthKey = `${currentYear}-${months[i]}`;
        paymentsByMonth[monthKey] = {
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
        paymentStatus: "VACANT",
        paidUntilDate: null,
        lastPaymentDate: null,
        paymentsByMonth: paymentsByMonth,
        paymentHistory: []
    };
    
    units.push(newRoom);
    propertyData.units = units;
    
    await window.supabaseClient
        .from('properties')
        .update({ data: propertyData })
        .eq('id', propertyId);
    
    return true;
}

// ============ ADD PROPERTY ============

async function addProperty(propertyData) {
    const propertyId = `prop_${Date.now()}`;
    
    await window.supabaseClient
        .from('properties')
        .insert({
            id: propertyId,
            name: propertyData.name,
            location: propertyData.location,
            owner_password: propertyData.ownerPassword,
            owner_name: propertyData.ownerName,
            owner_phone: propertyData.ownerPhone,
            property_image: propertyData.propertyImage || "",
            status: propertyData.status || "active",
            management_fee: propertyData.managementFee || 5,
            penalty_fee: propertyData.penaltyFee || 0,
            current_year: new Date().getFullYear(),
            current_month: new Date().getMonth() + 1,
            already_remitted: 0,
            remittance_history: [],
            bills_history: [],
            statements: [],
            data: { units: [] }
        });
    
    propertiesDB[propertyId] = {
        id: propertyId,
        name: propertyData.name,
        location: propertyData.location,
        ownerPassword: propertyData.ownerPassword,
        ownerName: propertyData.ownerName,
        ownerPhone: propertyData.ownerPhone,
        propertyImage: propertyData.propertyImage || "",
        status: propertyData.status || "active",
        managementFee: propertyData.managementFee || 5,
        penaltyFee: propertyData.penaltyFee || 0,
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth() + 1,
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
    
    return propertyId;
}

// ============ GET VACANT UNITS ============

function getAllVacantUnits() {
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
    return vacantUnits;
}

// ============ OWNER AUTHENTICATION ============

async function getOwnerByPassword(password) {
    if (!password) return null;
    
    const { data, error } = await window.supabaseClient
        .from('properties')
        .select('id, name, owner_name, owner_phone, owner_password')
        .eq('owner_password', password);
    
    if (error || !data || data.length === 0) return null;
    
    const property = data[0];
    return {
        id: property.id,
        name: property.owner_name,
        phone: property.owner_phone,
        propertyId: property.id,
        password: property.owner_password
    };
}

async function deleteProperty(propertyId) {
    await window.supabaseClient.from('properties').delete().eq('id', propertyId);
    delete propertiesDB[propertyId];
    delete messagesDB[propertyId];
    delete adminNotes[propertyId];
    delete globalUpdates[propertyId];
    ownersDB = ownersDB.filter(o => o.propertyId !== propertyId);
}

function addActivityLog(action, details, propertyId, transactionId) {
    if (window.addActivityLog) {
        window.addActivityLog(action, details, propertyId, transactionId);
    }
}

// Load data when script starts
window.supabaseDataLoaded = loadAllData();
window.processApprovedPayment = processApprovedPayment;
window.remitToOwner = remitToOwner;
window.addBillPayment = addBillPayment;
window.getAllVacantUnits = getAllVacantUnits;
window.getOwnerByPassword = getOwnerByPassword;
window.getFinancials = getFinancials;
window.addRoom = addRoom;
window.resetMonth = resetMonth;