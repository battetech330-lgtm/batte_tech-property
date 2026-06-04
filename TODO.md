# TODO - Notification updates

- [x] Inspect `notifications.js` for existing notification trigger functions and messaging helpers

- [x] Implement `notifyAllRelevantUsers(propertyId, action, details, amount, roomNumber, tenantName)` in `notifications.js`

- [x] Add missing helper functions used by the dispatcher (`getNotificationTitle`, `getNotificationMessage`) consistent with existing action keys

- [x] Refactor existing trigger functions (payment/room/evacuation/remittance/bill) to delegate to `notifyAllRelevantUsers`

- [ ] Ensure `window.*` exports include the new dispatcher
- [ ] Sanity check by running a quick search for unresolved references in `notifications.js`
- [ ] Manual functional test checklist (payment request/approve/reject, room occupied/vacated, evacuation, remittance, bill paid)
