import React from 'react';
import { FloatingNotification as NotificationType } from '../types/game';

interface FloatingNotificationProps {
  notifications: NotificationType[];
}

export const FloatingNotificationView: React.FC<FloatingNotificationProps> = ({ notifications }) => {
  if (notifications.length === 0) return null;

  return (
    <div className="floating-notifications-container" aria-live="polite">
      {notifications.map(n => (
        <div
          key={n.id}
          className={`floating-pill notification-${n.type}`}
        >
          {n.text}
        </div>
      ))}
    </div>
  );
};
