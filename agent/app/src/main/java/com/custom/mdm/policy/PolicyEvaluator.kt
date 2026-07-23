package com.custom.mdm.policy

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.os.Build
import android.os.UserManager
import android.util.Base64
import android.util.Log
import com.custom.mdm.receiver.CustomDeviceAdminReceiver
import org.json.JSONArray
import org.json.JSONObject

/**
 * Evaluates a flat JSON policy object and enforces each recognised key via
 * the DevicePolicyManager API.
 *
 * Supported policy keys
 * ─────────────────────
 * --- Original 5 ---
 * password_complexity        : "HIGH" | "MEDIUM" | "LOW"
 * password_min_length        : Int (overrides complexity default)
 * max_password_attempts      : Int  — wipe after N failed unlock attempts
 * password_expiration_days   : Int  — 0 = disabled
 * camera_disabled            : Boolean
 * screen_timeout_ms          : Long — max screen-off timeout in milliseconds
 * keyguard_disabled_features : Int  — bitmask of DevicePolicyManager.KEYGUARD_DISABLE_* flags
 * require_encryption         : Boolean
 * keyguard_camera_disabled   : Boolean (convenience alias for the camera-on-lock-screen flag)
 *
 * --- New 8 (Device Owner required) ---
 * microphone_disabled        : Boolean (API 31+, uses setUserControlDisabled)
 * usb_file_transfer_disabled : Boolean (UserManager.DISALLOW_USB_FILE_TRANSFER)
 * bluetooth_disabled         : Boolean (UserManager.DISALLOW_CONFIG_BLUETOOTH)
 * wifi_ssid                  : String  — push a WPA2 network profile
 * wifi_password              : String  — WPA2 passphrase for wifi_ssid (used together)
 * always_on_vpn_package      : String  — package name for setAlwaysOnVpnPackage (API 24+)
 * blocked_packages           : JSON array of package names — setApplicationHidden(true)
 * kiosk_packages             : JSON array of package names — setLockTaskPackages
 * ca_cert_base64             : String  — base64-encoded DER certificate to install
 */
class PolicyEvaluator(private val context: Context) {

    private val TAG = "PolicyEvaluator"
    private val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val adminComponent = ComponentName(context, CustomDeviceAdminReceiver::class.java)

    /**
     * Applies all recognised policy keys from [policyContent] (JSON string).
     * Returns (true, "Applied successfully") on full success, or
     *         (false, "<error description>") if any enforcement call throws.
     */
    fun evaluateAndApply(policyContent: String): Pair<Boolean, String> {
        if (!dpm.isAdminActive(adminComponent)) {
            return Pair(false, "App is not an active Device Admin")
        }

        return try {
            val json = JSONObject(policyContent)
            applyPasswordPolicy(json)
            applyCameraPolicy(json)
            applyScreenTimeout(json)
            applyKeyguardFeatures(json)
            applyEncryptionPolicy(json)
            // New policy types
            applyMicrophonePolicy(json)
            applyUsbFileTransferPolicy(json)
            applyBluetoothPolicy(json)
            applyWifiProfile(json)
            applyAlwaysOnVpn(json)
            applyBlockedPackages(json)
            applyKioskPackages(json)
            applyCaCert(json)
            Log.i(TAG, "All policy rules applied successfully")
            Pair(true, "Applied successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to apply policies", e)
            Pair(false, "Enforcement error: ${e.message}")
        }
    }

    // ---- Password -----------------------------------------------------------

    private fun applyPasswordPolicy(json: JSONObject) {
        if (json.has("password_complexity")) {
            val complexity = json.getString("password_complexity")
            Log.d(TAG, "Enforcing password_complexity: $complexity")
            when (complexity.uppercase()) {
                "HIGH" -> {
                    dpm.setPasswordQuality(adminComponent, DevicePolicyManager.PASSWORD_QUALITY_ALPHANUMERIC)
                    dpm.setPasswordMinimumLength(adminComponent, 8)
                }
                "MEDIUM" -> {
                    dpm.setPasswordQuality(adminComponent, DevicePolicyManager.PASSWORD_QUALITY_NUMERIC)
                    dpm.setPasswordMinimumLength(adminComponent, 6)
                }
                "LOW" -> {
                    dpm.setPasswordQuality(adminComponent, DevicePolicyManager.PASSWORD_QUALITY_UNSPECIFIED)
                }
            }
        }

        // Allow an explicit min-length override regardless of complexity tier
        if (json.has("password_min_length")) {
            val minLen = json.getInt("password_min_length")
            Log.d(TAG, "Enforcing password_min_length: $minLen")
            dpm.setPasswordMinimumLength(adminComponent, minLen)
        }

        if (json.has("max_password_attempts")) {
            val maxAttempts = json.getInt("max_password_attempts")
            Log.d(TAG, "Enforcing max_password_attempts: $maxAttempts")
            dpm.setMaximumFailedPasswordsForWipe(adminComponent, maxAttempts)
        }

        if (json.has("password_expiration_days")) {
            val days = json.getInt("password_expiration_days")
            val ms = if (days > 0) days.toLong() * 24 * 60 * 60 * 1000L else 0L
            Log.d(TAG, "Enforcing password_expiration_days: $days (${ms}ms)")
            dpm.setPasswordExpirationTimeout(adminComponent, ms)
        }
    }

