package com.custom.mdm.worker

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.custom.mdm.policy.PolicyEvaluator
import com.custom.mdm.receiver.CustomDeviceAdminReceiver
import com.custom.mdm.security.RootDetector
import com.custom.mdm.service.AppInstaller
import com.custom.mdm.telemetry.TelemetryCollector
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * CoroutineWorker that handles:
 *  1. Periodic device check-in (telemetry + policy sync + pending command delivery)
 *  2. Immediate FCM-triggered command execution (REBOOT, LOCK, WIPE, SYNC)
 *
 * Scheduled periodically via WorkManager.enqueueUniquePeriodicWork in the
 * [CustomDeviceAdminReceiver] boot/provisioning callbacks.
 */
class SyncWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        const val KEY_COMMAND = "command"
        const val KEY_COMMAND_ID = "command_id"
        const val KEY_COMMAND_PAYLOAD = "command_payload"
        private const val TAG = "SyncWorker"
        private val MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val prefs by lazy { context.getSharedPreferences("OpenMDM_Prefs", Context.MODE_PRIVATE) }

    override suspend fun doWork(): Result {
        // Step 1: Execute any FCM-injected device command FIRST.
        // LOCK / REBOOT / WIPE are LOCAL operations — they don't need network.
        // We execute them before attempting sync so they run even if the network is down.
        val fcmCommand = inputData.getString(KEY_COMMAND)
        val fcmPayload = inputData.getString(KEY_COMMAND_PAYLOAD) ?: ""
        if (!fcmCommand.isNullOrEmpty() && fcmCommand != "SYNC") {
            Log.i(TAG, "FCM command received: $fcmCommand — executing before sync")
            executeCommand(fcmCommand, fcmPayload)
        }

        // Step 2: Attempt network sync to report telemetry and fetch pending commands.
        // This is best-effort — a sync failure does NOT undo the command above.
        val serverUrl = prefs.getString("server_url", null)
        val deviceToken = prefs.getString("device_token", null)
        if (serverUrl == null || deviceToken == null) {
            Log.w(TAG, "No server URL or device token — skipping network sync")
            return if (fcmCommand != null) Result.success() else Result.failure()
        }

        return performSync(serverUrl, deviceToken)
    }

    // ---- Sync ---------------------------------------------------------------

    private fun performSync(serverUrl: String, deviceToken: String): Result {
        return try {
            val telemetry = TelemetryCollector(context).collect()

            // Run root detection before building the sync payload
            val rootResult = RootDetector.check(context)

            val payload = JSONObject().apply {
                put("serial_number", telemetry.serialNumber)
                put("os_version", telemetry.osVersion)
                put("patch_level", telemetry.patchLevel)
                put("battery_level", telemetry.batteryLevel)
                put("storage_total", telemetry.storageTotal)
                put("storage_available", telemetry.storageAvailable)
                put("wifi_ssid", telemetry.wifiSSID)
                put("installed_apps", telemetry.installedApps)
                put("fcm_registration_token", telemetry.fcmToken)
                // Root detection field — backend records this against the device row
                put("is_rooted", rootResult.isRooted)
            }

            val request = Request.Builder()
                .url("$serverUrl/api/v1/device/sync")
                .header("Authorization", "Bearer $deviceToken")
                .post(payload.toString().toRequestBody(MEDIA_TYPE))
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.e(TAG, "Sync HTTP error: ${response.code}")
                    return Result.retry()
                }

                val body = response.body?.string() ?: return Result.success()
                val json = JSONObject(body)

                // If rooted, immediately report a NON_COMPLIANT event for "root-detection"
                if (rootResult.isRooted) {
                    val errorMsg = rootResult.reasons.joinToString("; ")
                    Log.w(TAG, "Device is rooted — reporting NON_COMPLIANT for root-detection: $errorMsg")
                    reportCompliance(serverUrl, deviceToken, "root-detection", false, errorMsg)
                }

                // Process active policies
                processPolicies(json, serverUrl, deviceToken)

                // Process app deployments
                processAppDeployments(json)

                // Process pending commands delivered via sync (fallback when FCM is unavailable)
                processPendingActions(json)

                Log.i(TAG, "Sync complete")
                Result.success()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed: ${e.message}")
            Result.retry()
        }
    }

    // ---- Policy processing --------------------------------------------------

    private fun processPolicies(syncJson: JSONObject, serverUrl: String, deviceToken: String) {
        // Use optJSONArray — returns null safely if field is missing or JSON null
        val policies = syncJson.optJSONArray("active_policies") ?: return
        val evaluator = PolicyEvaluator(context)

        for (i in 0 until policies.length()) {
            val pol = policies.getJSONObject(i)
            val policyId = pol.optString("id", "")
            val contentYaml = pol.optString("content_yaml", "{}")

            // Convert YAML-like content to JSON for the evaluator
            val policyJson = yamlLikeToJson(contentYaml)
            val (success, message) = evaluator.evaluateAndApply(policyJson)

            Log.i(TAG, "Policy $policyId applied=$success msg=$message")
            reportCompliance(serverUrl, deviceToken, policyId, success, message)
        }
    }

    /**
     * Extremely lightweight YAML→JSON converter that handles the flat key: value
     * structure used in our policy YAML. A full YAML parser is not needed here.
     */
    private fun yamlLikeToJson(yamlContent: String): String {
        // If it already looks like JSON, return as-is
        val trimmed = yamlContent.trim()
        if (trimmed.startsWith("{")) return trimmed

        val obj = JSONObject()
        for (line in yamlContent.lines()) {
            val stripped = line.trim()
            if (stripped.isEmpty() || stripped == "policy:" || stripped.startsWith("#")) continue

            val colonIdx = stripped.indexOf(':')
            if (colonIdx < 0) continue

            val key = stripped.substring(0, colonIdx).trim()
            val value = stripped.substring(colonIdx + 1).trim().removeSurrounding("\"")

            when {
                value.equals("true", ignoreCase = true) -> obj.put(key, true)
                value.equals("false", ignoreCase = true) -> obj.put(key, false)
                value.toIntOrNull() != null -> obj.put(key, value.toInt())
                value.toLongOrNull() != null -> obj.put(key, value.toLong())
                value.isNotEmpty() -> obj.put(key, value)
            }
        }
        return obj.toString()
    }

    private fun reportCompliance(serverUrl: String, deviceToken: String, policyId: String, success: Boolean, message: String) {
        try {
            val report = JSONObject().apply {
                put("policy_id", policyId)
                put("status", if (success) "COMPLIANT" else "NON_COMPLIANT")
                put("error_message", message)
            }
            val payload = JSONObject().apply {
                put("policy_reports", JSONArray().apply { put(report) })
            }
            val req = Request.Builder()
                .url("$serverUrl/api/v1/device/compliance")
                .header("Authorization", "Bearer $deviceToken")
                .post(payload.toString().toRequestBody(MEDIA_TYPE))
                .build()
            client.newCall(req).execute().close()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to report compliance: ${e.message}")
        }
    }

    // ---- App deployments ----------------------------------------------------

    private fun processAppDeployments(syncJson: JSONObject) {
        val deployments = syncJson.optJSONArray("app_deployments") ?: return
        val installer = AppInstaller(context)

        for (i in 0 until deployments.length()) {
            val dep = deployments.getJSONObject(i)
            val packageName = dep.optString("package_name", "")
            val apkUrl = dep.optString("apk_url", "")
            val installType = dep.optString("install_type", "FORCE_INSTALL")

            if (packageName.isEmpty() || apkUrl.isEmpty()) continue

            when (installType.uppercase()) {
                "FORCE_INSTALL" -> {
                    Log.i(TAG, "Silently installing $packageName from $apkUrl")
                    val ok = installer.downloadAndInstall(apkUrl, packageName)
                    Log.i(TAG, "Install result for $packageName: $ok")
                }
                "BLOCKED" -> {
                    try {
                        context.packageManager.getPackageInfo(packageName, 0)
                        Log.i(TAG, "Uninstalling blocked package: $packageName")
                        installer.uninstallPackage(packageName)
                    } catch (_: Exception) {
                        // Package not installed, nothing to do
                    }
                }
                else -> Log.d(TAG, "Skipping app $packageName (install_type=$installType)")
            }
        }
    }

    // ---- Pending commands ---------------------------------------------------

    private fun processPendingActions(syncJson: JSONObject) {
        val actions = syncJson.optJSONArray("pending_actions") ?: return
        for (i in 0 until actions.length()) {
            // pending_actions may be plain strings or objects with {command, payload}
            val item = actions.get(i)
            when (item) {
                is String -> executeCommand(item, "")
                is JSONObject -> executeCommand(
                    item.optString("command", ""),
                    item.optString("payload", "")
                )
            }
        }
    }

    // ---- Command execution --------------------------------------------------

    private fun executeCommand(command: String, payload: String) {
        if (command.isEmpty()) return
        Log.i(TAG, "Executing command: $command payload: $payload")
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(context, CustomDeviceAdminReceiver::class.java)

        try {
            when (command.uppercase()) {
                "LOCK" -> {
                    dpm.lockNow()
                    Log.i(TAG, "Screen locked by remote command")
                }
                "REBOOT" -> {
                    // Guard: don't reboot within 60 seconds of first enrollment
                    // to prevent accidental reboot loops during install
                    val enrolledAt = prefs.getLong("enrolled_at_ms", 0L)
                    val secondsSinceEnroll = (System.currentTimeMillis() - enrolledAt) / 1000
                    if (enrolledAt > 0 && secondsSinceEnroll < 60) {
                        Log.w(TAG, "REBOOT suppressed — device enrolled only ${secondsSinceEnroll}s ago (cooldown 60s)")
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        dpm.reboot(admin)
                        Log.i(TAG, "Device reboot triggered")
                    } else {
                        Log.w(TAG, "Reboot requires API 24+")
                    }
                }
                "WIPE" -> {
                    // Distinguish corporate wipe vs full factory reset based on payload
                    val isCorporate = payload.contains("CORPORATE", ignoreCase = true)
                    if (isCorporate) {
                        Log.w(TAG, "WIPE command received — initiating corporate (work data) wipe")
                        // WIPE_EXTERNAL_STORAGE = 1; wipes only managed data, preserves personal data
                        dpm.wipeData(DevicePolicyManager.WIPE_EXTERNAL_STORAGE)
                    } else {
                        Log.w(TAG, "WIPE command received — initiating full factory reset")
                        dpm.wipeData(0)
                    }
                }
                "SYNC" -> {
                    Log.i(TAG, "SYNC command — re-sync already triggered by this job")
                }
                else -> Log.w(TAG, "Unknown command: $command")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to execute command $command: ${e.message}")
        }
    }
}
