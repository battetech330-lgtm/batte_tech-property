// image-manager.js - Collapsible Image Manager for All Elements

let imageManagerExpanded = false;

if (typeof escapeHtml !== 'function') {
    window.escapeHtml = function(text) {
        if (!text) return '';
        return String(text).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
    };
}

function toggleImageManager() {
    const panel = document.getElementById('imageManagerPanel');
    if (!panel) return;
    
    if (imageManagerExpanded) {
        panel.style.display = 'none';
        imageManagerExpanded = false;
    } else {
        panel.style.display = 'block';
        imageManagerExpanded = true;
        loadImageManagerContent();
    }
}

async function loadImageManagerContent() {
    const container = document.getElementById('imageManagerContent');
    if (!container) return;
    
    // Get all properties, rooms, admins, workers
    const { data: properties } = await window.supabaseClient
        .from('properties')
        .select('id, name, property_image, data');
    
    const { data: admins } = await window.supabaseClient
        .from('users')
        .select('id, full_name, photo_url')
        .eq('role', 'property_admin');
    
    const { data: workers } = await window.supabaseClient
        .from('users')
        .select('id, full_name, photo_url')
        .eq('role', 'worker');
    
    let html = `
        <div style="max-height: 400px; overflow-y: auto; padding: 0.5rem;">
            <h4><i class="fas fa-building"></i> Properties</h4>
            <div class="image-manager-grid">
    `;
    
    // Properties
    for (let prop of properties || []) {
        html += `
            <div class="image-manager-card">
                <div class="image-manager-title">🏢 ${escapeHtml(prop.name)}</div>
                <div class="image-manager-preview">
                    <img src="${prop.property_image || 'https://placehold.co/100x100?text=No+Image'}" class="image-manager-thumb" onerror="this.src='https://placehold.co/100x100?text=No+Image'">
                </div>
                <div class="image-manager-actions">
                    <button onclick="uploadImageFor('property', '${prop.id}', 'property_image')" class="btn-sm"><i class="fas fa-upload"></i> Upload</button>
                    <button onclick="openRoomImages('${prop.id}')" class="btn-sm btn-info"><i class="fas fa-door-open"></i> Room Images</button>
                </div>
            </div>
        `;
    }
    
    // Admins
    html += `<h4 style="margin-top:1rem;"><i class="fas fa-user-shield"></i> Property Admins</h4><div class="image-manager-grid">`;
    for (let admin of admins || []) {
        html += `
            <div class="image-manager-card">
                <div class="image-manager-title">👑 ${escapeHtml(admin.full_name)}</div>
                <div class="image-manager-preview">
                    <img src="${admin.photo_url || 'https://placehold.co/100x100?text=No+Photo'}" class="image-manager-thumb" onerror="this.src='https://placehold.co/100x100?text=No+Photo'">
                </div>
                <div class="image-manager-actions">
                    <button onclick="uploadImageFor('admin', '${admin.id}', 'photo_url')" class="btn-sm"><i class="fas fa-upload"></i> Upload</button>
                </div>
            </div>
        `;
    }
    
    // Workers
    html += `<h4 style="margin-top:1rem;"><i class="fas fa-hard-hat"></i> Workers</h4><div class="image-manager-grid">`;
    for (let worker of workers || []) {
        html += `
            <div class="image-manager-card">
                <div class="image-manager-title">👷 ${escapeHtml(worker.full_name)}</div>
                <div class="image-manager-preview">
                    <img src="${worker.photo_url || 'https://placehold.co/100x100?text=No+Photo'}" class="image-manager-thumb" onerror="this.src='https://placehold.co/100x100?text=No+Photo'">
                </div>
                <div class="image-manager-actions">
                    <button onclick="uploadImageFor('worker', '${worker.id}', 'photo_url')" class="btn-sm"><i class="fas fa-upload"></i> Upload</button>
                </div>
            </div>
        `;
    }
    
    html += `</div></div>`;
    container.innerHTML = html;
}

