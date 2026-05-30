// chat-system.js - Anonymous Chat System for Admin/Worker Dashboards

let chatRefreshInterval = null;
let currentChatUserRole = null;
let currentChatUserId = null;

// Initialize chat system
async function initChatSystem() {
    console.log("Initializing chat system...");
    
    const user = getCurrentUserForChat();
    if (!user) {
        console.log("No user logged in, chat not initialized");
        return;
    }
    
    currentChatUserRole = user.role;
    currentChatUserId = user.id;
    
    // Start auto-refresh
    startChatAutoRefresh();
    
    // Load messages immediately
    await loadChatMessages();
    
    console.log("Chat system initialized for role:", currentChatUserRole);
}

// Get current user for chat
function getCurrentUserForChat() {
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

// Send a chat message
async function sendChatMessage(message) {
    if (!message || message.trim() === "") {
        alert("Please enter a message");
        return false;
    }
    
    const user = getCurrentUserForChat();
    if (!user) {
        alert("You must be logged in to chat");
        return false;
    }
    
    try {
        const { error } = await window.supabaseClient
            .from('chat_messages')
            .insert({
                sender_id: user.id,
                sender_name: user.name,
                sender_role: user.role,
                message: message.trim(),
                created_at: new Date().toISOString()
            });
        
        if (error) {
            console.error("Error sending message:", error);
            alert("Failed to send message: " + error.message);
            return false;
        }
        
        // Clear input field
        const inputField = document.getElementById('chatMessageInput');
        if (inputField) inputField.value = '';
        
        // Refresh messages immediately
        await loadChatMessages();
        
        return true;
    } catch (err) {
        console.error("Error in sendChatMessage:", err);
        return false;
    }
}

// Load chat messages (with role-based visibility)
async function loadChatMessages() {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;
    
    try {
        // Get last 50 messages
        const { data, error } = await window.supabaseClient
            .from('chat_messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) {
            console.error("Error loading messages:", error);
            container.innerHTML = '<div class="chat-error">Failed to load messages. Please refresh.</div>';
            return;
        }
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="chat-empty">No messages yet. Be the first to say something!</div>';
            return;
        }
        
        // Sort by oldest first for display
        const messages = data.reverse();
        
        let html = '';
        for (let msg of messages) {
            const date = new Date(msg.created_at);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString();
            
            // Role-based visibility
            if (currentChatUserRole === 'super_admin') {
                // Super Admin sees who sent the message
                let roleIcon = '';
                let roleColor = '';
                if (msg.sender_role === 'super_admin') {
                    roleIcon = '👑';
                    roleColor = '#8b5cf6';
                } else if (msg.sender_role === 'property_admin') {
                    roleIcon = '🏢';
                    roleColor = '#2c7be5';
                } else if (msg.sender_role === 'worker') {
                    roleIcon = '👷';
                    roleColor = '#f59e0b';
                } else {
                    roleIcon = '👤';
                    roleColor = '#666';
                }
                
                html += `
                    <div class="chat-message" style="border-left-color: ${roleColor};">
                        <div class="chat-message-header">
                            <span class="chat-sender-icon">${roleIcon}</span>
                            <span class="chat-sender-name" style="color: ${roleColor};">${escapeHtmlForChat(msg.sender_name)}</span>
                            <span class="chat-sender-role">(${msg.sender_role.replace('_', ' ')})</span>
                            <span class="chat-message-time">${dateStr} ${timeStr}</span>
                        </div>
                        <div class="chat-message-body">${escapeHtmlForChat(msg.message)}</div>
                    </div>
                `;
            } else {
                // Property Admin and Worker see anonymous messages (no sender info)
                html += `
                    <div class="chat-message chat-message-anonymous">
                        <div class="chat-message-header">
                            <span class="chat-sender-icon">💬</span>
                            <span class="chat-sender-name">Team Member</span>
                            <span class="chat-message-time">${dateStr} ${timeStr}</span>
                        </div>
                        <div class="chat-message-body">${escapeHtmlForChat(msg.message)}</div>
                    </div>
                `;
            }
        }
        
        container.innerHTML = html;
        
        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
        
    } catch (err) {
        console.error("Error in loadChatMessages:", err);
        container.innerHTML = '<div class="chat-error">Error loading messages. Please refresh.</div>';
    }
}

// Start auto-refresh for chat messages
function startChatAutoRefresh() {
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    
    chatRefreshInterval = setInterval(() => {
        loadChatMessages();
    }, 5000); // Refresh every 5 seconds
}

// Stop auto-refresh
function stopChatAutoRefresh() {
    if (chatRefreshInterval) {
        clearInterval(chatRefreshInterval);
        chatRefreshInterval = null;
    }
}

// Send message on Enter key
function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const inputField = document.getElementById('chatMessageInput');
        if (inputField) {
            sendChatMessage(inputField.value);
        }
    }
}