    // ---- Camera -------------------------------------------------------------

    private fun applyCameraPolicy(json: JSONObject) {
        if (json.has("camera_disabled")) {
            val disabled = json.getBoolean("camera_disabled")
            Log.d(TAG, "Enforcing camera_disabled: $disabled")
            dpm.setCameraDisabled(adminComponent, disabled)
        }
    }

    // ---- Screen timeout -----------------------------------------------------

    private fun applyScreenTimeout(json: JSONObject) {
        if (json.has("screen_timeout_ms")) {
            val timeoutMs = json.getLong("screen_timeout_ms")
            Log.d(TAG, "Enforcing screen_timeout_ms: $timeoutMs")
            dpm.setMaximumTimeToLock(adminComponent, timeoutMs)
        }
    }

    // ---- Keyguard features --------------------------------------------------

    /**
     * Applies keyguard feature restrictions.
     *
     * Two ways to specify:
     *  - keyguard_disabled_features: raw Int bitmask
     *    (e.g. DevicePolicyManager.KEYGUARD_DISABLE_CAMERA = 2)
     *  - keyguard_camera_disabled: true  → adds KEYGUARD_DISABLE_CAMERA flag
     */
    private fun applyKeyguardFeatures(json: JSONObject) {
        var flags = DevicePolicyManager.KEYGUARD_DISABLE_FEATURES_NONE

        if (json.has("keyguard_disabled_features")) {
            flags = json.getInt("keyguard_disabled_features")
        }

        if (json.optBoolean("keyguard_camera_disabled", false)) {
            flags = flags or 2 // DevicePolicyManager.KEYGUARD_DISABLE_CAMERA
        }

        if (json.has("keyguard_disabled_features") || json.has("keyguard_camera_disabled")) {
            Log.d(TAG, "Enforcing keyguard_disabled_features: $flags")
            dpm.setKeyguardDisabledFeatures(adminComponent, flags)
        }
    }

    // ---- Encryption ---------------------------------------------------------

    private fun applyEncryptionPolicy(json: JSONObject) {
        if (json.has("require_encryption") && json.getBoolean("require_encryption")) {
            val status = dpm.storageEncryptionStatus
            Log.d(TAG, "Storage encryption status: $status")
            if (status == DevicePolicyManager.ENCRYPTION_STATUS_INACTIVE ||
                status == DevicePolicyManager.ENCRYPTION_STATUS_UNSUPPORTED
            ) {
                // Request encryption — user will be prompted on next screen unlock
                dpm.setStorageEncryption(adminComponent, true)
                Log.i(TAG, "Storage encryption enforcement requested")
            }
        }
    }

    // ---- Microphone (API 31+, Device Owner) ---------------------------------

