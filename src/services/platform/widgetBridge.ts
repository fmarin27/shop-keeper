import { Capacitor, registerPlugin } from '@capacitor/core';

type WidgetBridgePlugin = {
  setUnreadCount(options: { count: number }): Promise<void>;
};

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');

export async function syncUnreadWidgetCount(count: number): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') {
    return;
  }

  try {
    await WidgetBridge.setUnreadCount({
      count: Math.max(0, Math.min(999, Math.floor(count))),
    });
  } catch (error) {
    console.error('Failed to sync Android widget count:', error);
  }
}
