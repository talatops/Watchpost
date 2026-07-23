package com.custom.mdm

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.custom.mdm.receiver.CustomDeviceAdminReceiver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.UUID

class MainActivity : AppCompatActivity() {

    private val TAG = "MainActivity"
    private var prefs: SharedPreferences? = null
    private val client = OkHttpClient()

    private var statusText: TextView? = null
    private var serialText: TextView? = null
    private var serverUrlInput: EditText? = null
    private var tokenInput: EditText? = null
    private var enrollButton: Button? = null
    private var syncButton: Button? = null
    private var debugText: TextView? = null

    // ---- Lifecycle ----------------------------------------------------------

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.i(TAG, "onCreate: Activity starting")

        try {
            setContentView(R.layout.activity_main)

            statusText    = findViewById(R.id.statusText)
            serialText    = findViewById(R.id.serialText)
            serverUrlInput = findViewById(R.id.serverUrlInput)
            tokenInput    = findViewById(R.id.tokenInput)
            enrollButton  = findViewById(R.id.enrollButton)
            syncButton    = findViewById(R.id.syncButton)
            debugText     = findViewById(R.id.debugText)

            prefs = getSharedPreferences("OpenMDM_Prefs", Context.MODE_PRIVATE)

            val serial = getDeviceSerial()
            serialText?.text = "Serial: $serial"

            // Populate fields from saved prefs (defaults for emulator testing)
            serverUrlInput?.setText(prefs?.getString("server_url", "http://10.0.2.2:8080"))
            tokenInput?.setText(prefs?.getString("enrollment_token", "WatchpostAgent2024DeviceEnrollSecureTokenABC123XYZ"))

            appendDebug("onCreate OK — DO=${isDeviceOwner()}")
            updateEnrollmentStatusUI()

            enrollButton?.setOnClickListener {
                val serverUrl = serverUrlInput?.text?.toString()?.trim() ?: ""
                val token     = tokenInput?.text?.toString()?.trim() ?: ""
                if (serverUrl.isEmpty() || token.isEmpty()) {
                    Toast.makeText(this, "Please enter all fields", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                prefs?.edit()
                    ?.putString("server_url", serverUrl)
                    ?.putString("enrollment_token", token)
                    ?.apply()
                enrollDevice(serverUrl, token, serial)
            }

            syncButton?.setOnClickListener { triggerSync() }

            // Handle the intent that launched this activity (deep-link or QR scan)
            handleIncomingIntent(intent)

            Log.i(TAG, "onCreate: Setup finished successfully")
        } catch (e: Exception) {
            Log.e(TAG, "onCreate: FATAL ERROR during layout setup", e)
        }
    }

    /**
     * Called when the activity is already running (singleTop) and a new intent
     * arrives — e.g. user scans a second QR code while the app is open.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        Log.i(TAG, "onNewIntent: ${intent.action} / ${intent.dataString}")
        handleIncomingIntent(intent)
    }

    // ---- Deep-link / QR intent handling ------------------------------------

    /**
     * Inspects the incoming [intent] for an enrollment payload and pre-fills the
     * server URL and token fields if one is found.
     *
     * Supported sources:
     *  1. Deep-link URI: openmdm://enroll?server_url=...&token=...&label=...
     *  2. QR JSON body passed as the URI data string in the scheme openmdm-enroll:
     *     The QR code encodes a raw JSON object:
     *       {"server_url":"...","token":"...","label":"..."}
     *     The QR scanner app fires an ACTION_VIEW with the URI set to the raw JSON.
     *  3. Any ACTION_VIEW whose data string is a valid JSON object containing
     *     "server_url" and "token" keys (generic scanner support).
     */
    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return
        if (intent.action != Intent.ACTION_VIEW) return

        val dataUri: Uri? = intent.data
        val dataString: String? = dataUri?.toString()

        if (dataString.isNullOrBlank()) return

        Log.i(TAG, "handleIncomingIntent: received URI: $dataString")

        // Try to extract enrollment params
        val params = extractEnrollmentParams(dataString, dataUri)
        if (params == null) {
            Log.w(TAG, "handleIncomingIntent: could not parse enrollment payload from URI")
            return
        }

        val (serverUrl, token, label) = params
        Log.i(TAG, "handleIncomingIntent: pre-filling from QR — server=$serverUrl label=$label")

        // Pre-fill the fields so the user can review and tap Enroll
        serverUrlInput?.setText(serverUrl)
        tokenInput?.setText(token)

        Toast.makeText(
            this,
            "QR scanned${if (label.isNotEmpty()) " ($label)" else ""} — tap Enroll to continue",
            Toast.LENGTH_LONG
        ).show()
    }