async function openRoomImages(propertyId) {
    const { data: property } = await window.supabaseClient
        .from('properties')
        .select('data, name')
        .eq('id', propertyId)
        .single();
    
    const units = property?.data?.units || [];
    
    let modalHtml = `
        <div id="roomImagesModal" class="modal" style="display:flex; z-index:3000;">
            <div class="modal-content" style="max-width: 800px;">
                <h3><i class="fas fa-door-open"></i> Room Images - ${escapeHtml(property?.name)}</h3>
                <div style="max-height: 500px; overflow-y: auto;">
    `;
    
    for (let i = 0; i < units.length; i++) {
        const room = units[i];
        modalHtml += `
            <div style="border: 1px solid #ddd; border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                <h4><i class="fas fa-door-open"></i> ${escapeHtml(room.roomNumber)}</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
                    ${(room.roomImages || []).map((img, idx) => `
                        <div style="position: relative; display: inline-block;">
                            <img src="${img}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;">
                            <button onclick="removeRoomImage('${propertyId}', ${i}, ${idx})" style="position: absolute; top: -5px; right: -5px; background: #dc2626; color: white; border-radius: 50%; width: 20px; height: 20px; font-size: 10px; cursor: pointer;">×</button>
                        </div>
                    `).join('') || '<span style="color: #666;">No images</span>'}
                </div>
                <button onclick="uploadRoomImages('${propertyId}', ${i})" class="btn-sm" style="background:#f59e0b;"><i class="fas fa-plus"></i> Add Images</button>
                <input type="file" id="roomImagesInput_${i}" accept="image/*" multiple style="display:none;" onchange="uploadRoomImagesHandler('${propertyId}', ${i}, event)">
            </div>
        `;
    }
    
    modalHtml += `
                </div>
                <button onclick="closeRoomImagesModal()" style="margin-top: 1rem;"><i class="fas fa-times"></i> Close</button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeRoomImagesModal() {
    const modal = document.getElementById('roomImagesModal');
    if (modal) modal.remove();
}

async function uploadRoomImages(propertyId, roomIndex) {
    const input = document.getElementById(`roomImagesInput_${roomIndex}`);
    if (input) input.click();
}

async function uploadRoomImagesHandler(propertyId, roomIndex, event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const { data: property } = await window.supabaseClient
        .from('properties')
        .select('data')
        .eq('id', propertyId)
        .single();
    
    let propertyData = property.data || { units: [] };
    const room = propertyData.units[roomIndex];
    if (!room.roomImages) room.roomImages = [];
    
    for (let file of files) {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async function(e) {
                room.roomImages.push(e.target.result);
                propertyData.units = propertyData.units;
                
                await window.supabaseClient
                    .from('properties')
                    .update({ data: propertyData })
                    .eq('id', propertyId);
                
                alert(`✅ Image added to ${room.roomNumber}`);
                closeRoomImagesModal();
                openRoomImages(propertyId);
            };
            reader.readAsDataURL(file);
        }
    }
}

async function removeRoomImage(propertyId, roomIndex, imageIndex) {
    if (!confirm('Remove this image?')) return;
    
    const { data: property } = await window.supabaseClient
        .from('properties')
        .select('data')
        .eq('id', propertyId)
        .single();
    
    let propertyData = property.data || { units: [] };
    propertyData.units[roomIndex].roomImages.splice(imageIndex, 1);
    
    await window.supabaseClient
        .from('properties')
        .update({ data: propertyData })
        .eq('id', propertyId);
    
    alert('✅ Image removed');
    closeRoomImagesModal();
    openRoomImages(propertyId);
}

async function uploadImageFor(type, id, field) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async function(event) {
            const imageData = event.target.result;
            
            if (type === 'property') {
                await window.supabaseClient
                    .from('properties')
                    .update({ [field]: imageData })
                    .eq('id', id);
            } else {
                await window.supabaseClient
                    .from('users')
                    .update({ [field]: imageData })
                    .eq('id', id);
            }
            
            alert('✅ Image updated!');
            loadImageManagerContent();
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// Add CSS for image manager
function addImageManagerStyles() {
    if (document.getElementById('image-manager-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'image-manager-styles';
    style.textContent = `
        .image-manager-toggle {
            position: fixed;
            bottom: 100px;
            right: 20px;
            background: #8b5cf6;
            color: white;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        }
        .image-manager-toggle:hover {
            transform: scale(1.05);
            background: #7c3aed;
        }
        .image-manager-panel {
            position: fixed;
            bottom: 160px;
            right: 20px;
            width: 400px;
            max-width: calc(100vw - 40px);
            background: white;
            border-radius: 16px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.2);
            z-index: 999;
            display: none;
            max-height: 500px;
            overflow-y: auto;
            border: 1px solid #e2e8f0;
        }
        .image-manager-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 0.8rem;
            margin-bottom: 1rem;
        }
        .image-manager-card {
            background: #f8fafc;
            border-radius: 12px;
            padding: 0.8rem;
            text-align: center;
            border: 1px solid #e2e8f0;
        }
        .image-manager-title {
            font-size: 0.75rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .image-manager-thumb {
            width: 80px;
            height: 80px;
            object-fit: cover;
            border-radius: 12px;
            margin-bottom: 0.5rem;
        }
        .image-manager-actions {
            display: flex;
            gap: 0.3rem;
            justify-content: center;
        }
        .btn-sm {
            padding: 4px 8px;
            font-size: 0.65rem;
            background: #0a2b4e;
            color: white;
            border: none;
            border-radius: 20px;
            cursor: pointer;
        }
        .btn-info {
            background: #2c7be5;
        }
        @media (max-width: 600px) {
            .image-manager-panel {
                width: calc(100vw - 40px);
                right: 20px;
                left: 20px;
            }
        }
    `;
    document.head.appendChild(style);
}

function initImageManager() {
    addImageManagerStyles();
    
    if (!document.getElementById('imageManagerToggle')) {
        const toggleHtml = `
            <div id="imageManagerToggle" class="image-manager-toggle" onclick="toggleImageManager()">
                <i class="fas fa-images"></i>
            </div>
            <div id="imageManagerPanel" class="image-manager-panel">
                <div style="background: #8b5cf6; color: white; padding: 12px; border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fas fa-images"></i> Image Manager</span>
                    <button onclick="toggleImageManager()" style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer;">×</button>
                </div>
                <div id="imageManagerContent" style="padding: 1rem;"></div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', toggleHtml);
    }
}

window.initImageManager = initImageManager;
window.toggleImageManager = toggleImageManager;
window.uploadImageFor = uploadImageFor;
window.openRoomImages = openRoomImages;
window.closeRoomImagesModal = closeRoomImagesModal;
window.uploadRoomImages = uploadRoomImages;
window.uploadRoomImagesHandler = uploadRoomImagesHandler;
window.removeRoomImage = removeRoomImage;
