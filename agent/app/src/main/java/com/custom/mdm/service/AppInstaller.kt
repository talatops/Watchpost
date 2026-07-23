package com.custom.mdm.service

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresPermission
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

class AppInstaller(private val context: Context) {

    private val TAG = "AppInstaller"
    private val client = OkHttpClient()

    /**
     * Downloads an APK from the url and silently installs it
     */
    fun downloadAndInstall(apkUrl: String, packageName: String): Boolean {
        Log.i(TAG, "Starting download for $packageName from $apkUrl")
        val apkFile = File(context.cacheDir, "$packageName.apk")
        
        try {
            // 1. Download APK file
            val request = Request.Builder().url(apkUrl).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.e(TAG, "Failed to download APK: HTTP ${response.code}")
                    return false
                }

                val body = response.body ?: return false
                val inputStream: InputStream = body.byteStream()
                val outputStream = FileOutputStream(apkFile)
                
                val buffer = ByteArray(4096)
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }
                outputStream.flush()
                outputStream.close()
                inputStream.close()
            }
            Log.i(TAG, "Download finished. Starting silent installation...")

            // 2. Install APK silently using Android PackageInstaller
            return installPackage(apkFile, packageName)
        } catch (e: Exception) {
            Log.e(TAG, "Error installing package $packageName", e)
            return false
        } finally {
            if (apkFile.exists()) {
                apkFile.delete()
            }
        }
    }

    /**
     * Silently uninstalls a package using the PackageInstaller API.
     * Requires the app to be a Device Owner or Profile Owner.
     */
    @RequiresPermission(anyOf = [Manifest.permission.REQUEST_DELETE_PACKAGES, Manifest.permission.DELETE_PACKAGES])
    fun uninstallPackage(packageName: String): Boolean {
        Log.i(TAG, "Uninstalling package: $packageName")
        return try {
            val packageInstaller = context.packageManager.packageInstaller
            val intent = Intent(context, AppInstallStatusReceiver::class.java).apply {
                action = "com.custom.mdm.UNINSTALL_COMPLETE"
                putExtra("package_name", packageName)
            }
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pendingIntent = PendingIntent.getBroadcast(context, packageName.hashCode(), intent, flags)
            packageInstaller.uninstall(packageName, pendingIntent.intentSender)
            Log.i(TAG, "Uninstall request sent for $packageName")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to uninstall $packageName", e)
            false
        }
    }

    private fun installPackage(apkFile: File, packageName: String): Boolean {
        val packageInstaller = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(packageName)

        var sessionId = -1
        try {
            sessionId = packageInstaller.createSession(params)
            val session = packageInstaller.openSession(sessionId)

            val out = session.openWrite("COSU_Install", 0, -1)
            val fileIn = apkFile.inputStream()
            val buffer = ByteArray(65536)
            var c: Int
            while (fileIn.read(buffer).also { c = it } != -1) {
                out.write(buffer, 0, c)
            }
            session.fsync(out)
            out.close()
            fileIn.close()

            // Define PendingIntent to receive completion status callback
            val intent = Intent(context, AppInstallStatusReceiver::class.java).apply {
                action = "com.custom.mdm.INSTALL_COMPLETE"
                putExtra("package_name", packageName)
            }
            
            // Standard PendingIntent flags for Android 12+ compatibility (FLAG_MUTABLE or FLAG_IMMUTABLE)
            val flags = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                sessionId,
                intent,
                flags
            )

            session.commit(pendingIntent.intentSender)
            session.close()
            Log.i(TAG, "Installation session $sessionId committed successfully.")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed silent installer session", e)
            if (sessionId != -1) {
                try {
                    packageInstaller.abandonSession(sessionId)
                } catch (ignored: Exception) {}
            }
            return false
        }
    }
}
