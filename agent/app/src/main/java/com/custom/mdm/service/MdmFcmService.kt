package com.custom.mdm.service

import android.content.Context
import android.util.Log
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.custom.mdm.worker.SyncWorker
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives FCM push messages from the MDM backend.
 *
 * The backend sends a data-only message (no notification block) with keys:
 *   type       = "COMMAND"
 *   command    = "REBOOT" | "LOCK" | "WIPE" | "SYNC"
 *   command_id = UUID string
 *
 * Token refresh events are forwarded back to the backend via SyncWorker so the
 * server always has the latest FCM registration token.
 */
class MdmFcmService : FirebaseMessagingService() {

    private val TAG = "MdmFcmService"

    /** Called when the FCM backend delivers a message. */
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.i(TAG, "FCM message received: ${message.data}")

        val type = message.data["type"] ?: return
        if (type != "COMMAND") {
            Log.d(TAG, "Ignoring non-command FCM message (type=$type)")
            return
        }

        val command = message.data["command"]?.uppercase() ?: return
        val commandId = message.data["command_id"] ?: ""

        Log.i(TAG, "Executing FCM command: $command (id=$commandId)")

        // Dispatch to a background WorkManager job so we don't block the FCM thread
        val workData = workDataOf(
            SyncWorker.KEY_COMMAND to command,
            SyncWorker.KEY_COMMAND_ID to commandId
        )
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setInputData(workData)
            .build()

        WorkManager.getInstance(applicationContext).enqueue(request)
    }

    /**
     * Called whenever FCM assigns a new registration token to this device.
     * We persist it and schedule an immediate sync so the backend is updated.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "FCM token refreshed")

        val prefs = getSharedPreferences("OpenMDM_Prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("fcm_token", token).apply()

        // Trigger an immediate sync so the backend receives the new token
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setInputData(workDataOf(SyncWorker.KEY_COMMAND to "SYNC"))
            .build()
        WorkManager.getInstance(applicationContext).enqueue(request)
    }
}
