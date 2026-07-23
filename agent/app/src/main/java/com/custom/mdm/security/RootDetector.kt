package com.custom.mdm.security

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

/**
 * Checks the device for common root indicators.
 *
 * Checks performed:
 *  (a) Presence of `su` binary in well-known paths
 *  (b) Magisk manager package installed (com.topjohnwu.magisk)
 *  (c) Build.TAGS contains "test-keys"
 *  (d) /system partition is mounted writable
 */
data class RootCheckResult(
    val isRooted: Boolean,
    val reasons: List<String>
)

object RootDetector {

    private const val TAG = "RootDetector"

    private val SU_PATHS = listOf(
        "/system/bin/su",
        "/system/xbin/su",
        "/sbin/su",
        "/system/su",
        "/system/bin/.ext/.su",
        "/system/usr/we-need-root/su-backup",
        "/system/xbin/mu"
    )

    private const val MAGISK_PACKAGE = "com.topjohnwu.magisk"

    fun check(context: Context): RootCheckResult {
        val reasons = mutableListOf<String>()

        // (a) su binary check
        val suPath = detectSuBinary()
        if (suPath != null) {
            Log.w(TAG, "su binary found at: $suPath")
            reasons.add("su binary found at $suPath")
        }

        // (b) Magisk package check
        if (isMagiskInstalled(context)) {
            Log.w(TAG, "Magisk package detected: $MAGISK_PACKAGE")
            reasons.add("Magisk package installed ($MAGISK_PACKAGE)")
        }

        // (c) test-keys in Build.TAGS
        if (hasTestKeys()) {
            Log.w(TAG, "Build.TAGS contains test-keys: ${Build.TAGS}")
            reasons.add("Build signed with test-keys (Build.TAGS=${Build.TAGS})")
        }

        // (d) writable /system mount
        if (isSystemMountedWritable()) {
            Log.w(TAG, "/system partition appears to be mounted read-write")
            reasons.add("/system partition is mounted read-write")
        }

        val isRooted = reasons.isNotEmpty()
        if (isRooted) {
            Log.w(TAG, "Root detected — ${reasons.size} indicator(s): ${reasons.joinToString("; ")}")
        } else {
            Log.d(TAG, "No root indicators detected")
        }

        return RootCheckResult(isRooted = isRooted, reasons = reasons)
    }

    // ---- Individual checks --------------------------------------------------

    private fun detectSuBinary(): String? {
        for (path in SU_PATHS) {
            try {
                if (File(path).exists()) {
                    return path
                }
            } catch (_: Exception) {
                // SecurityException or similar — can't read path, treat as absent
            }
        }
        return null
    }

    private fun isMagiskInstalled(context: Context): Boolean {
        return try {
            context.packageManager.getPackageInfo(MAGISK_PACKAGE, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }

    private fun hasTestKeys(): Boolean {
        val tags = Build.TAGS ?: return false
        return tags.contains("test-keys")
    }

    /**
     * Reads /proc/mounts and checks whether /system is listed as "rw".
     * Returns false on any IO error (fail-safe).
     */
    private fun isSystemMountedWritable(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec("mount")
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            reader.useLines { lines ->
                lines.any { line ->
                    // Typical mount line: /dev/block/... /system ext4 ro,...
                    // or: rootfs / rootfs rw,...
                    val parts = line.split(" ")
                    // mountpoint is index 1, options are index 3
                    if (parts.size >= 4) {
                        val mountPoint = parts[1]
                        val options = parts[3]
                        mountPoint == "/system" && options.split(",").any { it == "rw" }
                    } else false
                }
            }
        } catch (e: Exception) {
            Log.d(TAG, "Could not read mount info: ${e.message}")
            false
        }
    }
}
