package com.custom.mdm.receiver

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.custom.mdm.worker.SyncWorker
import java.util.concurrent.TimeUnit

class CustomDeviceAdminReceiver : DeviceAdminReceiver() {

    private val TAG = "CustomDeviceAdminReceiver"

    companion object {
        private const val SYNC_WORK_NAME = "mdm_periodic_sync"

        /**
         * Schedules (or re-schedules) the periodic sync WorkManager job.
         * Safe to call multiple times — KEEP_EXISTING avoids duplicate work.
         */
        fun schedulePeriodicSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(
                repeatInterval = 15,
                repeatIntervalTimeUnit = TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .setInputData(workDataOf(SyncWorker.KEY_COMMAND to "SYNC"))
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                SYNC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                syncRequest
            )

            Log.i("CustomDeviceAdminReceiver", "Periodic sync work scheduled (15 min interval)")
        }
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "Device Admin Enabled")
        Toast.makeText(context, "OpenMDM Policy Enforcer Active", Toast.LENGTH_SHORT).show()
        schedulePeriodicSync(context)
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.i(TAG, "Device Admin Disabled")
        Toast.makeText(context, "OpenMDM Policy Enforcer Inactive", Toast.LENGTH_SHORT).show()
        // Cancel periodic sync when admin rights are revoked
        WorkManager.getInstance(context).cancelUniqueWork(SYNC_WORK_NAME)
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        Log.i(TAG, "Provisioning Complete")
        Toast.makeText(context, "OpenMDM Provisioning Finished", Toast.LENGTH_LONG).show()
        schedulePeriodicSync(context)
    }

    // NOTE: BOOT_COMPLETED is handled by BootReceiver (separate class)
    // to avoid issues with the BIND_DEVICE_ADMIN permission restriction.
}