    /**
     * Returns Triple(serverUrl, token, label) parsed from the URI, or null if
     * the URI doesn't carry a valid enrollment payload.
     *
     * Handles two formats:
     *  A) openmdm://enroll?server_url=...&token=...&label=...
     *  B) A string that is itself a JSON object: {"server_url":"...","token":"...","label":"..."}
     */
    private fun extractEnrollmentParams(raw: String, uri: Uri?): Triple<String, String, String>? {
        // Format A: standard query-parameter deep-link
        if (uri != null && uri.scheme == "openmdm" && uri.host == "enroll") {
            val serverUrl = uri.getQueryParameter("server_url") ?: return null
            val token     = uri.getQueryParameter("token")      ?: return null
            val label     = uri.getQueryParameter("label")      ?: ""
            if (serverUrl.isBlank() || token.isBlank()) return null
            return Triple(serverUrl.trim(), token.trim(), label.trim())
        }

        // Format B: the URI data IS the raw JSON (common with generic QR scanners)
        // Strip any scheme prefix that was added by the scanner (e.g. "openmdm-enroll://")
        val jsonCandidate = when {
            raw.startsWith("{") -> raw                        // already bare JSON
            raw.contains("://") -> {
                // Extract everything after the first "://" — what follows may be a JSON object
                val afterScheme = raw.substringAfter("://")
                // Some scanners URL-encode the body; decode it
                Uri.decode(afterScheme)
            }
            else -> Uri.decode(raw)
        }

        return try {
            val json = JSONObject(jsonCandidate)
            val serverUrl = json.optString("server_url", "").trim()
            val token     = json.optString("token", "").trim()
            val label     = json.optString("label", "").trim()
            if (serverUrl.isBlank() || token.isBlank()) null
            else Triple(serverUrl, token, label)
        } catch (e: Exception) {
            Log.d(TAG, "extractEnrollmentParams: not valid JSON — $e")
            null
        }
    }

    // ---- Enrollment status UI ----------------------------------------------

    private fun updateEnrollmentStatusUI() {
        val deviceToken = prefs?.getString("device_token", null)
        val isOwner = isDeviceOwner()

        if (deviceToken != null) {
            statusText?.text = "Status: ENROLLED\nDevice Owner: $isOwner"
            statusText?.setTextColor(Color.parseColor("#4CAF50"))
            enrollButton?.visibility = View.GONE
            syncButton?.visibility   = View.VISIBLE
        } else {
            statusText?.text = "Status: UNENROLLED\nDevice Owner: $isOwner"
            statusText?.setTextColor(Color.parseColor("#F44336"))
            enrollButton?.visibility = View.VISIBLE
            syncButton?.visibility   = View.GONE
        }
    }

    // ---- Enrollment ---------------------------------------------------------

