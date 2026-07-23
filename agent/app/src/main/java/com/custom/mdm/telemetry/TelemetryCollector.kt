package com.custom.mdm.telemetry

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Collects real device telemetry using Android system APIs.
 * All values are read synchronously on the calling thread — call from a background thread.
 */
class TelemetryCollector(private val context: Context) {

    private val TAG = "TelemetryCollector"

    data class Telemetry(
        val serialNumber: String,
        val model: String,
        val osVersion: String,
        val patchLevel: String,
        val batteryLevel: Int,
        val storageTotal: Long,
        val storageAvailable: Long,
        val wifiSSID: String,
        val installedApps: String, // JSON array string
        val fcmToken: String
    )

    fun collect(): Telemetry {
        return Telemetry(
            serialNumber = getSerial(),
            model = Build.MODEL,
            osVersion = "Android ${Build.VERSION.RELEASE}",
            patchLevel = Build.VERSION.SECURITY_PATCH,
            batteryLevel = getBatteryLevel(),
            storageTotal = getStorageTotal(),
            storageAvailable = getStorageAvailable(),
            wifiSSID = getWifiSSID(),
            installedApps = getInstalledAppsJson(),
            fcmToken = getSavedFcmToken()
        )
    }

    private fun getSerial(): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Build.getSerial()
            } catch (e: SecurityException) {
                Log.w(TAG, "Cannot read serial (no READ_PRIVILEGED_PHONE_STATE): ${e.message}")
                "DEMO_${Build.FINGERPRINT.hashCode().and(0xFFFFFF).toString(16)}"
            }
        } else {
            @Suppress("DEPRECATION")
            Build.SERIAL
        }
    }

    private fun getBatteryLevel(): Int {
        return try {
            val intentFilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus: Intent? = context.registerReceiver(null, intentFilter)
            val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level == -1 || scale == -1) -1
            else (level.toFloat() / scale.toFloat() * 100).toInt()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read battery level: ${e.message}")
            -1
        }
    }

    private fun getStorageTotal(): Long {
        return try {
            val stat = StatFs(Environment.getDataDirectory().path)
            stat.blockCountLong * stat.blockSizeLong
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read storage total: ${e.message}")
            0L
        }
    }

    private fun getStorageAvailable(): Long {
        return try {
            val stat = StatFs(Environment.getDataDirectory().path)
            stat.availableBlocksLong * stat.blockSizeLong
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read storage available: ${e.message}")
            0L
        }
    }

    private fun getWifiSSID(): String {
        return try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val info = wifiManager.connectionInfo
            // Android strips quotes from SSID
            val raw = info?.ssid ?: "<unknown ssid>"
            if (raw.startsWith("\"") && raw.endsWith("\"")) raw.drop(1).dropLast(1) else raw
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read Wi-Fi SSID: ${e.message}")
            ""
        }
    }

    private fun getInstalledAppsJson(): String {
        return try {
            val pm = context.packageManager
            // Only include non-system packages to keep the payload lean
            val packages = pm.getInstalledPackages(0)
                .filter { pkg ->
                    val appInfo = pkg.applicationInfo
                    appInfo != null && (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) == 0
                }
                .take(100) // cap at 100 apps to avoid oversized payloads

            val arr = JSONArray()
            for (pkg in packages) {
                val obj = JSONObject().apply {
                    put("package", pkg.packageName)
                    put("version", pkg.versionName ?: "")
                    put("version_code", pkg.longVersionCode)
                }
                arr.put(obj)
            }
            arr.toString()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read installed apps: ${e.message}")
            "[]"
        }
    }

    private fun getSavedFcmToken(): String {
        val prefs = context.getSharedPreferences("OpenMDM_Prefs", Context.MODE_PRIVATE)
        return prefs.getString("fcm_token", "") ?: ""
    }
}
