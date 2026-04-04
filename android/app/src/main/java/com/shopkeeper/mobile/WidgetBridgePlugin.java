package com.shopkeeper.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {
    @PluginMethod
    public void setUnreadCount(PluginCall call) {
        int count = call.getInt("count", 0);
        ShopKeeperWidgetProvider.updateAllWidgets(getContext(), count);
        call.resolve(new JSObject());
    }
}
