// chat-system.js - Team Chat System

// ============ CHAT FUNCTIONS ============

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, m => (m === '&' ? '&amp;' : m === '<' ? '<' : '>'));
}

function getCurrentUser() {
    const userId = localStorage.getItem('battetech_user_id');
    const userRole = localStorage.getItem('battetech_user_role');
    const userName = localStorage.getItem('battetech_user_name');

    if (!userId) return null;

    return {
        id: userId,
        role: userRole,
        name: userName
    };
}

function toggleChatPanel() {
    const panel = document.getElementById('chatPanel');
    if (!panel) return;

    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'flex';
        loadChatMessages();
    } else {
        panel.style.display = 'none';
    }
}

async function sendChatMessage() {
    const messageInput = document.getElementById('chatMessageInput');
    const message = messageInput?.value?.trim();

    if (!message) {
        alert('Please enter a message');
        return;
    }

    const user = getCurrentUser();
    if (!user) {
        alert('You must be logged in to chat');
        return;
    }

    try {
        const { error } = await window.supabaseClient
            .from('chat_messages')
            .insert({
                sender_id: user.id,
                sender_name: user.name,
                sender_role: user.role,
                message: message,
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        if (messageInput) messageInput.value = '';
        await loadChatMessages();
    } catch (err) {
        console.error('Error sending message:', err);
        alert('Failed to send message: ' + (err?.message || err));
    }
}

async function loadChatMessages() {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    try {
        const { data, error } = await window.supabaseClient
            .from('chat_messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;"><i class="fas fa-comment-slash"></i> No messages yet. Be the first to say something!</div>';
            return;
        }

        const messages = data.reverse();
        let html = '';

        for (let msg of messages) {
            const date = new Date(msg.created_at);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString();

            let roleIcon = '';
            let roleName = '';

            if (msg.sender_role === 'super_admin') {
                roleIcon = '👑';
                roleName = 'Super Admin';
            } else if (msg.sender_role === 'property_admin') {
                roleIcon = '🏢';
                roleName = 'Property Admin';
            } else if (msg.sender_role === 'worker') {
                roleIcon = '👷';
                roleName = 'Worker';
            } else {
                roleIcon = '👤';
                roleName = msg.sender_role || 'User';
            }

            html += `
                <div class="chat-message">
                    <div class="chat-message-header">
                        <span>${roleIcon}</span>
                        <span class="chat-sender-name">${escapeHtml(msg.sender_name)}</span>
                        <span class="chat-sender-role">(${escapeHtml(roleName)})</span>
                        <span class="chat-message-time">${dateStr} ${timeStr}</span>
                    </div>
                    <div class="chat-message-body">
                        ${escapeHtml(msg.message)}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error('Error loading messages:', err);
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: red;"><i class="fas fa-exclamation-triangle"></i> Error loading messages. Please refresh.</div>';
    }
}

// Auto-refresh chat every 5 seconds
let chatRefreshInterval = null;

function startChatAutoRefresh() {
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(() => {
        const panel = document.getElementById('chatPanel');
        if (panel && panel.style.display === 'flex') {
            loadChatMessages();
        }
    }, 5000);
}

// Initialize chat
function initChatPanel() {
    startChatAutoRefresh();
}

// Call this when page loads
initChatPanel();

// Make functions globally available
window.initChatPanel = initChatPanel;
window.sendChatMessage = sendChatMessage;
window.loadChatMessages = loadChatMessages;
window.toggleChatPanel = toggleChatPanel;

