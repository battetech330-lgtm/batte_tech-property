// sliding-panel.js - Reusable sliding drawer for financial details

let currentPanel = null;

function showFinancialDetails(type, propertyId, propertyName) {
    // Remove existing panel if any
    if (currentPanel) {
        currentPanel.remove();
    }

    // Create panel container
    const panel = document.createElement('div');
    panel.className = 'financial-sliding-panel';
    panel.innerHTML = `
        <div class="financial-panel-overlay" onclick="closeFinancialPanel()"></div>
        <div class="financial-panel-content">
            <div class="financial-panel-header">
                <h3><i class="fas fa-chart-line"></i> <span id="panelTitle">Loading...</span></h3>
                <button class="financial-panel-close" onclick="closeFinancialPanel()">&times;</button>
            </div>
            <div class="financial-panel-body" id="panelBody">
                <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);
    currentPanel = panel;

    // Trigger animation
    setTimeout(() => {
        panel.classList.add('active');
    }, 10);

    // Load content based on type
    loadPanelContent(type, propertyId, propertyName);
}

async function loadPanelContent(type, propertyId, propertyName) {
    const titleElement = document.getElementById('panelTitle');
    const bodyElement = document.getElementById('panelBody');

    if (!titleElement || !bodyElement) return;

    try {
        // Get property data
        const { data: property, error } = await window.supabaseClient
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();

        if (error) throw error;

        const units = property.data?.units || [];
        const financials = getFinancials(property);

        switch (type) {
            case 'collected_this_month':
                titleElement.innerHTML = '<i class="fas fa-coins"></i> Collected This Month - Details';
                await showCollectedThisMonth(bodyElement, units, property);
                break;
            case 'pending_this_month':
                titleElement.innerHTML = '<i class="fas fa-hourglass-half"></i> Pending This Month - Details';
                await showPendingThisMonth(bodyElement, units, property);
                break;
            case 'total_collected':
                titleElement.innerHTML = '<i class="fas fa-wallet"></i> Total Collected (All Time) - Details';
                await showTotalCollectedAllTime(bodyElement, units, property);
                break;
            case 'management_fee':
                titleElement.innerHTML = '<i class="fas fa-percent"></i> Management Fee History - Details';
                await showManagementFeeHistory(bodyElement, units, property);
                break;
            case 'pending_to_remit':
                titleElement.innerHTML = '<i class="fas fa-paper-plane"></i> Pending to Remit - Details';
                await showPendingToRemit(bodyElement, units, property);
                break;
            case 'already_remitted':
                titleElement.innerHTML = '<i class="fas fa-circle-check"></i> Already Remitted - History';
                await showAlreadyRemitted(bodyElement, property);
                break;
            default:
                bodyElement.innerHTML = '<div class="panel-error">Invalid selection</div>';
        }
    } catch (err) {
        console.error("Error loading panel:", err);
        bodyElement.innerHTML = `<div class="panel-error"><i class="fas fa-exclamation-triangle"></i> Error loading data: ${err.message}</div>`;
    }
}

async function showCollectedThisMonth(container, units, property) {
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    const currentMonthKey = `${currentYear}-${currentMonth}`;

    let payments = [];
    let totalCollected = 0;

    for (let room of units) {
        if (room.vacant) continue;
        const monthPayment = room.payments?.[currentMonthKey];
        if (monthPayment && monthPayment.paid > 0) {
            payments.push({
                roomNumber: room.roomNumber,
                tenant: room.tenant,
                amount: monthPayment.paid,
                date: monthPayment.paidDate,
                method: monthPayment.payment_method,
                reference: monthPayment.reference
            });
            totalCollected += monthPayment.paid;
        }
    }

    if (payments.length === 0) {
        container.innerHTML = '<div class="panel-empty"><i class="fas fa-info-circle"></i> No payments recorded this month.</div>';
        return;
    }

    let html = `
        <div class="panel-summary">
            <div class="summary-total">Total Collected: UGX ${totalCollected.toLocaleString()}</div>
            <div class="summary-count">${payments.length} payment(s)</div>
        </div>
        <div class="panel-table-container">
            <table class="panel-table">
                <thead>
                    <tr>
                        <th>Room</th>
                        <th>Tenant</th>
                        <th>Amount</th>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Reference</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (let p of payments) {
        const date = p.date ? new Date(p.date).toLocaleDateString() : '-';
        html += `
            <tr>
                <td>${escapeHtmlForPanel(p.roomNumber)}</td>
                <td>${escapeHtmlForPanel(p.tenant)}</td>
                <td>UGX ${p.amount.toLocaleString()}</td>
                <td>${date}</td>
                <td>${escapeHtmlForPanel(p.method || '-')}</td>
                <td>${escapeHtmlForPanel(p.reference || '-')}</td>
            </tr>
        `;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

async function showPendingThisMonth(container, units, property) {
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    const currentMonthKey = `${currentYear}-${currentMonth}`;
    const today = new Date().toISOString().split('T')[0];

    let pending = [];
    let totalPending = 0;

    for (let room of units) {
        if (room.vacant) continue;

        const monthPayment = room.payments?.[currentMonthKey];
        let balance = room.rentAmount;
        let status = 'UNPAID';

        if (monthPayment) {
            balance = monthPayment.balance;
            if (balance === 0) status = 'PAID';
            else if (monthPayment.paid > 0) status = 'PARTIAL';
        }

        if (balance > 0) {
            // Calculate days overdue
            let daysOverdue = 0;
            if (monthPayment?.paidDate) {
                const paidUntil = new Date(monthPayment.paidDate);
                paidUntil.setDate(paidUntil.getDate() + 30);
                if (paidUntil < new Date(today)) {
                    daysOverdue = Math.ceil((new Date(today) - paidUntil) / (1000 * 60 * 60 * 24));
                }
            }

            pending.push({
                roomNumber: room.roomNumber,
                tenant: room.tenant,
                phone: room.tenantPhone,
                balance: balance,
                status: status,
                daysOverdue: daysOverdue
            });
            totalPending += balance;
        }
    }

    if (pending.length === 0) {
        container.innerHTML = '<div class="panel-empty"><i class="fas fa-check-circle"></i> No pending payments this month!</div>';
        return;
    }

    let html = `
        <div class="panel-summary">
            <div class="summary-total" style="color:#dc2626;">Total Pending: UGX ${totalPending.toLocaleString()}</div>
            <div class="summary-count">${pending.length} tenant(s) owe</div>
        </div>
        <div class="panel-table-container">
            <table class="panel-table">
                <thead>
                    <tr>
                        <th>Room</th>
                        <th>Tenant</th>
                        <th>Phone</th>
                        <th>Balance</th>
                        <th>Status</th>
                        <th>Overdue</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (let p of pending) {
        const overdueBadge = p.daysOverdue > 0 ? `<span class="overdue-badge">${p.daysOverdue} days</span>` : '-';
        html += `
            <tr>
                <td>${escapeHtmlForPanel(p.roomNumber)}</td>
                <td>${escapeHtmlForPanel(p.tenant)}</td>
                <td>${escapeHtmlForPanel(p.phone || '-')}</td>
                <td class="amount-pending">UGX ${p.balance.toLocaleString()}</td>
                <td><span class="status-badge status-${p.status.toLowerCase()}">${p.status}</span></td>
                <td>${overdueBadge}</td>
            </tr>
        `;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

async function showTotalCollectedAllTime(container, units, property) {
    let allPayments = [];
    let totalCollected = 0;
    let totalFee = 0;

    for (let room of units) {
        if (room.vacant) continue;

        if (room.paymentHistory && room.paymentHistory.length > 0) {
            for (let payment of room.paymentHistory) {
                allPayments.push({
                    roomNumber: room.roomNumber,
                    tenant: room.tenant,
                    amount: payment.amount,
                    fee: payment.feeDeducted,
                    toOwner: payment.amountToOwner,
                    date: payment.paymentDate,
                    method: payment.method,
                    reference: payment.reference,
                    month: payment.month
                });
                totalCollected += payment.amount || 0;
                totalFee += payment.feeDeducted || 0;
            }
        }
    }

    // Sort by date (newest first)
    allPayments.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (allPayments.length === 0) {
        container.innerHTML = '<div class="panel-empty"><i class="fas fa-info-circle"></i> No payment records found.</div>';
        return;
    }

    let html = `
        <div class="panel-summary">
            <div class="summary-total">Total Collected (All Time): UGX ${totalCollected.toLocaleString()}</div>
            <div class="summary-sub">Total Management Fees: UGX ${totalFee.toLocaleString()}</div>
            <div class="summary-sub">Total to Owner: UGX ${(totalCollected - totalFee).toLocaleString()}</div>
            <div class="summary-count">${allPayments.length} payment(s)</div>
        </div>
        <div class="panel-table-container">
            <table class="panel-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Room</th>
                        <th>Tenant</th>
                        <th>Amount</th>
                        <th>Fee (5%)</th>
                        <th>To Owner</th>
                        <th>Method</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (let p of allPayments) {
        const date = p.date ? new Date(p.date).toLocaleDateString() : '-';
        html += `
            <tr>
                <td>${date}</td>
                <td>${escapeHtmlForPanel(p.roomNumber)}</td>
                <td>${escapeHtmlForPanel(p.tenant)}</td>
                <td>UGX ${p.amount.toLocaleString()}</td>
                <td>UGX ${p.fee.toLocaleString()}</td>
                <td>UGX ${p.toOwner.toLocaleString()}</td>
                <td>${escapeHtmlForPanel(p.method || '-')}</td>
            </tr>
        `;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

async function showManagementFeeHistory(container, units, property) {
    let feeRecords = [];
    let totalFees = 0;

    for (let room of units) {
        if (room.vacant) continue;

        if (room.paymentHistory && room.paymentHistory.length > 0) {
            for (let payment of room.paymentHistory) {
                if (payment.feeDeducted > 0) {
                    feeRecords.push({
                        roomNumber: room.roomNumber,
                        tenant: room.tenant,
                        amount: payment.amount,
                        fee: payment.feeDeducted,
                        date: payment.paymentDate,
                        transactionId: payment.transaction_id
                    });
                    totalFees += payment.feeDeducted;
                }
            }
        }
    }

    feeRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (feeRecords.length === 0) {
        container.innerHTML = '<div class="panel-empty"><i class="fas fa-info-circle"></i> No management fees recorded yet.</div>';
        return;
    }

    let html = `
        <div class="panel-summary">
            <div class="summary-total">Total Management Fees (All Time): UGX ${totalFees.toLocaleString()}</div>
            <div class="summary-count">From ${feeRecords.length} payment(s)</div>
        </div>
        <div class="panel-table-container">
            <table class="panel-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Room</th>
                        <th>Tenant</th>
                        <th>Payment Amount</th>
                        <th>Fee (5%)</th>
                        <th>Transaction ID</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (let f of feeRecords) {
        const date = f.date ? new Date(f.date).toLocaleDateString() : '-';
        html += `
            <tr>
                <td>${date}</td>
                <td>${escapeHtmlForPanel(f.roomNumber)}</td>
                <td>${escapeHtmlForPanel(f.tenant)}</td>
                <td>UGX ${f.amount.toLocaleString()}</td>
                <td class="amount-fee">UGX ${f.fee.toLocaleString()}</td>
                <td><small>${escapeHtmlForPanel(f.transactionId || '-')}</small></td>
            </tr>
        `;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

async function showPendingToRemit(container, units, property) {
    // Pending to remit is the amount collected but not yet sent to owner
    // This is based on payment history minus remittance history
    const financials = getFinancials(property);
    const pendingAmount = financials.pendingToRemit;

    let pendingPayments = [];
    let totalPending = 0;

    for (let room of units) {
        if (room.vacant) continue;

        if (room.paymentHistory && room.paymentHistory.length > 0) {
            for (let payment of room.paymentHistory) {
                // Check if this payment has been remitted
                let isRemitted = false;
                if (property.remittance_history) {
                    // Simple check - in reality, you'd track which payments were remitted
                    // For now, show all recent payments
                }
                if (!isRemitted) {
                    pendingPayments.push({
                        roomNumber: room.roomNumber,
                        tenant: room.tenant,
                        amount: payment.amount,
                        fee: payment.feeDeducted,
                        toOwner: payment.amountToOwner,
                        date: payment.paymentDate
                    });
                    totalPending += payment.amountToOwner;
                }
            }
        }
    }

    pendingPayments.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (pendingPayments.length === 0) {
        container.innerHTML = '<div class="panel-empty"><i class="fas fa-check-circle"></i> No pending remittances.</div>';
        return;
    }

    let html = `
        <div class="panel-summary">
            <div class="summary-total">Pending to Remit: UGX ${pendingAmount.toLocaleString()}</div>
            <div class="summary-count">From ${pendingPayments.length} payment(s)</div>
        </div>
        <div class="panel-table-container">
            <table class="panel-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Room</th>
                        <th>Tenant</th>
                        <th>Amount</th>
                        <th>Fee</th>
                        <th>To Owner</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (let p of pendingPayments) {
        const date = p.date ? new Date(p.date).toLocaleDateString() : '-';
        html += `
            <tr>
                <td>${date}</td>
                <td>${escapeHtmlForPanel(p.roomNumber)}</td>
                <td>${escapeHtmlForPanel(p.tenant)}</td>
                <td>UGX ${p.amount.toLocaleString()}</td>
                <td>UGX ${p.fee.toLocaleString()}</td>
                <td>UGX ${p.toOwner.toLocaleString()}</td>
            </tr>
        `;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

async function showAlreadyRemitted(container, property) {
    const remittanceHistory = property.remittance_history || [];
    let totalRemitted = 0;

    for (let remit of remittanceHistory) {
        totalRemitted += remit.amount || 0;
    }

    if (remittanceHistory.length === 0) {
        container.innerHTML = '<div class="panel-empty"><i class="fas fa-info-circle"></i> No remittances have been made yet.</div>';
        return;
    }

    // Sort by date (newest first)
    remittanceHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

    let runningTotal = 0;
    let html = `
        <div class="panel-summary">
            <div class="summary-total">Total Remitted to Owner: UGX ${totalRemitted.toLocaleString()}</div>
            <div class="summary-count">${remittanceHistory.length} remittance(s)</div>
        </div>
        <div class="panel-table-container">
            <table class="panel-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th>Running Total</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (let remit of remittanceHistory) {
        const date = remit.date ? new Date(remit.date).toLocaleDateString() : '-';
        runningTotal += remit.amount || 0;
        html += `
            <tr>
                <td>${date}</td>
                <td class="amount-remitted">UGX ${(remit.amount || 0).toLocaleString()}</td>
                <td>${escapeHtmlForPanel(remit.method || '-')}</td>
                <td><small>${escapeHtmlForPanel(remit.reference || '-')}</small></td>
                <td class="running-total">UGX ${runningTotal.toLocaleString()}</td>
            </tr>
        `;
    }

    // Add final total row
    html += `
                    <tr class="total-row">
                        <td colspan="4"><strong>GRAND TOTAL</strong></td>
                        <td><strong>UGX ${totalRemitted.toLocaleString()}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

function closeFinancialPanel() {
    if (currentPanel) {
        currentPanel.classList.remove('active');
        setTimeout(() => {
            if (currentPanel) currentPanel.remove();
            currentPanel = null;
        }, 300);
    }
}

function escapeHtmlForPanel(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '<';
        if (m === '>') return '>';
        return m;
    });
}

// Add CSS for sliding panel
function addSlidingPanelStyles() {
    if (document.getElementById('sliding-panel-styles')) return;

    const style = document.createElement('style');
    style.id = 'sliding-panel-styles';
    style.textContent = `
        .financial-sliding-panel {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
            visibility: hidden;
            transition: visibility 0.3s ease;
        }

        .financial-sliding-panel.active {
            visibility: visible;
        }

        .financial-panel-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .financial-sliding-panel.active .financial-panel-overlay {
            opacity: 1;
        }

        .financial-panel-content {
            position: absolute;
            top: 0;
            right: 0;
            width: 100%;
            max-width: 700px;
            height: 100%;
            background: white;
            box-shadow: -5px 0 30px rgba(0,0,0,0.2);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .financial-sliding-panel.active .financial-panel-content {
            transform: translateX(0);
        }

        .financial-panel-header {
            background: linear-gradient(135deg, #0a2b4e 0%, #1e3a5f 100%);
            color: white;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .financial-panel-header h3 {
            margin: 0;
            font-size: 1.3rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .financial-panel-close {
            background: none;
            border: none;
            color: white;
            font-size: 28px;
            cursor: pointer;
            padding: 0;
            line-height: 1;
        }

        .financial-panel-close:hover {
            opacity: 0.8;
        }

        .financial-panel-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }

        .panel-summary {
            background: linear-gradient(135deg, #f0f4fa 0%, #e2e8f0 100%);
            border-radius: 12px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
        }

        .summary-total {
            font-size: 1.5rem;
            font-weight: bold;
            color: #0a2b4e;
        }

        .summary-sub {
            font-size: 0.9rem;
            color: #475569;
            margin-top: 5px;
        }

        .summary-count {
            font-size: 0.8rem;
            color: #64748b;
            margin-top: 8px;
        }

        .panel-table-container {
            overflow-x: auto;
        }

        .panel-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.8rem;
        }

        .panel-table th,
        .panel-table td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
        }

        .panel-table th {
            background: #f8fafc;
            font-weight: 600;
            color: #0a2b4e;
            position: sticky;
            top: 0;
        }

        .panel-table tr:hover {
            background: #f8fafc;
        }

        .amount-pending {
            color: #dc2626;
            font-weight: 600;
        }

        .amount-fee {
            color: #f59e0b;
            font-weight: 600;
        }

        .amount-remitted {
            color: #10b981;
            font-weight: 600;
        }

        .running-total {
            font-weight: 600;
            color: #0a2b4e;
        }

        .total-row {
            background: #eef2ff;
            font-weight: bold;
        }

        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 20px;
            font-size: 0.7rem;
            font-weight: 600;
        }

        .status-paid {
            background: #d1fae5;
            color: #065f46;
        }

        .status-partial {
            background: #fef3c7;
            color: #92400e;
        }

        .status-unpaid {
            background: #fee2e2;
            color: #991b1b;
        }

        .overdue-badge {
            background: #dc2626;
            color: white;
            padding: 2px 6px;
            border-radius: 20px;
            font-size: 0.7rem;
        }

        .panel-empty {
            text-align: center;
            padding: 40px;
            color: #64748b;
        }

        .panel-error {
            text-align: center;
            padding: 40px;
            color: #dc2626;
        }

        .loading-spinner {
            text-align: center;
            padding: 40px;
            color: #64748b;
        }

        @media (max-width: 700px) {
            .financial-panel-content {
                max-width: 100%;
            }
            .panel-table {
                font-size: 0.7rem;
            }
            .panel-table th,
            .panel-table td {
                padding: 6px;
            }
        }
    `;
    document.head.appendChild(style);
}

// Initialize sliding panel system
function initSlidingPanel() {
    addSlidingPanelStyles();
}

window.initSlidingPanel = initSlidingPanel;
window.showFinancialDetails = showFinancialDetails;
window.closeFinancialPanel = closeFinancialPanel;

