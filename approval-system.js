// approval-system.js - Worker actions require admin approval

async function createApprovalRequest(propertyId, actionType, actionData, workerId, workerName) {
    const { data: property, error: propertyError } = await window.supabaseClient
        .from('properties')
        .select('admin_id')
        .eq('id', propertyId)
        .single();

    if (propertyError || !property) {
        console.error('Unable to find property for approval request:', propertyError);
        return null;
    }

    const { data, error } = await window.supabaseClient
        .from('approval_requests')
        .insert({
            property_id: propertyId,
            action_type: actionType,
            action_data: actionData,
            worker_id: workerId,
            worker_name: workerName,
            status: 'pending',
            created_at: new Date()
        })
        .select();

    if (error) {
        console.error('Approval request failed:', error);
        return null;
    }

    if (data && data.length > 0) {
        await addNotification(
            property.admin_id,
            'Action Requires Approval',
            `${workerName} requested to ${actionType}`,
            'approval'
        );
        return data[0];
    }

    return null;
}

async function getPendingApprovals(adminId) {
    const { data: properties, error: propertiesError } = await window.supabaseClient
        .from('properties')
        .select('id')
        .eq('admin_id', adminId);

    if (propertiesError || !properties) {
        console.error('Unable to load properties for pending approvals:', propertiesError);
        return [];
    }

    const propertyIds = (properties || []).map(p => p.id);
    if (propertyIds.length === 0) return [];

    const { data, error } = await window.supabaseClient
        .from('approval_requests')
        .select('*')
        .in('property_id', propertyIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Unable to load approval requests:', error);
        return [];
    }

    return data || [];
}

async function approveAction(requestId, adminId) {
    const { data: request, error: requestError } = await window.supabaseClient
        .from('approval_requests')
        .select('*')
        .eq('id', requestId)
        .single();

    if (requestError || !request) {
        console.error('Unable to load approval request:', requestError);
        return false;
    }

    let success = false;

    if (request.action_type === 'delete_room') {
        const { data: property, error: propError } = await window.supabaseClient
            .from('properties')
            .select('data')
            .eq('id', request.property_id)
            .single();

        if (property && property.data && Array.isArray(property.data.units)) {
            property.data.units.splice(request.action_data.roomIndex, 1);
            await window.supabaseClient
                .from('properties')
                .update({ data: property.data })
                .eq('id', request.property_id);
            success = true;
        }
    } else if (request.action_type === 'edit_tenant') {
        const { data: property, error: propError } = await window.supabaseClient
            .from('properties')
            .select('data')
            .eq('id', request.property_id)
            .single();

        if (property && property.data && Array.isArray(property.data.units) && property.data.units[request.action_data.roomIndex]) {
            property.data.units[request.action_data.roomIndex].tenant = request.action_data.tenantName;
            property.data.units[request.action_data.roomIndex].tenantPhone = request.action_data.tenantPhone;
            await window.supabaseClient
                .from('properties')
                .update({ data: property.data })
                .eq('id', request.property_id);
            success = true;
        }
    } else if (request.action_type === 'mark_paid') {
        success = true;
    }

    await window.supabaseClient
        .from('approval_requests')
        .update({ 
            status: success ? 'approved' : 'failed',
            approved_by: adminId,
            approved_at: new Date()
        })
        .eq('id', requestId);

    await addNotification(
        request.worker_id,
        `Action ${success ? 'Approved' : 'Failed'}`,
        `Your request to ${request.action_type} was ${success ? 'approved' : 'failed'}`,
        'approval'
    );

    return success;
}

async function rejectAction(requestId, adminId, reason) {
    await window.supabaseClient
        .from('approval_requests')
        .update({ 
            status: 'rejected',
            approved_by: adminId,
            rejection_reason: reason,
            approved_at: new Date()
        })
        .eq('id', requestId);

    const { data: request, error: requestError } = await window.supabaseClient
        .from('approval_requests')
        .select('worker_id, action_type')
        .eq('id', requestId)
        .single();

    if (!request || requestError) {
        console.error('Unable to load approval request for rejection notification:', requestError);
        return true;
    }

    await addNotification(
        request.worker_id,
        'Action Rejected',
        `Your request to ${request.action_type} was rejected. Reason: ${reason}`,
        'approval'
    );

    return true;
}
