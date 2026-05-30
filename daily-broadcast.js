// daily-broadcast.js - WhatsApp broadcast with worker photo and phone

async function sendCollectionBroadcast(propertyId, workerId, collectionDate) {
    // Uses global window.supabaseClient from supabase-config.js
    
    // Get worker details
    const { data: worker, error: workerError } = await window.supabaseClient
        .from('users')
        .select('*')
        .eq('id', workerId)
        .single();
    
    if (workerError || !worker) {
        console.error('Worker not found');
        return { success: false, error: 'Worker not found' };
    }
    
    // Get property details
    const { data: property, error: propError } = await window.supabaseClient
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .single();
    
    if (propError || !property) {
        console.error('Property not found');
        return { success: false, error: 'Property not found' };
    }
    
    // Get all tenants in this property
    const propertyData = property.data || { units: [] };
    const tenants = [];
    
    for (let room of propertyData.units) {
        if (!room.vacant && room.tenantPhone) {
            let phone = room.tenantPhone.replace(/\s/g, '');
            if (phone.startsWith('0')) phone = '256' + phone.substring(1);
            if (!phone.startsWith('256')) phone = '256' + phone;
            
            tenants.push({
                name: room.tenant,
                phone: phone,
                room: room.roomNumber
            });
        }
    }
    
    if (tenants.length === 0) {
        return { success: false, error: 'No tenants found' };
    }
    
    const dateStr = new Date(collectionDate).toLocaleDateString('en-GB');
    const workerPhoto = worker.photo_url || '';
    const workerPhone = worker.phone || '';
    
    // Build message with worker details
    let message = `🏢 *BATTETECH PROPERTY MANAGEMENT*\n\n`;
    message += `🔔 *RENT COLLECTION NOTICE*\n\n`;
    message += `*Today's Date:* ${dateStr}\n`;
    message += `*Property:* ${property.name}\n\n`;
    message += `*👤 Assigned Worker:*\n`;
    message += `Name: ${worker.full_name}\n`;
    message += `Phone: ${workerPhone}\n`;
    if (workerPhoto) {
        message += `Photo: [See attached image]\n`;
    }
    message += `\n*⚠️ IMPORTANT:*\n`;
    message += `This person will collect rent today. Please verify by calling the number above.\n\n`;
    message += `*Payment Methods:* Cash | Mobile Money | Bank\n\n`;
    message += `Thank you for your cooperation.\n`;
    message += `BATTETECH - Your Property, Our Priority`;
    
    // Send to each tenant
    let successCount = 0;
    for (let i = 0; i < tenants.length; i++) {
        const t = tenants[i];
        const personalMsg = `Dear ${t.name} (Room ${t.room}),\n\n${message}`;
        const encodedMsg = encodeURIComponent(personalMsg);
        
        // Open WhatsApp with delay between messages
        setTimeout(() => {
            window.open(`https://wa.me/${t.phone}?text=${encodedMsg}`, '_blank');
        }, i * 2000);
        
        successCount++;
    }
    
    // Log the broadcast
    await window.supabaseClient.from('collection_broadcasts').insert({
        property_id: propertyId,
        worker_id: workerId,
        worker_name: worker.full_name,
        worker_phone: workerPhone,
        worker_photo_url: workerPhoto,
        collection_date: collectionDate,
        message_sent: true,
        sent_at: new Date().toISOString(),
        tenants_count: tenants.length
    });
    
    // Add audit log
    await addAuditLog(workerId, 'send_broadcast', 'collection_broadcasts', propertyId, {
        tenants_count: tenants.length,
        collection_date: collectionDate
    });
    
    return { success: true, count: successCount };
}

// Generate collection badge/card for worker (digital)
function generateWorkerCollectionCard(worker, property, collectionDate) {
    const card = `
        <div style="border: 2px solid #0a2b4e; border-radius: 16px; padding: 16px; max-width: 350px; font-family: Arial, sans-serif;">
            <div style="text-align: center;">
                <div style="font-size: 24px;">🏢</div>
                <h2 style="color: #0a2b4e;">BATTETECH</h2>
                <h3 style="color: #2c7be5;">RENT COLLECTION CARD</h3>
            </div>
            <hr>
            <p><strong>Worker Name:</strong> ${worker.full_name}</p>
            <p><strong>Worker Phone:</strong> ${worker.phone || 'Not provided'}</p>
            ${worker.photo_url ? `<img src="${worker.photo_url}" style="width: 100px; height: 100px; border-radius: 50%; margin: 10px auto; display: block;">` : ''}
            <p><strong>Property:</strong> ${property.name}</p>
            <p><strong>Collection Date:</strong> ${new Date(collectionDate).toLocaleDateString()}</p>
            <p><strong>Valid ID:</strong> ${worker.id.substring(0, 8)}</p>
            <hr>
            <p style="font-size: 12px; text-align: center;">Present this card when collecting rent</p>
        </div>
    `;
    return card;
}

// Print worker collection card
function printWorkerCard(worker, property, collectionDate) {
    const cardHtml = generateWorkerCollectionCard(worker, property, collectionDate);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head><title>Worker Collection Card</title></head>
            <body>${cardHtml}</body>
        </html>
    `);
    printWindow.print();
    printWindow.close();
}