// Toggle chat panel visibility
function toggleChatPanel() {
    const panel = document.getElementById('chatPanel');
    const toggleBtn = document.getElementById('chatToggleBtn');
    
    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'flex';
        if (toggleBtn) toggleBtn.innerHTML = '💬 Close Chat';
        loadChatMessages();
    } else {
        panel.style.display = 'none';
        if (toggleBtn) toggleBtn.innerHTML = '💬 Open Chat';
    }
}

// Escape HTML for chat messages
function escapeHtmlForChat(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/\n/g, '<br>');
}

// Chat panel HTML component
function getChatPanelHTML() {
    return `
        <div id="chatPanel" class="chat-panel" style="display: none;">
            <div class="chat-header">
                <span>💬 Team Chat</span>
                <button onclick="toggleChatPanel()" class="chat-close">×</button>
            </div>
            <div class="chat-messages" id="chatMessagesContainer">
                <div class="chat-loading">Loading messages...</div>
            </div>
            <div class="chat-input-area">
                <textarea id="chatMessageInput" rows="2" placeholder="Type your message here..." onkeypress="handleChatKeyPress(event)"></textarea>
                <button onclick="sendChatMessage(document.getElementById('chatMessageInput').value)" class="chat-send-btn">📤 Send</button>
            </div>
        </div>
        <button id="chatToggleBtn" class="chat-toggle-btn" onclick="toggleChatPanel()">💬 Open Chat</button>
    `;
}

// Chat panel CSS
function addChatStyles() {
    if (document.getElementById('chat-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'chat-styles';
    style.textContent = `
        /* Chat Toggle Button */
        .chat-toggle-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #2c7be5;
            color: white;
            border: none;
            border-radius: 50px;
            padding: 12px 20px;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: all 0.2s ease;
        }
        .chat-toggle-btn:hover {
            background: #1a68d1;
            transform: scale(1.02);
        }
        
        /* Chat Panel */
        .chat-panel {
            position: fixed;
            bottom: 80px;
            right: 20px;
            width: 380px;
            height: 500px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            z-index: 1000;
            overflow: hidden;
            border: 1px solid #e2e8f0;
        }
        
        /* Chat Header */
        .chat-header {
            background: #0a2b4e;
            color: white;
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: bold;
        }
        .chat-close {
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            line-height: 1;
        }
        .chat-close:hover {
            opacity: 0.8;
        }
        
        /* Chat Messages Area */
        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            background: #f8fafc;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        /* Individual Message */
        .chat-message {
            background: white;
            border-radius: 12px;
            padding: 10px 12px;
            border-left: 3px solid #2c7be5;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .chat-message-anonymous {
            border-left-color: #cbd5e1;
        }
        .chat-message-header {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 6px;
            font-size: 0.7rem;
            flex-wrap: wrap;
        }
        .chat-sender-icon {
            font-size: 0.8rem;
        }
        .chat-sender-name {
            font-weight: bold;
        }
        .chat-sender-role {
            color: #666;
            font-size: 0.65rem;
        }
        .chat-message-time {
            color: #999;
            font-size: 0.6rem;
            margin-left: auto;
        }
        .chat-message-body {
            font-size: 0.8rem;
            color: #333;
            line-height: 1.4;
            word-wrap: break-word;
        }
        
        /* Chat Input Area */
        .chat-input-area {
            padding: 12px;
            background: white;
            border-top: 1px solid #e2e8f0;
            display: flex;
            gap: 8px;
            align-items: flex-end;
        }
        .chat-input-area textarea {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 20px;
            font-size: 0.8rem;
            resize: none;
            font-family: inherit;
        }
        .chat-input-area textarea:focus {
            outline: none;
            border-color: #2c7be5;
        }
        .chat-send-btn {
            background: #2c7be5;
            color: white;
            border: none;
            border-radius: 40px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 0.8rem;
            font-weight: bold;
        }
        .chat-send-btn:hover {
            background: #1a68d1;
        }
        
        /* Chat States */
        .chat-loading, .chat-empty, .chat-error {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.8rem;
        }
        .chat-error {
            color: #dc2626;
        }
        
        /* Mobile Responsive */
        @media (max-width: 600px) {
            .chat-panel {
                width: calc(100% - 40px);
                right: 20px;
                left: 20px;
                height: 450px;
            }
            .chat-toggle-btn {
                bottom: 15px;
                right: 15px;
                padding: 10px 16px;
                font-size: 0.9rem;
            }
        }
    `;
    document.head.appendChild(style);
}

// Initialize chat panel in the page
function initChatPanel() {
    addChatStyles();
    
    // Check if chat panel already exists
    if (!document.getElementById('chatPanel')) {
        const chatHtml = getChatPanelHTML();
        document.body.insertAdjacentHTML('beforeend', chatHtml);
    }
    
    // Initialize chat system
    initChatSystem();
}

// Make functions globally available
window.initChatPanel = initChatPanel;
window.sendChatMessage = sendChatMessage;
window.loadChatMessages = loadChatMessages;
window.toggleChatPanel = toggleChatPanel;
window.handleChatKeyPress = handleChatKeyPress;
window.stopChatAutoRefresh = stopChatAutoRefresh;