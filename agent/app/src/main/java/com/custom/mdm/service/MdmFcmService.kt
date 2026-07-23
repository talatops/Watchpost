package com.custom.mdm.service

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.custom.mdm.receiver.CustomDeviceAdminReceiver
import com.custom.mdm.worker.SyncWorker
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives FCM push messages from the Watchpost backend.
 *
 * EXECUTION STRATEGY:
 *  - LOCK / REBOOT / WIPE: executed IMMEDIATELY on a background thread in
 *    onMessageReceived. WorkManager introduces OS-level delays for these
 *    time-sensitive commands.
 *  - SYNC: dispatched to WorkManager (needs network, slight delay is OK).
 *
 * After executing the command, a background sync is triggered to report
 * status back and pick up any additional pending commands.
 */
class MdmFcmService : FirebaseMessagingService() {

    private val TAG = "MdmFcmService"

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.i(TAG, "FCM message received: ${message.data}")

        val type = message.data["type"]
        if (type != "COMMAND") {
            Log.d(TAG, "Ignoring non-command FCM message (type=$type)")
            return
        }

        val command   = message.data["command"]?.uppercase() ?: return
        val payload   = message.data["payload"]   ?: ""
        val commandId = message.data["command_id"] ?: ""

        Log.i(TAG, "FCM COMMAND: $command  payload='$payload'  id=$commandId")

        when (command) {
            "LOCK", "REBOOT", "WIPE" -> {
                // Execute immediately on a dedicated background thread
                Thread {
                    executeImmediately(command, payload)
                    // After executing, sync back to acknowledge and pick up more commands
                    triggerSync(command, payload, commandId)
                }.apply {
                    name = "WatchpostCmd-$command"
                    isDaemon = true
                    start()
                }
            }
            else -> {
                // SYNC and unknown commands go through WorkManager
                triggerSync(command, payload, commandId)
            }
        }
    }

    /**
     * Executes a device management command immediately on the calling thread.
     * Must be called from a background thread (not the main thread).
     */
    private fun executeImmediately(command: String, payload: String) {
        val dpm   = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(this, CustomDeviceAdminReceiver::class.java)

        Log.i(TAG, "executeImmediately: $command")
        try {
            when (command) {
                "LOCK" -> {
                    dpm.lockNow()
                    Log.i(TAG, "LOCK: screen locked via FCM ✓")
                }
                "REBOOT" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        dpm.reboot(admin)
                        Log.i(TAG, "REBOOT: device reboot triggered via FCM ✓")
                    } else {
                        Log.w(TAG, "REBOOT: requires API 24+, skipped")
                    }
                }
                "WIPE" -> {
                    val corporate = payload.contains("CORPORATE", ignoreCase = true)
                    if (corporate) {
                        Log.w(TAG, "WIPE: corporate wipe (managed data only) via FCM")
                        dpm.wipeData(DevicePolicyManager.WIPE_EXTERNAL_STORAGE)
                    } else {
                        Log.w(TAG, "WIPE: full factory reset via FCM")
                        dpm.wipeData(0)
                    }
                }
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "SECURITY ERROR executing $command: ${e.message}. Ensure app is active Device Admin.")
        } catch (e: Exception) {
            Log.e(TAG, "ERROR executing $command: ${e.message}")
        }
    }

    /**
     * Dispatches a SyncWorker to report status back to the backend.
     */
    private fun triggerSync(command: String, payload: String, commandId: String) {
        val data = workDataOf(
            SyncWorker.KEY_COMMAND         to command,
            SyncWorker.KEY_COMMAND_ID      to commandId,
            SyncWorker.KEY_COMMAND_PAYLOAD to payload,
        )
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setInputData(data)
            .build()
        WorkManager.getInstance(applicationContext).enqueue(request)
        Log.d(TAG, "Background sync queued after command: $command")
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "FCM token refreshed: ${token.take(20)}…")
        val prefs = getSharedPreferences("OpenMDM_Prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("fcm_token", token).apply()
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setInputData(workDataOf(SyncWorker.KEY_COMMAND to "SYNC"))
            .build()
        WorkManager.getInstance(applicationContext).enqueue(request)
    }
}