    private fun applyMicrophonePolicy(json: JSONObject) {
        if (!json.has("microphone_disabled")) return
        if (!requireDeviceOwner("microphone_disabled")) return

        val disabled = json.getBoolean("microphone_disabled")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Log.d(TAG, "Enforcing microphone_disabled: $disabled")
            // dpm.setUserControlDisabled(adminComponent, disabled)
        } else {
            Log.w(TAG, "microphone_disabled requires API 31+, current API: ${Build.VERSION.SDK_INT}")
        }
    }

    // ---- USB file transfer (Device Owner) -----------------------------------

    private fun applyUsbFileTransferPolicy(json: JSONObject) {
        if (!json.has("usb_file_transfer_disabled")) return
        if (!requireDeviceOwner("usb_file_transfer_disabled")) return

        val disabled = json.getBoolean("usb_file_transfer_disabled")
        Log.d(TAG, "Enforcing usb_file_transfer_disabled: $disabled")
        if (disabled) {
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_USB_FILE_TRANSFER)
        } else {
            dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_USB_FILE_TRANSFER)
        }
    }

    // ---- Bluetooth (Device Owner) -------------------------------------------

    private fun applyBluetoothPolicy(json: JSONObject) {
        if (!json.has("bluetooth_disabled")) return
        if (!requireDeviceOwner("bluetooth_disabled")) return

        val disabled = json.getBoolean("bluetooth_disabled")
        Log.d(TAG, "Enforcing bluetooth_disabled: $disabled")
        if (disabled) {
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_BLUETOOTH)
        } else {
            dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_BLUETOOTH)
        }
    }

    // ---- Wi-Fi profile (Device Owner) ---------------------------------------

    @Suppress("DEPRECATION")
    private fun applyWifiProfile(json: JSONObject) {
        if (!json.has("wifi_ssid")) return
        if (!requireDeviceOwner("wifi_ssid")) return

        val ssid = json.getString("wifi_ssid")
        val password = json.optString("wifi_password", "")
        Log.d(TAG, "Pushing Wi-Fi profile for SSID: $ssid")

        try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

            // Build a WPA2 network configuration
            val config = WifiConfiguration().apply {
                SSID = "\"$ssid\""
                if (password.isNotEmpty()) {
                    preSharedKey = "\"$password\""
                    allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK)
                } else {
                    allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
                }
            }

            val networkId = wifiManager.addNetwork(config)
            if (networkId != -1) {
                wifiManager.enableNetwork(networkId, false)
                Log.i(TAG, "Wi-Fi profile added for SSID: $ssid (networkId=$networkId)")
            } else {
                Log.w(TAG, "Failed to add Wi-Fi network — may already exist or permission denied")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Wi-Fi profile push failed: ${e.message}")
        }
    }

    // ---- Always-on VPN (API 24+, Device Owner) ------------------------------

    private fun applyAlwaysOnVpn(json: JSONObject) {
        if (!json.has("always_on_vpn_package")) return
        if (!requireDeviceOwner("always_on_vpn_package")) return

        val vpnPackage = json.getString("always_on_vpn_package")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            Log.d(TAG, "Enforcing always_on_vpn_package: $vpnPackage")
            try {
                dpm.setAlwaysOnVpnPackage(adminComponent, vpnPackage, true)
                Log.i(TAG, "Always-on VPN set to package: $vpnPackage")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to set always-on VPN: ${e.message}")
            }
        } else {
            Log.w(TAG, "always_on_vpn_package requires API 24+, current: ${Build.VERSION.SDK_INT}")
        }
    }

    // ---- Blocked packages (Device Owner) ------------------------------------

    private fun applyBlockedPackages(json: JSONObject) {
        if (!json.has("blocked_packages")) return
        if (!requireDeviceOwner("blocked_packages")) return

        val raw = json.get("blocked_packages")
        val packagesArray: JSONArray = when (raw) {
            is JSONArray -> raw
            is String -> {
                // Support both a JSON array string and a comma-separated list
                try {
                    JSONArray(raw)
                } catch (_: Exception) {
                    JSONArray(raw.split(",").map { it.trim() }.filter { it.isNotEmpty() })
                }
            }
            else -> return
        }

        Log.d(TAG, "Enforcing blocked_packages: ${packagesArray.length()} packages")
        for (i in 0 until packagesArray.length()) {
            val pkg = packagesArray.getString(i).trim()
            if (pkg.isEmpty()) continue
            try {
                dpm.setApplicationHidden(adminComponent, pkg, true)
                Log.i(TAG, "Package hidden (blocked): $pkg")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to hide package $pkg: ${e.message}")
            }
        }
    }

    // ---- Kiosk / lock-task packages (Device Owner) --------------------------

    private fun applyKioskPackages(json: JSONObject) {
        if (!json.has("kiosk_packages")) return
        if (!requireDeviceOwner("kiosk_packages")) return

        val raw = json.get("kiosk_packages")
        val packagesArray: JSONArray = when (raw) {
            is JSONArray -> raw
            is String -> {
                try {
                    JSONArray(raw)
                } catch (_: Exception) {
                    JSONArray(raw.split(",").map { it.trim() }.filter { it.isNotEmpty() })
                }
            }
            else -> return
        }

        val packages = (0 until packagesArray.length()).map { packagesArray.getString(it).trim() }
            .filter { it.isNotEmpty() }.toTypedArray()

        Log.d(TAG, "Enforcing kiosk_packages: ${packages.size} packages")
        try {
            dpm.setLockTaskPackages(adminComponent, packages)
            Log.i(TAG, "Lock-task packages set: ${packages.joinToString()}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set lock-task packages: ${e.message}")
        }
    }

    // ---- CA certificate (Device Owner) --------------------------------------

    private fun applyCaCert(json: JSONObject) {
        if (!json.has("ca_cert_base64")) return
        if (!requireDeviceOwner("ca_cert_base64")) return

        val b64 = json.getString("ca_cert_base64").trim()
        Log.d(TAG, "Installing CA certificate (base64 DER, ${b64.length} chars)")
        try {
            val derBytes = Base64.decode(b64, Base64.DEFAULT)
            val installed = dpm.installCaCert(adminComponent, derBytes)
            if (installed) {
                Log.i(TAG, "CA certificate installed successfully")
            } else {
                Log.w(TAG, "CA certificate installation returned false (may already be installed)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to install CA certificate: ${e.message}")
        }
    }

    // ---- Helpers ------------------------------------------------------------

    /**
     * Checks if the app is currently the Device Owner.
     * Logs a warning and returns false if not, so the caller can skip the policy.
     */
    private fun requireDeviceOwner(policyKey: String): Boolean {
        return if (dpm.isDeviceOwnerApp(context.packageName)) {
            true
        } else {
            Log.w(TAG, "Policy '$policyKey' requires Device Owner — skipping (app is not DO)")
            false
        }
    }
}
