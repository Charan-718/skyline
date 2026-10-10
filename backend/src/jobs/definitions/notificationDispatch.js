// notification-dispatch (LLD §7, every minute): one dispatcher pass.
export function createNotificationDispatchJob({ notifications }) {
  return ({ now }) => notifications.dispatchPending({ now });
}