    private fun enrollDevice(serverUrl: String, enrollmentToken: String, serial: String) {
        lifecycleScope.launch {
            enrollButton?.isEnabled = false
            statusText?.text = "Status: ENROLLING..."
            appendDebug("Enrolling → server=$serverUrl token=${enrollmentToken.take(8)}…")

            val success = withContext(Dispatchers.IO) {
                try {
                    val mediaType = "application/json; charset=utf-8".toMediaType()
                    val payload = JSONObject().apply {
                        put("enrollment_token", enrollmentToken)
                        put("serial_number", if (serial == "UNAVAILABLE")
                            "DEMO_" + UUID.randomUUID().toString().substring(0, 8) else serial)
                        put("model", Build.MODEL)
                        put("os_version", "Android ${Build.VERSION.RELEASE}")
                        put("patch_level", Build.VERSION.SECURITY_PATCH)
                    }

                    val request = Request.Builder()
                        .url("$serverUrl/api/v1/device/enroll")
                        .post(payload.toString().toRequestBody(mediaType))
                        .build()

                    client.newCall(request).execute().use { response ->
                        if (response.isSuccessful) {
                            val body = response.body?.string() ?: return@use false
                            val json = JSONObject(body)
                            prefs?.edit()
                                ?.putString("device_token", json.getString("device_token"))
                                ?.putString("device_id",    json.getString("device_id"))
                                ?.apply()
                            true
                        } else {
                            Log.e(TAG, "Enrollment failed: HTTP ${response.code}")
                            false
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Connection error during enroll", e)
                    false
                }
            }

            if (success) {
                appendDebug("Enrollment SUCCESS ✓")
                Toast.makeText(this@MainActivity, "Device enrolled successfully", Toast.LENGTH_SHORT).show()
            } else {
                appendDebug("Enrollment FAILED — check URL/token/cleartext")
                Toast.makeText(this@MainActivity, "Enrollment failed. Check server URL / token.", Toast.LENGTH_LONG).show()
            }
            updateEnrollmentStatusUI()
            enrollButton?.isEnabled = true
        }
    }

    // ---- Sync ---------------------------------------------------------------

    private fun triggerSync() {
        val serverUrl = prefs?.getString("server_url", null) ?: return
        val devToken  = prefs?.getString("device_token", null) ?: return

        lifecycleScope.launch {
            syncButton?.isEnabled = false
            Toast.makeText(this@MainActivity, "Syncing...", Toast.LENGTH_SHORT).show()

            val syncResult = withContext(Dispatchers.IO) {
                try {
                    val mediaType = "application/json; charset=utf-8".toMediaType()
                    val telemetry = com.custom.mdm.telemetry.TelemetryCollector(this@MainActivity).collect()

                    val payload = JSONObject().apply {
                        put("serial_number",       telemetry.serialNumber)
                        put("os_version",          telemetry.osVersion)
                        put("patch_level",         telemetry.patchLevel)
                        put("battery_level",       telemetry.batteryLevel)
                        put("storage_total",       telemetry.storageTotal)
                        put("storage_available",   telemetry.storageAvailable)
                        put("wifi_ssid",           telemetry.wifiSSID)
                        put("installed_apps",      telemetry.installedApps)
                        put("fcm_registration_token", telemetry.fcmToken)
                    }

                    val request = Request.Builder()
                        .url("$serverUrl/api/v1/device/sync")
                        .header("Authorization", "Bearer $devToken")
                        .post(payload.toString().toRequestBody(mediaType))
                        .build()

                    client.newCall(request).execute().use { response ->
                        if (response.isSuccessful) {
                            val body = response.body?.string() ?: return@use "Sync complete (no body)"
                            val json = JSONObject(body)
                            if (json.has("active_policies")) {
                                val policies = json.getJSONArray("active_policies")
                                if (policies.length() > 0) {
                                    val pol = policies.getJSONObject(0)
                                    val evaluator = com.custom.mdm.policy.PolicyEvaluator(this@MainActivity)
                                    evaluator.evaluateAndApply(pol.optString("content_yaml", "{}"))
                                }
                            }
                            "Sync complete: ${response.code}"
                        } else {
                            "Sync failed: Code ${response.code}"
                        }
                    }
                } catch (e: Exception) {
                    "Sync failed: ${e.message}"
                }
            }

            appendDebug("Sync: $syncResult")
            Toast.makeText(this@MainActivity, syncResult, Toast.LENGTH_SHORT).show()
            syncButton?.isEnabled = true
        }
    }

    // ---- Helpers ------------------------------------------------------------

    private fun getDeviceSerial(): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try { Build.getSerial() } catch (e: SecurityException) { "UNAVAILABLE" }
        } else {
            @Suppress("DEPRECATION")
            Build.SERIAL
        }
    }

    private fun dpm_isAdminActive(): Boolean {
        return try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = android.content.ComponentName(this, com.custom.mdm.receiver.CustomDeviceAdminReceiver::class.java)
            dpm.isAdminActive(admin)
        } catch (e: Exception) { false }
    }

    private fun isDeviceOwner(): Boolean {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return dpm.isDeviceOwnerApp(packageName)
    }

    /** Appends a line to the on-screen debug log and Logcat simultaneously. */
    private fun appendDebug(msg: String) {
        val ts = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(java.util.Date())
        val line = "[$ts] $msg"
        Log.d(TAG, "UI_DEBUG: $line")
        runOnUiThread {
            debugText?.visibility = android.view.View.VISIBLE
            val cur = debugText?.text?.toString() ?: ""
            val lines = cur.lines()
            val trimmed = if (lines.size > 10) lines.takeLast(10).joinToString("\n") else cur
            debugText?.text = if (trimmed.isBlank()) line else "$trimmed\n$line"
        }
    }
}
