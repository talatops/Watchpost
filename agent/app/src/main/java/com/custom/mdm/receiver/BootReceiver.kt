package com.custom.mdm.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Dedicated receiver for ACTION_BOOT_COMPLETED.
 *
 * Kept separate from CustomDeviceAdminReceiver because the admin receiver
 * requires BIND_DEVICE_ADMIN permission which prevents it from receiving
 * normal system broadcasts like BOOT_COMPLETED on some Android versions.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        Log.i("BootReceiver", "Boot completed — scheduling periodic sync")
        CustomDeviceAdminReceiver.schedulePeriodicSync(context)
    }
}
